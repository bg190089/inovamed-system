'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { PacienteService, AtendimentoService } from '@/lib/services';
import { pacienteSchema } from '@/lib/validations/schemas';
import { toast } from 'sonner';
import { maskCPF, maskCNS, maskPhone, maskCEP, unmask, formatDate, calcularIdade, getStatusColor, getStatusLabel, cn } from '@/lib/utils';
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
  const { selectedEmpresa, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const pacienteService = useMemo(() => new PacienteService(supabase), [supabase]);
  const atendimentoService = useMemo(() => new AtendimentoService(supabase), [supabase]);
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

  const [form, setForm] = useState({
    nome_completo: '', sexo: 'F' as 'M' | 'F', data_nascimento: '',
    cpf: '', cns: '', cep: '', logradouro: '', numero: '', complemento: '',
    bairro: '', cidade: '', uf: 'BA', telefone: '',
  });

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
    }, 30000);
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

      await atendimentoService.criar({
        empresa_id: selectedEmpresa.id, unidade_id: selectedUnidade.id,
        profissional_id: selectedProf, paciente_id: pacienteId,
        procedimento_id: selectedProc,
        data_atendimento: new Date().toISOString().split('T')[0],
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

  const aguardandoTriagem = fila.filter(f => f.status === 'aguardando_triagem');
  const aguardando = fila.filter(f => f.status === 'aguardando');
  const emAtendimento = fila.filter(f => f.status === 'em_atendimento');
  const finalizados = fila.filter(f => f.status === 'finalizado');

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
        {fila.length === 0 ? (
          <EmptyState icon="🏥" title="Nenhum paciente na fila" description='Clique em "Novo Atendimento" para comecar' />
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
                <th className="px-4 py-3 text-left">Espera</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center w-16">Ações</th>
              </tr></thead>
              <tbody>
                {fila.map((atend, i) => {
                  const priority = getPriorityBadge(atend.paciente?.data_nascimento || '');
                  return (
                    <tr key={atend.id} className="table-row">
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
                      <td className={cn('px-4 py-3 text-sm', getWaitTimeColor(atend.hora_chegada))}>
                        {calcWaitTime(atend.hora_chegada)}
                      </td>
                      <td className="px-4 py-3 text-center"><span className={`badge ${getStatusColor(atend.status)}`}>{getStatusLabel(atend.status)}</span></td>
                      <td className="px-4 py-3 text-center">
                        {atend.status === 'aguardando' && (
                          <button onClick={() => cancelarAtendimento(atend)} className="text-red-500 hover:text-red-700 transition-colors" title="Cancelar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
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
        {fila.length === 0 ? (
          <EmptyState icon="🏥" title="Nenhum paciente na fila" description='Clique em "Novo Atendimento" para comecar' />
        ) : (
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
                        {atend.status === 'aguardando' && (
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

            {/* Finalizados Section */}
            {finalizados.length > 0 && (
              <div className="space-y-3">
                <div className="px-4 py-2 bg-emerald-100 rounded-lg">
                  <h3 className="font-semibold text-emerald-900">Finalizados ({finalizados.length})</h3>
                </div>
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
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description}
        variant={confirmState.variant} confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />

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
                          <input type="text" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} className="input-field" placeholder="000.000.000-00" maxLength={14} />
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
                          <input type="text" value={form.cns} onChange={(e) => setForm({ ...form, cns: maskCNS(e.target.value) })} className="input-field" placeholder="000 0000 0000 0000" maxLength={18} />
                        </div>
                        <div>
                          <label className="input-label">Telefone</label>
                          <input type="text" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} className="input-field" placeholder="(00) 00000-0000" maxLength={15} />
                        </div>
                        <div>
                          <label className="input-label">Cidade</label>
                          <input type="text" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="input-field" />
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
