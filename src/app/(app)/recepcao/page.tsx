'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { PacienteService, AtendimentoService, DocumentoService } from '@/lib/services';
import type { DocumentoPaciente } from '@/lib/services/documentoService';
import { pacienteSchema } from '@/lib/validations/schemas';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import { maskCPF, maskCNS, maskPhone, maskCEP, unmask, formatDate, calcularIdade, getStatusColor, getStatusLabel, cn, buscarCEP } from '@/lib/utils';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/ui';
import type { Paciente, Atendimento, Procedimento, Profissional } from '@/types';

// Helper: Calculate wait time in human readable format
function calcWaitTime(hora_chegada: string | null): string {
  if (!hora_chegada) return '—';
  const diff = Math.floor((Date.now() - new Date(hora_chegada).getTime()) / 60000);
  if (diff < 1) return '<1 min';
  if (diff >= 60) {
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return mins > 0 ? `${hours}h${String(mins).padStart(2, '0')}min` : `${hours}h`;
  }
  return `${diff} min`;
}

// Helper: Get wait time color based on elapsed time
function getWaitTimeColor(hora_chegada: string | null): string {
  if (!hora_chegada) return 'text-surface-500';
  const diff = Math.floor((Date.now() - new Date(hora_chegada).getTime()) / 60000);
  if (diff < 15) return 'text-emerald-600 font-semibold';
  if (diff < 30) return 'text-yellow-600 font-semibold';
  if (diff < 60) return 'text-orange-600 font-semibold';
  return 'text-red-600 font-semibold';
}

// Helper: Get priority badge based on age
function getPriorityBadge(dataNascimento: string): { label: string; className: string; emoji: string } | null {
  const age = calcularIdade(dataNascimento);
  if (age >= 60) return { label: 'PRIORITÁRIO', className: 'bg-red-100 text-red-700', emoji: '🔴' };
  if (age < 12) return { label: 'CRIANÇA', className: 'bg-orange-100 text-orange-700', emoji: '🟠' };
  if (age < 18) return { label: 'ADOLESCENTE', className: 'bg-yellow-100 text-yellow-700', emoji: '🟡' };
  return null;
}

