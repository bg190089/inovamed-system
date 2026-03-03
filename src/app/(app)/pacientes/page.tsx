'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { PacienteService, AtendimentoService, TriagemService, DocumentoService } from '@/lib/services';
import type { Triagem } from '@/lib/services/triagemService';
import type { DocumentoPaciente } from '@/lib/services/documentoService';
import { toast } from 'sonner';
import { formatDate, calcularIdade, maskCPF, maskCNS, maskPhone, cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui';
import type { Paciente, Atendimento } from '@/types';
import QRCode from 'qrcode';

const DOC_TIPOS = [
  { value: 'tcle', label: 'Termo de Consentimento (TCLE)' },
  { value: 'relatorio_medico', label: 'Relatorio Medico' },
  { value: 'exame_externo', label: 'Exame Externo' },
  { value: 'documento_pessoal', label: 'Documento Pessoal' },
  { value: 'outro', label: 'Outro' },
];

export default function PacientesPage() {
  const { user, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const pacienteService = useMemo(() => new PacienteService(supabase), [supabase]);
  const atendimentoService = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const triagemService = useMemo(() => new TriagemService(supabase), [supabase]);
  const documentoService = useMemo(() => new DocumentoService(supabase), [supabase]);

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Paciente[]>([]);
  const [searching, setSearching] = useState(false);

  // Selected patient
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [triagens, setTriagens] = useState<Triagem[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoPaciente[]>([]);
  const [activeTab, setActiveTab] = useState<'prontuario' | 'documentos'>('prontuario');
  const [loadingProntuario, setLoadingProntuario] = useState(false);

  // Upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTipo, setUploadTipo] = useState('tcle');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // QR Code
  const [showQR, setShowQR] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const qrChannelRef = useRef<any>(null);

  // Search with debounce
  useEffect(() => {
    const t = setTimeout(async () => {
      if (searchTerm.length < 3) { setSearchResults([]); return; }
      setSearching(true);
      try {
        const results = await pacienteService.buscar(searchTerm);
        setSearchResults(results);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, pacienteService]);

  // Load patient prontuario
  const loadProntuario = useCallback(async (paciente: Paciente) => {
    setLoadingProntuario(true);
    try {
      const [triagemData, atendData, docData] = await Promise.all([
        triagemService.getHistoricoPaciente(paciente.id),
        atendimentoService.getHistoricoPaciente(paciente.id, 100),
        documentoService.getByPaciente(paciente.id),
      ]);
      setTriagens(triagemData);
      setAtendimentos(atendData);
      setDocumentos(docData);
    } catch (err: any) {
      toast.error('Erro ao carregar prontuario');
    }
    setLoadingProntuario(false);
  }, [triagemService, atendimentoService, documentoService]);

  function selectPaciente(pac: Paciente) {
    setSelectedPaciente(pac);
    setSearchResults([]);
    setSearchTerm('');
    setActiveTab('prontuario');
    loadProntuario(pac);
  }

  // File upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedPaciente) return;
    setUploading(true);
    try {
      await documentoService.upload(
        file, selectedPaciente.id, uploadTipo, uploadDesc,
        selectedUnidade?.id, user?.id
      );
      toast.success('Documento enviado com sucesso');
      setShowUpload(false);
      setUploadDesc('');
      setUploadTipo('tcle');
      // Refresh docs
      const docs = await documentoService.getByPaciente(selectedPaciente.id);
      setDocumentos(docs);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar documento');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeleteDoc(doc: DocumentoPaciente) {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      await documentoService.delete(doc.id, doc.storage_path);
      toast.success('Documento excluido');
      setDocumentos(prev => prev.filter(d => d.id !== doc.id));
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    }
  }

  async function viewDoc(doc: DocumentoPaciente) {
    try {
      const url = await documentoService.getSignedUrl(doc.storage_path);
      window.open(url, '_blank');
    } catch {
      toast.error('Erro ao abrir documento');
    }
  }

  // QR Code upload
  async function startQRUpload() {
    if (!selectedPaciente) return;
    // Generate a unique upload token
    const token = crypto.randomUUID();
    const uploadUrl = `${window.location.origin}/upload-qr?token=${token}&paciente=${selectedPaciente.id}&unidade=${selectedUnidade?.id || ''}&profissional=${user?.id || ''}&tipo=${uploadTipo}`;
    setQrUrl(uploadUrl);

    // Generate QR code data URL
    try {
      const dataUrl = await QRCode.toDataURL(uploadUrl, { width: 280, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch {
      toast.error('Erro ao gerar QR Code');
      return;
    }

    setShowQR(true);

    // Subscribe to realtime for new documents
    if (qrChannelRef.current) {
      supabase.removeChannel(qrChannelRef.current);
    }
    const channel = supabase
      .channel(`doc-upload-${token}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'documentos_paciente',
        filter: `paciente_id=eq.${selectedPaciente.id}`,
      }, async () => {
        toast.success('Novo documento recebido via QR Code!');
        const docs = await documentoService.getByPaciente(selectedPaciente.id);
        setDocumentos(docs);
      })
      .subscribe();
    qrChannelRef.current = channel;
  }

  function closeQR() {
    setShowQR(false);
    if (qrChannelRef.current) {
      supabase.removeChannel(qrChannelRef.current);
      qrChannelRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (qrChannelRef.current) {
        supabase.removeChannel(qrChannelRef.current);
      }
    };
  }, [supabase]);

  // Merge triagens and atendimentos into timeline
  const timeline = useMemo(() => {
    const items: Array<{ type: 'triagem' | 'atendimento'; date: string; data: any }> = [];
    triagens.forEach(t => items.push({ type: 'triagem', date: t.created_at, data: t }));
    atendimentos.forEach(a => items.push({ type: 'atendimento', date: a.data_atendimento + 'T' + (a.hora_inicio_atendimento || a.hora_chegada || '00:00:00'), data: a }));
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [triagens, atendimentos]);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto pt-16 lg:pt-0">
      <PageHeader
        title="Pacientes"
        subtitle="Pesquisa e prontuario completo dos pacientes"
      />

      {/* Search bar */}
      <div className="card p-4 mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 text-base"
            placeholder="Buscar por nome, CPF ou CNS..."
            autoFocus
          />
          <svg className="w-5 h-5 text-surface-400 absolute left-3 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          {searching && <div className="absolute right-3 top-3.5"><div className="w-5 h-5 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" /></div>}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mt-3 border border-surface-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {searchResults.map((pac) => (
              <button
                key={pac.id}
                onClick={() => selectPaciente(pac)}
                className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors border-b border-surface-50 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-surface-800 text-sm">{pac.nome_completo}</p>
                    <p className="text-xs text-surface-400">
                      CPF: {maskCPF(pac.cpf || '')} | Nasc: {formatDate(pac.data_nascimento)} | {calcularIdade(pac.data_nascimento)}a | {pac.sexo === 'F' ? 'Fem' : 'Masc'}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Patient prontuario */}
      {selectedPaciente && (
        <div className="space-y-4">
          {/* Patient header */}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center">
                    <span className="text-lg font-bold text-brand-700">{selectedPaciente.nome_completo.charAt(0)}</span>
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-surface-900 text-lg">{selectedPaciente.nome_completo}</h2>
                    <p className="text-sm text-surface-500">
                      {calcularIdade(selectedPaciente.data_nascimento)} anos • {selectedPaciente.sexo === 'F' ? 'Feminino' : 'Masculino'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                  <div><span className="text-surface-400">CPF:</span> <span className="font-medium">{maskCPF(selectedPaciente.cpf || '')}</span></div>
                  <div><span className="text-surface-400">CNS:</span> <span className="font-medium">{maskCNS(selectedPaciente.cns || '') || '—'}</span></div>
                  <div><span className="text-surface-400">Telefone:</span> <span className="font-medium">{maskPhone(selectedPaciente.telefone || '') || '—'}</span></div>
                  <div><span className="text-surface-400">Cidade:</span> <span className="font-medium">{selectedPaciente.cidade || '—'}/{selectedPaciente.uf || '—'}</span></div>
                </div>
              </div>
              <button
                onClick={() => { setSelectedPaciente(null); setTriagens([]); setAtendimentos([]); setDocumentos([]); }}
                className="btn-secondary text-xs flex-shrink-0"
              >
                Fechar
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-surface-100">
              <div className="text-center">
                <p className="text-2xl font-bold text-brand-600">{atendimentos.length}</p>
                <p className="text-[10px] text-surface-400 uppercase">Atendimentos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{triagens.length}</p>
                <p className="text-[10px] text-surface-400 uppercase">Triagens</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">{documentos.length}</p>
                <p className="text-[10px] text-surface-400 uppercase">Documentos</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('prontuario')}
              className={cn('flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-colors',
                activeTab === 'prontuario' ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              )}
            >
              Prontuario ({triagens.length + atendimentos.length})
            </button>
            <button
              onClick={() => setActiveTab('documentos')}
              className={cn('flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-colors',
                activeTab === 'documentos' ? 'bg-white text-brand-700 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              )}
            >
              Documentos ({documentos.length})
            </button>
          </div>

          {/* Prontuario Tab */}
          {activeTab === 'prontuario' && (
            <div className="space-y-3">
              {loadingProntuario ? (
                <div className="card p-8 text-center">
                  <div className="w-8 h-8 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-surface-400 mt-3">Carregando prontuario...</p>
                </div>
              ) : timeline.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-surface-400">Nenhum registro encontrado para este paciente.</p>
                </div>
              ) : (
                timeline.map((item, idx) => (
                  <div key={`${item.type}-${idx}`} className="card overflow-hidden">
                    {item.type === 'triagem' ? (
                      <div>
                        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                          <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            TRIAGEM
                          </span>
                          <span className="text-[10px] text-purple-500">{formatDate(item.data.created_at, 'dd/MM/yyyy HH:mm')}</span>
                        </div>
                        <div className="p-4 text-sm space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <div><span className="text-xs text-surface-400">PA:</span> <span className="font-medium">{item.data.pressao_arterial || '—'}</span></div>
                            <div><span className="text-xs text-surface-400">HGT:</span> <span className="font-medium">{item.data.hgt || '—'}</span></div>
                            <div><span className="text-xs text-surface-400">Alergia:</span> <span className="font-medium">{item.data.alergia || 'Nenhuma'}</span></div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {item.data.diabetes && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Diabetes</span>}
                            {item.data.hipertensao && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Hipertensao</span>}
                            {item.data.doencas_cardiacas && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Cardiacas</span>}
                            {item.data.doencas_hepaticas && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Hepaticas</span>}
                            {item.data.doencas_renais && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Renais</span>}
                            {item.data.escleroterapia_anterior && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">Escleroterapia anterior</span>}
                            {item.data.trombose_embolia && <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-semibold">Trombose/Embolia</span>}
                            {item.data.gravidez_amamentacao && <span className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded text-xs font-semibold">Gravidez/Amamentacao</span>}
                          </div>
                          {item.data.observacao && <p className="text-xs text-surface-600"><strong>Obs:</strong> {item.data.observacao}</p>}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            ATENDIMENTO
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px]', item.data.procedimento?.tipo === 'bilateral' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700')}>
                              {item.data.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
                            </span>
                          </span>
                          <span className="text-[10px] text-blue-500">{formatDate(item.data.data_atendimento, 'dd/MM/yyyy')}</span>
                        </div>
                        <div className="p-4 text-sm space-y-2">
                          <div className="text-xs text-surface-500 flex gap-3">
                            <span>Unidade: {(item.data.unidade as any)?.municipio?.nome || '—'}</span>
                            <span>Medico: Dr(a). {item.data.profissional?.nome_completo?.split(' ')[0] || '—'}</span>
                          </div>
                          {item.data.doppler && (
                            <div><p className="text-[10px] text-surface-400 uppercase font-semibold">Doppler</p><p className="text-xs text-surface-700 whitespace-pre-wrap">{item.data.doppler}</p></div>
                          )}
                          {item.data.anamnese && (
                            <div><p className="text-[10px] text-surface-400 uppercase font-semibold">Anamnese</p><p className="text-xs text-surface-700 whitespace-pre-wrap">{item.data.anamnese}</p></div>
                          )}
                          {item.data.descricao_procedimento && (
                            <div><p className="text-[10px] text-surface-400 uppercase font-semibold">Procedimento</p><p className="text-xs text-surface-700 whitespace-pre-wrap">{item.data.descricao_procedimento}</p></div>
                          )}
                          {item.data.observacoes && (
                            <div><p className="text-[10px] text-surface-400 uppercase font-semibold">Observacoes</p><p className="text-xs text-surface-700 whitespace-pre-wrap">{item.data.observacoes}</p></div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Documentos Tab */}
          {activeTab === 'documentos' && (
            <div className="space-y-4">
              {/* Upload buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowUpload(true)}
                  className="btn-primary text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Upload do Computador
                </button>
                <button
                  onClick={startQRUpload}
                  className="btn-secondary text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                  Upload via QR Code
                </button>
              </div>

              {/* Upload form */}
              {showUpload && (
                <div className="card p-4 border-2 border-dashed border-brand-300 bg-brand-50/50">
                  <h4 className="font-semibold text-surface-800 mb-3 text-sm">Enviar Documento</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="input-label">Tipo de Documento</label>
                      <select value={uploadTipo} onChange={(e) => setUploadTipo(e.target.value)} className="input-field">
                        {DOC_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="input-label">Descricao (opcional)</label>
                      <input type="text" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} className="input-field" placeholder="Ex: TCLE assinado em 03/03/2026" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={handleFileUpload}
                      className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-100 file:text-brand-700 hover:file:bg-brand-200"
                      disabled={uploading}
                    />
                    {uploading && <div className="w-5 h-5 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />}
                    <button onClick={() => setShowUpload(false)} className="text-xs text-surface-400 hover:text-surface-600">Cancelar</button>
                  </div>
                </div>
              )}

              {/* QR Code modal */}
              {showQR && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-elevated max-w-sm w-full p-6 text-center">
                    <h3 className="font-display font-bold text-surface-900 text-lg mb-2">Upload via Celular</h3>
                    <p className="text-sm text-surface-500 mb-4">Escaneie o QR Code com seu celular para tirar uma foto e enviar o documento.</p>
                    {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="mx-auto mb-4 rounded-lg border border-surface-200" />}
                    <p className="text-[10px] text-surface-400 mb-4 break-all">{qrUrl}</p>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <p className="text-xs text-surface-500">Aguardando upload do celular...</p>
                    </div>
                    <button onClick={closeQR} className="btn-secondary w-full">Fechar</button>
                  </div>
                </div>
              )}

              {/* Documents list */}
              {documentos.length === 0 && !showUpload ? (
                <div className="card p-8 text-center">
                  <p className="text-surface-400 text-sm">Nenhum documento cadastrado para este paciente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documentos.map((doc) => (
                    <div key={doc.id} className="card p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                          doc.mime_type?.includes('pdf') ? 'bg-red-100' :
                          doc.mime_type?.includes('image') ? 'bg-blue-100' : 'bg-surface-100'
                        )}>
                          {doc.mime_type?.includes('pdf') ? (
                            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          ) : doc.mime_type?.includes('image') ? (
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          ) : (
                            <svg className="w-5 h-5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-800 truncate">{doc.nome_arquivo}</p>
                          <p className="text-xs text-surface-400">
                            {DOC_TIPOS.find(t => t.value === doc.tipo)?.label || doc.tipo} • {formatDate(doc.created_at, 'dd/MM/yyyy HH:mm')}
                            {doc.tamanho_bytes ? ` • ${(doc.tamanho_bytes / 1024).toFixed(0)}KB` : ''}
                          </p>
                          {doc.descricao && <p className="text-[10px] text-surface-400 truncate">{doc.descricao}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => viewDoc(doc)} className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1.5 rounded-md hover:bg-brand-100 transition-colors">
                          Ver
                        </button>
                        <button onClick={() => handleDeleteDoc(doc)} className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-md hover:bg-red-100 transition-colors">
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state when no patient selected */}
      {!selectedPaciente && searchResults.length === 0 && (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-surface-700 mb-1">Pesquisar Paciente</h3>
          <p className="text-sm text-surface-400">Digite o nome, CPF ou CNS do paciente na barra de busca acima</p>
        </div>
      )}
    </div>
  );
}