export default function RecepcaoPage() {
  const { user, selectedEmpresa, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const pacienteService = useMemo(() => new PacienteService(supabase), [supabase]);
  const atendimentoService = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const documentoService = useMemo(() => new DocumentoService(supabase), [supabase]);
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmDialog();

  const [fila, setFila] = useState<Atendimento[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Paciente[]>([]);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProc, setSelectedProc] = useState('');
  const [selectedProf, setSelectedProf] = useState('');
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // For wait time updates

  const [editingAtendimento, setEditingAtendimento] = useState<Atendimento | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    nome_completo: '', sexo: 'F' as 'M' | 'F', data_nascimento: '',
    cpf: '', cns: '', cep: '', logradouro: '', numero: '', complemento: '',
    bairro: '', cidade: '', uf: 'BA', telefone: '',
  });
  const [buscandoCEP, setBuscandoCEP] = useState(false);
  const [buscandoCEPEdit, setBuscandoCEPEdit] = useState(false);
  const [buscandoPacienteCPF, setBuscandoPacienteCPF] = useState(false);

  const [form, setForm] = useState({
    nome_completo: '', sexo: 'F' as 'M' | 'F', data_nascimento: '',
    cpf: '', cns: '', cep: '', logradouro: '', numero: '', complemento: '',
    bairro: '', cidade: '', uf: 'BA', telefone: '',
  });

  const [showDocModal, setShowDocModal] = useState(false);
  const [docPaciente, setDocPaciente] = useState<Atendimento | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoPaciente[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadTipo, setUploadTipo] = useState('tcle');
  const [uploadDesc, setUploadDesc] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [filaTab, setFilaTab] = useState<'aguardando' | 'atendidos'>('aguardando');

  const loadFila = useCallback(async () => {
    if (!selectedUnidade) return;
    try {
      const data = await atendimentoService.getFilaDoDia(selectedUnidade.id);
      setFila(data);
    } catch (err) { console.error(err); }
  }, [selectedUnidade, atendimentoService]);

  // Auto-refresh wait times every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedUnidade) {
      atendimentoService.getProcedimentos().then(setProcedimentos);
      atendimentoService.getMedicos().then(setProfissionais);
      loadFila();

      // Filtered realtime subscription
      const channel = supabase
        .channel('recepcao-rt')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'atendimentos',
          filter: `unidade_id=eq.${selectedUnidade.id}`,
        }, () => loadFila())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedUnidade, loadFila, supabase, atendimentoService]);

  // Debounced patient search using RPC
  useEffect(() => {
    const t = setTimeout(async () => {
      if (searchTerm.length < 3) { setSearchResults([]); return; }
      const results = await pacienteService.buscar(searchTerm);
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, pacienteService]);

  function selectPaciente(pac: Paciente) {
    setSelectedPaciente(pac);
    setIsNewPatient(false);
    setForm({
      nome_completo: pac.nome_completo, sexo: pac.sexo, data_nascimento: pac.data_nascimento,
      cpf: maskCPF(pac.cpf || ''), cns: maskCNS(pac.cns || ''),
      cep: maskCEP(pac.cep || ''), logradouro: pac.logradouro || '',
      numero: pac.numero || '', complemento: pac.complemento || '',
      bairro: pac.bairro || '', cidade: pac.cidade || '', uf: pac.uf || 'BA',
      telefone: maskPhone(pac.telefone || ''),
    });
    setSearchResults([]); setSearchTerm('');
  }

  function startNewPatient() {
    setIsNewPatient(true); setSelectedPaciente(null);
    setForm({ nome_completo: '', sexo: 'F', data_nascimento: '', cpf: '', cns: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'BA', telefone: '' });
  }

  async function handleSaveAndQueue() {
    // Validate with Zod
    const result = pacienteSchema.safeParse(form);
    if (!result.success) {
      const firstError = result.error.errors[0]?.message || 'Dados invalidos';
      toast.error(firstError); return;
    }
    if (!selectedProc) { toast.error('Selecione o procedimento'); return; }
    if (!selectedProf) { toast.error('Selecione o profissional'); return; }
    if (!selectedEmpresa || !selectedUnidade) { toast.error('Selecione empresa e unidade'); return; }

    setLoading(true);
    try {
      const cleanData = result.data;
      let pacienteId = selectedPaciente?.id;

      if (isNewPatient || !selectedPaciente) {
        const existing = await pacienteService.getByCPF(cleanData.cpf);
        if (existing) {
          pacienteId = existing.id;
          await pacienteService.atualizar(existing.id, {
            nome_completo: cleanData.nome_completo, sexo: cleanData.sexo,
            data_nascimento: cleanData.data_nascimento,
            cns: cleanData.cns || null, telefone: cleanData.telefone || null,
            cep: cleanData.cep || null, logradouro: cleanData.logradouro || null,
            numero: cleanData.numero || null, bairro: cleanData.bairro || null,
            cidade: cleanData.cidade || null, uf: cleanData.uf,
          } as any);
        } else {
          const newPac = await pacienteService.criar({
            nome_completo: cleanData.nome_completo, sexo: cleanData.sexo,
            data_nascimento: cleanData.data_nascimento, cpf: cleanData.cpf,
            cns: cleanData.cns || null, cep: cleanData.cep || null,
            logradouro: cleanData.logradouro || null, numero: cleanData.numero || null,
            complemento: cleanData.complemento || null, bairro: cleanData.bairro || null,
            cidade: cleanData.cidade || null, uf: cleanData.uf,
            telefone: cleanData.telefone || null,
          } as any);
          pacienteId = newPac.id;
        }
      } else {
        await pacienteService.atualizar(selectedPaciente.id, {
          cns: cleanData.cns || null, telefone: cleanData.telefone || null,
          logradouro: cleanData.logradouro || null, numero: cleanData.numero || null,
          bairro: cleanData.bairro || null, cidade: cleanData.cidade || null,
        } as any);
      }

      // Rule: each patient can only be registered once per day (excluding cancelled)
      const today = new Date().toISOString().split('T')[0];
      const jaRegistradoHoje = fila.find(
        a => a.paciente_id === pacienteId && a.status !== 'cancelado'
      );
      if (jaRegistradoHoje) {
        toast.error(`${form.nome_completo} já foi registrado(a) hoje. Cada paciente só pode ser lançado uma vez por dia.`);
        setLoading(false);
        return;
      }

      await atendimentoService.criar({
        empresa_id: selectedEmpresa.id, unidade_id: selectedUnidade.id,
        profissional_id: selectedProf, paciente_id: pacienteId,
        procedimento_id: selectedProc,
        data_atendimento: today,
        status: 'aguardando_triagem',
      });

      toast.success(`${form.nome_completo} encaminhado(a) para triagem`);
      resetAndClose(); loadFila();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar atendimento');
    } finally { setLoading(false); }
  }

  function cancelarAtendimento(atend: Atendimento) {
    confirm({
      title: 'Cancelar Atendimento',
      description: `Tem certeza que deseja cancelar o atendimento de ${atend.paciente?.nome_completo}? Esta acao nao pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Sim, Cancelar',
      onConfirm: async () => {
        await atendimentoService.atualizarStatus(atend.id, 'cancelado');
        toast.success('Atendimento cancelado');
        loadFila(); closeConfirm();
      },
    });
  }

  function resetAndClose() {
    setShowModal(false); setSelectedPaciente(null); setIsNewPatient(false);
    setSelectedProc(''); setSelectedProf(''); setSearchTerm(''); setSearchResults([]);
    setForm({ nome_completo: '', sexo: 'F', data_nascimento: '', cpf: '', cns: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'BA', telefone: '' });
  }

  function canEditPatient(status: string) {
    return status === 'aguardando_triagem' || status === 'aguardando';
  }

  function openEditModal(atend: Atendimento) {
    if (!canEditPatient(atend.status)) {
      toast.error('Paciente ja esta em atendimento. Nao e possivel editar.');
      return;
    }
    setEditingAtendimento(atend);
    const pac = atend.paciente;
    if (pac) {
      setEditForm({
        nome_completo: pac.nome_completo || '',
        sexo: pac.sexo || 'F',
        data_nascimento: pac.data_nascimento || '',
        cpf: maskCPF(pac.cpf || ''),
        cns: maskCNS(pac.cns || ''),
        cep: maskCEP(pac.cep || ''),
        logradouro: pac.logradouro || '',
        numero: pac.numero || '',
        complemento: pac.complemento || '',
        bairro: pac.bairro || '',
        cidade: pac.cidade || '',
        uf: pac.uf || 'BA',
        telefone: maskPhone(pac.telefone || ''),
      });
    }
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!editingAtendimento?.paciente?.id) return;
    setLoading(true);
    try {
      await pacienteService.atualizar(editingAtendimento.paciente.id, {
        nome_completo: editForm.nome_completo,
        sexo: editForm.sexo,
        data_nascimento: editForm.data_nascimento,
        cpf: unmask(editForm.cpf),
        cns: unmask(editForm.cns) || null,
        cep: unmask(editForm.cep) || null,
        logradouro: editForm.logradouro || null,
        numero: editForm.numero || null,
        complemento: editForm.complemento || null,
        bairro: editForm.bairro || null,
        cidade: editForm.cidade || null,
        uf: editForm.uf,
        telefone: unmask(editForm.telefone) || null,
      } as any);
      toast.success('Dados do paciente atualizados');
      setShowEditModal(false);
      setEditingAtendimento(null);
      loadFila();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar');
    } finally { setLoading(false); }
  }

  // CEP auto-fill for new patient form
  async function handleCEPChange(cepValue: string) {
    const masked = maskCEP(cepValue);
    setForm(prev => ({ ...prev, cep: masked }));
    const nums = cepValue.replace(/\D/g, '');
    if (nums.length === 8) {
      setBuscandoCEP(true);
      const result = await buscarCEP(nums);
      if (result) {
        setForm(prev => ({
          ...prev,
          logradouro: result.logradouro || prev.logradouro,
          bairro: result.bairro || prev.bairro,
          cidade: result.localidade || prev.cidade,
          uf: result.uf || prev.uf,
          complemento: result.complemento || prev.complemento,
        }));
        toast.success('Endereco preenchido pelo CEP');
      }
      setBuscandoCEP(false);
    }
  }

  // CEP auto-fill for edit modal
  async function handleCEPChangeEdit(cepValue: string) {
    const masked = maskCEP(cepValue);
    setEditForm(prev => ({ ...prev, cep: masked }));
    const nums = cepValue.replace(/\D/g, '');
    if (nums.length === 8) {
      setBuscandoCEPEdit(true);
      const result = await buscarCEP(nums);
      if (result) {
        setEditForm(prev => ({
          ...prev,
          logradouro: result.logradouro || prev.logradouro,
          bairro: result.bairro || prev.bairro,
          cidade: result.localidade || prev.cidade,
          uf: result.uf || prev.uf,
          complemento: result.complemento || prev.complemento,
        }));
        toast.success('Endereco preenchido pelo CEP');
      }
      setBuscandoCEPEdit(false);
    }
  }

  // CPF auto-lookup for new patient form (pulls existing patient data)
  async function handleCPFChangeNewPatient(cpfValue: string) {
    const masked = maskCPF(cpfValue);
    setForm(prev => ({ ...prev, cpf: masked }));
    const nums = cpfValue.replace(/\D/g, '');
    if (nums.length === 11) {
      setBuscandoPacienteCPF(true);
      const existing = await pacienteService.getByCPF(nums);
      if (existing) {
        setForm(prev => ({
          ...prev,
          nome_completo: existing.nome_completo || prev.nome_completo,
          sexo: existing.sexo || prev.sexo,
          data_nascimento: existing.data_nascimento || prev.data_nascimento,
          cns: maskCNS(existing.cns || '') || prev.cns,
          telefone: maskPhone(existing.telefone || '') || prev.telefone,
          cep: maskCEP(existing.cep || '') || prev.cep,
          logradouro: existing.logradouro || prev.logradouro,
          numero: existing.numero || prev.numero,
          complemento: existing.complemento || prev.complemento,
          bairro: existing.bairro || prev.bairro,
          cidade: existing.cidade || prev.cidade,
          uf: existing.uf || prev.uf,
        }));
        toast.success('Paciente encontrado! Dados preenchidos automaticamente.');
      }
      setBuscandoPacienteCPF(false);
    }
  }

  // CNS auto-lookup for new patient form
  async function handleCNSChangeNewPatient(cnsValue: string) {
    const masked = maskCNS(cnsValue);
    setForm(prev => ({ ...prev, cns: masked }));
    const nums = cnsValue.replace(/\D/g, '');
    if (nums.length === 15) {
      setBuscandoPacienteCPF(true);
      const existing = await pacienteService.getByCNS(nums);
      if (existing) {
        setForm(prev => ({
          ...prev,
          nome_completo: existing.nome_completo || prev.nome_completo,
          sexo: existing.sexo || prev.sexo,
          data_nascimento: existing.data_nascimento || prev.data_nascimento,
          cpf: maskCPF(existing.cpf || '') || prev.cpf,
          telefone: maskPhone(existing.telefone || '') || prev.telefone,
          cep: maskCEP(existing.cep || '') || prev.cep,
          logradouro: existing.logradouro || prev.logradouro,
          numero: existing.numero || prev.numero,
          complemento: existing.complemento || prev.complemento,
          bairro: existing.bairro || prev.bairro,
          cidade: existing.cidade || prev.cidade,
          uf: existing.uf || prev.uf,
        }));
        toast.success('Paciente encontrado pelo Cartao SUS! Dados preenchidos.');
      }
      setBuscandoPacienteCPF(false);
    }
  }

  const DOC_TYPES = [
    { value: 'documento_pessoal', label: 'Documento Pessoal' },
    { value: 'tcle', label: 'TCLE' },
    { value: 'receita', label: 'Receita' },
    { value: 'exame', label: 'Exame' },
    { value: 'encaminhamento', label: 'Encaminhamento' },
    { value: 'outro', label: 'Outro' },
  ];

  async function openDocModal(atend: Atendimento) {
    if (!atend.paciente?.id) return;
    setDocPaciente(atend);
    setUploadTipo('tcle');
    setUploadDesc('');
    setQrUrl('');
    setQrDataUrl('');
    try {
      const docs = await documentoService.getByPaciente(atend.paciente.id);
      setDocumentos(docs);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar documentos');
    }
    setShowDocModal(true);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !docPaciente?.paciente?.id) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Apenas JPG e PDF sao permitidos');
      return;
    }

    setUploading(true);
    try {
      const doc = await documentoService.upload(
        file,
        docPaciente.paciente.id,
        uploadTipo,
        uploadDesc,
        selectedUnidade?.id,
        selectedEmpresa?.id
      );
      setDocumentos([doc, ...documentos]);
      setUploadDesc('');
      toast.success('Documento enviado com sucesso');
      e.target.value = '';
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(doc: DocumentoPaciente) {
    confirm({
      title: 'Deletar Documento',
      description: `Tem certeza que deseja deletar "${doc.nome_arquivo}"? Esta acao nao pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Sim, Deletar',
      onConfirm: async () => {
        try {
          await documentoService.delete(doc.id, doc.storage_path);
          setDocumentos(documentos.filter(d => d.id !== doc.id));
          toast.success('Documento deletado');
          closeConfirm();
        } catch (err: any) {
          toast.error(err.message || 'Erro ao deletar');
        }
      },
    });
  }

  async function handleViewDoc(doc: DocumentoPaciente) {
    try {
      const url = await documentoService.getSignedUrl(doc.storage_path);
      window.open(url, '_blank');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao abrir documento');
    }
  }

  async function generateQR() {
    if (!docPaciente?.paciente?.id || !user?.id) return;
    try {
      const token = `${Date.now()}-${Math.random()}`;
      const params = new URLSearchParams({
        token,
        paciente: docPaciente.paciente.id,
        unidade: selectedUnidade?.id || '',
        profissional: docPaciente.profissional_id || '',
        tipo: uploadTipo,
      });
      const uploadQRUrl = `${window.location.origin}/upload-qr?${params.toString()}`;
      const dataUrl = await QRCode.toDataURL(uploadQRUrl, { width: 256 });
      setQrUrl(uploadQRUrl);
      setQrDataUrl(dataUrl);
      toast.success('QR code gerado');
    } catch (err) {
      toast.error('Erro ao gerar QR code');
    }
  }

  const aguardandoTriagem = fila.filter(f => f.status === 'aguardando_triagem');
  const aguardando = fila.filter(f => f.status === 'aguardando');
  const emAtendimento = fila.filter(f => f.status === 'em_atendimento');
  const finalizados = fila.filter(f => f.status === 'finalizado');

  // Filter for tabs: Aguardando tab shows active patients, Atendidos shows finalizados
  const filaParaAguardando = [...aguardandoTriagem, ...aguardando, ...emAtendimento];
  const filaParaAtendidos = finalizados;
  const filaTabFiltrada = filaTab === 'aguardando' ? filaParaAguardando : filaParaAtendidos;

  // Use refreshKey to trigger re-renders for wait time updates
  const _ = refreshKey;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto pt-16 lg:pt-0">
      <PageHeader
        title="Recepcao"
        subtitle={`${(selectedUnidade as any)?.municipio?.nome || '—'} • ${formatDate(new Date(), 'dd/MM/yyyy')} • ${fila.length} pacientes hoje`}
        action={
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Novo Atendimento
          </button>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Ag. Triagem', sublabel: 'Na triagem', count: aguardandoTriagem.length, bg: 'bg-purple-100', text: 'text-purple-600' },
          { label: 'Aguardando', sublabel: 'Fila medico', count: aguardando.length, bg: 'bg-amber-100', text: 'text-amber-600' },
          { label: 'Em atendimento', sublabel: 'No consultorio', count: emAtendimento.length, bg: 'bg-blue-100', text: 'text-blue-600' },
          { label: 'Finalizados', sublabel: 'Hoje', count: finalizados.length, bg: 'bg-emerald-100', text: 'text-emerald-600' },
        ].map((s, i) => (
          <div key={i} className="stat-card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <span className={`${s.text} font-bold`}>{s.count}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-surface-500">{s.label}</p>
              <p className="font-semibold text-surface-800 truncate">{s.sublabel}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Queue Table - Desktop & Tablet */}
      <div className="card hidden md:block">
        <div className="px-6 py-4 border-b border-surface-100 flex items-center justify-between">
          <h2 className="font-display font-semibold text-surface-800">Fila do Dia</h2>
          <button onClick={loadFila} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Atualizar</button>
        </div>

        {/* Tab Bar */}
        <div className="px-6 py-3 border-b border-surface-100 flex gap-4 bg-surface-50">
          <button
            onClick={() => setFilaTab('aguardando')}
            className={cn(
              'px-4 py-2 font-medium text-sm rounded-lg transition-colors',
              filaTab === 'aguardando'
                ? 'bg-brand-500 text-white'
                : 'text-surface-600 hover:bg-surface-200'
            )}
          >
            Aguardando ({filaParaAguardando.length})
          </button>
          <button
            onClick={() => setFilaTab('atendidos')}
            className={cn(
              'px-4 py-2 font-medium text-sm rounded-lg transition-colors',
              filaTab === 'atendidos'
                ? 'bg-brand-500 text-white'
                : 'text-surface-600 hover:bg-surface-200'
            )}
          >
            Atendidos ({filaParaAtendidos.length})
          </button>
        </div>

        {filaTabFiltrada.length === 0 ? (
          <EmptyState icon="🏥" title={filaTab === 'aguardando' ? 'Nenhum paciente aguardando' : 'Nenhum paciente finalizado'} description={filaTab === 'aguardando' ? 'Clique em "Novo Atendimento" para começar' : 'Nenhum atendimento foi finalizado ainda'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="table-header">
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">Paciente</th>
                <th className="px-4 py-3 text-left">Idade / Prior.</th>
                <th className="px-4 py-3 text-left">Procedimento</th>
                <th className="px-4 py-3 text-left">Médico</th>
                <th className="px-4 py-3 text-left">Chegada</th>
                {filaTab === 'aguardando' && <th className="px-4 py-3 text-left">Espera</th>}
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center w-16">Ações</th>
              </tr></thead>
              <tbody>
                {filaTabFiltrada.map((atend, i) => {
                  const priority = getPriorityBadge(atend.paciente?.data_nascimento || '');
                  return (
                    <tr key={atend.id} className={cn('table-row', filaTab === 'atendidos' && 'opacity-75')}>
                      <td className="px-4 py-3 text-sm font-mono text-surface-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-surface-800">{atend.paciente?.nome_completo}</p>
                        <p className="text-xs text-surface-400">{maskCPF(atend.paciente?.cpf || '')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-surface-700">{calcularIdade(atend.paciente?.data_nascimento || '')}a</span>
                          {priority && (
                            <span className={cn('badge text-xs px-2 py-1', priority.className)}>
                              {priority.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('badge text-xs', atend.procedimento?.tipo === 'bilateral' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700')}>
                          {atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-600">Dr(a). {atend.profissional?.nome_completo?.split(' ')[0]}</td>
                      <td className="px-4 py-3 text-sm text-surface-500">{atend.hora_chegada ? formatDate(atend.hora_chegada, 'HH:mm') : '—'}</td>
                      {filaTab === 'aguardando' && (
                        <td className={cn('px-4 py-3 text-sm', getWaitTimeColor(atend.hora_chegada))}>
                          {calcWaitTime(atend.hora_chegada)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center"><span className={`badge ${getStatusColor(atend.status)}`}>{getStatusLabel(atend.status)}</span></td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openDocModal(atend)} className="text-surface-500 hover:text-brand-600 transition-colors" title="Documentos">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </button>
                          {canEditPatient(atend.status) && (
                            <button onClick={() => openEditModal(atend)} className="text-brand-500 hover:text-brand-700 transition-colors" title="Editar dados">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                          )}
                          {(atend.status === 'aguardando' || atend.status === 'aguardando_triagem') && (
                            <button onClick={() => cancelarAtendimento(atend)} className="text-red-500 hover:text-red-700 transition-colors" title="Cancelar">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Queue Cards - Mobile */}
      <div className="md:hidden space-y-4">
        {/* Tab Bar Mobile */}
        <div className="flex gap-2 bg-surface-100 p-2 rounded-lg">
          <button
            onClick={() => setFilaTab('aguardando')}
            className={cn(
              'flex-1 px-3 py-2 font-medium text-xs rounded-lg transition-colors',
              filaTab === 'aguardando'
                ? 'bg-brand-500 text-white'
                : 'text-surface-600 hover:bg-surface-200'
            )}
          >
            Aguardando ({filaParaAguardando.length})
          </button>
          <button
            onClick={() => setFilaTab('atendidos')}
            className={cn(
              'flex-1 px-3 py-2 font-medium text-xs rounded-lg transition-colors',
              filaTab === 'atendidos'
                ? 'bg-brand-500 text-white'
                : 'text-surface-600 hover:bg-surface-200'
            )}
          >
            Atendidos ({filaParaAtendidos.length})
          </button>
        </div>

        {filaTabFiltrada.length === 0 ? (
          <EmptyState icon="🏥" title={filaTab === 'aguardando' ? 'Nenhum paciente aguardando' : 'Nenhum paciente finalizado'} description={filaTab === 'aguardando' ? 'Clique em "Novo Atendimento" para começar' : 'Nenhum atendimento foi finalizado ainda'} />
        ) : (
          <>
            {filaTab === 'aguardando' && (
              <>
                {/* Aguardando Section */}
                {aguardando.length > 0 && (
                  <div className="space-y-3">
                    <div className="px-4 py-2 bg-amber-100 rounded-lg">
                      <h3 className="font-semibold text-amber-900">Aguardando ({aguardando.length})</h3>
                    </div>
                    {aguardando.map((atend) => {
                  const priority = getPriorityBadge(atend.paciente?.data_nascimento || '');
                  const position = fila.findIndex(f => f.id === atend.id) + 1;
                  return (
                    <div key={atend.id} className="bg-white rounded-lg border border-surface-200 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-surface-900 text-sm">{atend.paciente?.nome_completo}</p>
                          <p className="text-xs text-surface-500">{maskCPF(atend.paciente?.cpf || '')}</p>
                        </div>
                        <div className="text-center flex-shrink-0">
                          <p className="text-2xl font-bold text-amber-600">{position}</p>
                          <p className="text-xs text-surface-500">posição</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-surface-700 bg-surface-100 px-2 py-1 rounded">{calcularIdade(atend.paciente?.data_nascimento || '')}a</span>
                        {priority && (
                          <span className={cn('badge text-xs px-2 py-1', priority.className)}>
                            {priority.label}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-surface-500">Procedimento</p>
                          <p className="font-medium text-surface-700">{atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}</p>
                        </div>
                        <div>
                          <p className="text-surface-500">Médico</p>
                          <p className="font-medium text-surface-700">Dr(a). {atend.profissional?.nome_completo?.split(' ')[0]}</p>
                        </div>
                        <div>
                          <p className="text-surface-500">Chegada</p>
                          <p className="font-medium text-surface-700">{atend.hora_chegada ? formatDate(atend.hora_chegada, 'HH:mm') : '—'}</p>
                        </div>
                        <div>
                          <p className="text-surface-500">Espera</p>
                          <p className={cn('font-semibold', getWaitTimeColor(atend.hora_chegada))}>{calcWaitTime(atend.hora_chegada)}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-surface-100">
                        <button onClick={() => openDocModal(atend)} className="flex-1 text-sm px-3 py-2 text-surface-600 hover:bg-surface-50 rounded-lg transition-colors font-medium">
                          Documentos
                        </button>
                        {canEditPatient(atend.status) && (
                          <button onClick={() => openEditModal(atend)} className="flex-1 text-sm px-3 py-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors font-medium">
                            Editar
                          </button>
                        )}
                        {(atend.status === 'aguardando' || atend.status === 'aguardando_triagem') && (
                          <button onClick={() => cancelarAtendimento(atend)} className="flex-1 text-sm px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium">
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                    })}
                  </div>
                )}

                {/* Em Atendimento Section */}
                {emAtendimento.length > 0 && (
                  <div className="space-y-3">
                    <div className="px-4 py-2 bg-blue-100 rounded-lg">
                      <h3 className="font-semibold text-blue-900">Em Atendimento ({emAtendimento.length})</h3>
                    </div>
                    {emAtendimento.map((atend) => {
                      const priority = getPriorityBadge(atend.paciente?.data_nascimento || '');
                      return (
                        <div key={atend.id} className="bg-white rounded-lg border border-surface-200 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-surface-900 text-sm">{atend.paciente?.nome_completo}</p>
                              <p className="text-xs text-surface-500">{maskCPF(atend.paciente?.cpf || '')}</p>
                            </div>
                            <span className={`badge text-xs ${getStatusColor(atend.status)}`}>{getStatusLabel(atend.status)}</span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-surface-700 bg-surface-100 px-2 py-1 rounded">{calcularIdade(atend.paciente?.data_nascimento || '')}a</span>
                            {priority && (
                              <span className={cn('badge text-xs px-2 py-1', priority.className)}>
                                {priority.label}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-surface-500">Procedimento</p>
                              <p className="font-medium text-surface-700">{atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}</p>
                            </div>
                            <div>
                              <p className="text-surface-500">Médico</p>
                              <p className="font-medium text-surface-700">Dr(a). {atend.profissional?.nome_completo?.split(' ')[0]}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Aguardando Triagem Section */}
                {aguardandoTriagem.length > 0 && (
                  <div className="space-y-3">
                    <div className="px-4 py-2 bg-purple-100 rounded-lg">
                      <h3 className="font-semibold text-purple-900">Ag. Triagem ({aguardandoTriagem.length})</h3>
                    </div>
                    {aguardandoTriagem.map((atend) => {
                      const priority = getPriorityBadge(atend.paciente?.data_nascimento || '');
                      return (
                        <div key={atend.id} className="bg-white rounded-lg border border-surface-200 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-surface-900 text-sm">{atend.paciente?.nome_completo}</p>
                              <p className="text-xs text-surface-500">{maskCPF(atend.paciente?.cpf || '')}</p>
                            </div>
                            <span className={`badge text-xs ${getStatusColor(atend.status)}`}>{getStatusLabel(atend.status)}</span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-surface-700 bg-surface-100 px-2 py-1 rounded">{calcularIdade(atend.paciente?.data_nascimento || '')}a</span>
                            {priority && (
                              <span className={cn('badge text-xs px-2 py-1', priority.className)}>
                                {priority.label}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-surface-500">Procedimento</p>
                              <p className="font-medium text-surface-700">{atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}</p>
                            </div>
                            <div>
                              <p className="text-surface-500">Médico</p>
                              <p className="font-medium text-surface-700">Dr(a). {atend.profissional?.nome_completo?.split(' ')[0]}</p>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2 border-t border-surface-100">
                            <button onClick={() => openDocModal(atend)} className="flex-1 text-sm px-3 py-2 text-surface-600 hover:bg-surface-50 rounded-lg transition-colors font-medium">
                              Documentos
                            </button>
                            {canEditPatient(atend.status) && (
                              <button onClick={() => openEditModal(atend)} className="flex-1 text-sm px-3 py-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors font-medium">
                                Editar
                              </button>
                            )}
                            {(atend.status === 'aguardando' || atend.status === 'aguardando_triagem') && (
                              <button onClick={() => cancelarAtendimento(atend)} className="flex-1 text-sm px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium">
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {filaTab === 'atendidos' && (
              <>
                {/* Finalizados Section */}
                {finalizados.map((atend) => {
                  return (
                    <div key={atend.id} className="bg-white rounded-lg border border-surface-200 p-4 space-y-3 opacity-75">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-surface-900 text-sm">{atend.paciente?.nome_completo}</p>
                          <p className="text-xs text-surface-500">{maskCPF(atend.paciente?.cpf || '')}</p>
                        </div>
                        <span className={`badge text-xs ${getStatusColor(atend.status)}`}>{getStatusLabel(atend.status)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-surface-500">Procedimento</p>
                          <p className="font-medium text-surface-700">{atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}</p>
                        </div>
                        <div>
                          <p className="text-surface-500">Médico</p>
                          <p className="font-medium text-surface-700">Dr(a). {atend.profissional?.nome_completo?.split(' ')[0]}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-surface-100">
                        <button onClick={() => openDocModal(atend)} className="flex-1 text-sm px-3 py-2 text-surface-600 hover:bg-surface-50 rounded-lg transition-colors font-medium">
                          Documentos
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description}
        variant={confirmState.variant} confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />

      {/* Documents Modal */}
      {showDocModal && docPaciente && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-4 overflow-y-auto md:pt-12">
          <div className="bg-white rounded-2xl shadow-elevated max-w-2xl w-full mb-8 min-h-screen md:min-h-auto md:rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-display font-bold text-surface-900">Documentos - {docPaciente.paciente?.nome_completo}</h2>
              <button onClick={() => setShowDocModal(false)} className="p-2 rounded-lg hover:bg-surface-100">
                <svg className="w-5 h-5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Upload Section */}
              <div className="border border-surface-200 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-surface-800">Enviar Documento</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="input-label">Tipo de Documento</label>
                    <select value={uploadTipo} onChange={(e) => setUploadTipo(e.target.value)} className="input-field">
                      {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Descricao (Opcional)</label>
                    <input type="text" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} className="input-field" placeholder="Ex: Comprovante de residencia..." />
                  </div>
                </div>
                <div>
                  <label className="input-label">Arquivo (JPG, PDF)</label>
                  <input type="file" accept=".jpg,.jpeg,.pdf" onChange={handleFileUpload} disabled={uploading} className="input-field cursor-pointer" />
                </div>
              </div>

              {/* QR Code Section */}
              <div className="border border-surface-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-surface-800">Upload via QR Code</h3>
                  <button onClick={generateQR} className="text-sm btn-secondary">Gerar QR Code</button>
                </div>
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-3 bg-surface-50 p-4 rounded-lg">
                    <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
                    <p className="text-xs text-surface-500 text-center">Aponte a câmera do telefone para fazer upload</p>
                  </div>
                )}
              </div>

              {/* Documents List Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-surface-800">Documentos do Paciente ({documentos.length})</h3>
                {documentos.length === 0 ? (
                  <div className="text-center py-6 bg-surface-50 rounded-lg">
                    <p className="text-sm text-surface-500">Nenhum documento enviado</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documentos.map((doc) => (
                      <div key={doc.id} className="border border-surface-200 rounded-lg p-3 flex items-center justify-between hover:bg-surface-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-800">{doc.nome_arquivo}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="badge bg-surface-100 text-surface-700 text-xs">
                              {DOC_TYPES.find(t => t.value === doc.tipo)?.label || doc.tipo}
                            </span>
                            {doc.descricao && (
                              <span className="text-xs text-surface-500">{doc.descricao}</span>
                            )}
                            <span className="text-xs text-surface-400">{formatDate(doc.created_at, 'dd/MM/yyyy HH:mm')}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <button onClick={() => handleViewDoc(doc)} className="text-brand-500 hover:text-brand-700 transition-colors p-2" title="Visualizar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          <button onClick={() => handleDeleteDoc(doc)} className="text-red-500 hover:text-red-700 transition-colors p-2" title="Deletar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-surface-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => setShowDocModal(false)} className="btn-secondary">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {showEditModal && editingAtendimento && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-4 overflow-y-auto md:pt-12">
          <div className="bg-white rounded-2xl shadow-elevated max-w-2xl w-full mb-8 min-h-screen md:min-h-auto md:rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-display font-bold text-surface-900">Editar Dados do Paciente</h2>
              <button onClick={() => { setShowEditModal(false); setEditingAtendimento(null); }} className="p-2 rounded-lg hover:bg-surface-100">
                <svg className="w-5 h-5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                Editando dados de <strong>{editingAtendimento.paciente?.nome_completo}</strong>. As alteracoes serao salvas no cadastro do paciente.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="input-label">Nome Completo</label>
                  <input type="text" value={editForm.nome_completo} onChange={(e) => setEditForm({ ...editForm, nome_completo: e.target.value.toUpperCase() })} className="input-field" />
                </div>
                <div>
                  <label className="input-label">CPF</label>
                  <input type="text" value={editForm.cpf} onChange={(e) => setEditForm({ ...editForm, cpf: maskCPF(e.target.value) })} className="input-field" maxLength={14} />
                </div>
                <div>
                  <label className="input-label">Data Nascimento</label>
                  <input type="date" value={editForm.data_nascimento} onChange={(e) => setEditForm({ ...editForm, data_nascimento: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="input-label">Sexo</label>
                  <select value={editForm.sexo} onChange={(e) => setEditForm({ ...editForm, sexo: e.target.value as any })} className="input-field">
                    <option value="F">Feminino</option><option value="M">Masculino</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Cartao SUS (CNS)</label>
                  <input type="text" value={editForm.cns} onChange={(e) => setEditForm({ ...editForm, cns: maskCNS(e.target.value) })} className="input-field" maxLength={18} />
                </div>
                <div>
                  <label className="input-label">Telefone</label>
                  <input type="text" value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: maskPhone(e.target.value) })} className="input-field" maxLength={15} />
                </div>
                <div>
                  <label className="input-label">CEP</label>
                  <div className="relative">
                    <input type="text" value={editForm.cep} onChange={(e) => handleCEPChangeEdit(e.target.value)} className="input-field" placeholder="00000-000" maxLength={9} />
                    {buscandoCEPEdit && <div className="absolute right-3 top-3 w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="input-label">Logradouro</label>
                  <input type="text" value={editForm.logradouro} onChange={(e) => setEditForm({ ...editForm, logradouro: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="input-label">Numero</label>
                  <input type="text" value={editForm.numero} onChange={(e) => setEditForm({ ...editForm, numero: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="input-label">Complemento</label>
                  <input type="text" value={editForm.complemento} onChange={(e) => setEditForm({ ...editForm, complemento: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="input-label">Bairro</label>
                  <input type="text" value={editForm.bairro} onChange={(e) => setEditForm({ ...editForm, bairro: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="input-label">Cidade</label>
                  <input type="text" value={editForm.cidade} onChange={(e) => setEditForm({ ...editForm, cidade: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="input-label">UF</label>
                  <input type="text" value={editForm.uf} onChange={(e) => setEditForm({ ...editForm, uf: e.target.value.toUpperCase() })} className="input-field" maxLength={2} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-surface-100 flex flex-col-reverse md:flex-row justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => { setShowEditModal(false); setEditingAtendimento(null); }} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveEdit} disabled={loading} className="btn-success">
                {loading ? 'Salvando...' : 'Salvar Alteracoes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Atendimento Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-4 overflow-y-auto md:pt-12">
          <div className="bg-white rounded-2xl shadow-elevated max-w-2xl w-full mb-8 min-h-screen md:min-h-auto md:rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-display font-bold text-surface-900">Novo Atendimento</h2>
              <button onClick={resetAndClose} className="p-2 rounded-lg hover:bg-surface-100">
                <svg className="w-5 h-5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              {!selectedPaciente && !isNewPatient && (
                <div>
                  <label className="input-label">Buscar Paciente (CPF, CNS ou Nome)</label>
                  <div className="relative">
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-10" autoFocus placeholder="Digite pelo menos 3 caracteres..." />
                    <svg className="w-5 h-5 text-surface-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 border border-surface-200 rounded-xl overflow-hidden">
                      {searchResults.map((pac) => (
                        <button key={pac.id} onClick={() => selectPaciente(pac)} className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors border-b border-surface-50 last:border-0">
                          <p className="font-medium text-surface-800 text-sm">{pac.nome_completo}</p>
                          <p className="text-xs text-surface-400">CPF: {maskCPF(pac.cpf || '')} | Nasc: {formatDate(pac.data_nascimento)} | {calcularIdade(pac.data_nascimento)}a | {pac.sexo === 'F' ? 'Fem' : 'Masc'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 text-center">
                    <button onClick={startNewPatient} className="text-sm text-brand-600 hover:text-brand-700 font-medium">+ Cadastrar Novo Paciente</button>
                  </div>
                </div>
              )}

              {(selectedPaciente || isNewPatient) && (
                <>
                  {selectedPaciente && (
                    <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-brand-800">{selectedPaciente.nome_completo}</p>
                        <p className="text-sm text-brand-600">CPF: {maskCPF(selectedPaciente.cpf || '')} | {calcularIdade(selectedPaciente.data_nascimento)}a</p>
                      </div>
                      <button onClick={() => { setSelectedPaciente(null); setIsNewPatient(false); }} className="text-sm text-brand-600 hover:text-brand-800 font-medium">Trocar</button>
                    </div>
                  )}

                  {isNewPatient && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-surface-800">Dados do Paciente</h3>
                        <button onClick={() => { setIsNewPatient(false); setSelectedPaciente(null); }} className="text-sm text-surface-500 hover:text-surface-700">← Voltar a busca</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <label className="input-label">Nome Completo <span className="text-red-500">*</span></label>
                          <input type="text" value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value.toUpperCase() })} className="input-field" placeholder="NOME COMPLETO" />
                        </div>
                        <div>
                          <label className="input-label">CPF <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <input type="text" value={form.cpf} onChange={(e) => handleCPFChangeNewPatient(e.target.value)} className="input-field" placeholder="000.000.000-00" maxLength={14} />
                            {buscandoPacienteCPF && <div className="absolute right-3 top-3 w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />}
                          </div>
                        </div>
                        <div>
                          <label className="input-label">Data Nascimento <span className="text-red-500">*</span></label>
                          <input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="input-field" />
                        </div>
                        <div>
                          <label className="input-label">Sexo</label>
                          <select value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value as any })} className="input-field">
                            <option value="F">Feminino</option><option value="M">Masculino</option>
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Cartao SUS (CNS)</label>
                          <div className="relative">
                            <input type="text" value={form.cns} onChange={(e) => handleCNSChangeNewPatient(e.target.value)} className="input-field" placeholder="000 0000 0000 0000" maxLength={18} />
                            {buscandoPacienteCPF && <div className="absolute right-3 top-3 w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />}
                          </div>
                        </div>
                        <div>
                          <label className="input-label">Telefone</label>
                          <input type="text" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} className="input-field" placeholder="(00) 00000-0000" maxLength={15} />
                        </div>
                        <div>
                          <label className="input-label">CEP</label>
                          <div className="relative">
                            <input type="text" value={form.cep} onChange={(e) => handleCEPChange(e.target.value)} className="input-field" placeholder="00000-000" maxLength={9} />
                            {buscandoCEP && <div className="absolute right-3 top-3 w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />}
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label className="input-label">Logradouro</label>
                          <input type="text" value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className="input-field" placeholder="Rua, Avenida..." />
                        </div>
                        <div>
                          <label className="input-label">Numero</label>
                          <input type="text" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="input-field" placeholder="Nº" />
                        </div>
                        <div>
                          <label className="input-label">Complemento</label>
                          <input type="text" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="input-field" />
                        </div>
                        <div>
                          <label className="input-label">Bairro</label>
                          <input type="text" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="input-field" />
                        </div>
                        <div>
                          <label className="input-label">Cidade</label>
                          <input type="text" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="input-field" />
                        </div>
                        <div>
                          <label className="input-label">UF</label>
                          <input type="text" value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} className="input-field" maxLength={2} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-surface-100 pt-4">
                    <h3 className="font-semibold text-surface-800 mb-3">Dados do Atendimento</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="input-label">Procedimento <span className="text-red-500">*</span></label>
                        <select value={selectedProc} onChange={(e) => setSelectedProc(e.target.value)} className="input-field">
                          <option value="">Selecione...</option>
                          {procedimentos.map(p => <option key={p.id} value={p.id}>{p.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'} ({p.codigo_sus})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="input-label">Medico <span className="text-red-500">*</span></label>
                        <select value={selectedProf} onChange={(e) => setSelectedProf(e.target.value)} className="input-field">
                          <option value="">Selecione...</option>
                          {profissionais.map(p => <option key={p.id} value={p.id}>Dr(a). {p.nome_completo}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {(selectedPaciente || isNewPatient) && (
              <div className="px-6 py-4 border-t border-surface-100 flex flex-col-reverse md:flex-row justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
                <button onClick={resetAndClose} className="btn-secondary">Cancelar</button>
                <button onClick={handleSaveAndQueue} disabled={loading} className="btn-success">
                  {loading ? (
                    <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</span>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvar e Adicionar a Fila</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
