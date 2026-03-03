'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { AtendimentoService } from '@/lib/services';
import { toast } from 'sonner';
import { formatDate, calcularIdade, maskCPF, cn, getStatusColor, getStatusLabel } from '@/lib/utils';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/ui';
import type { Atendimento } from '@/types';

// Helper: Calculate wait time in minutes from hora_chegada
function calcWaitTime(hora_chegada: string | null): string {
  if (!hora_chegada) return '—';
  const diff = Math.floor((Date.now() - new Date(hora_chegada).getTime()) / 60000);
  if (diff < 1) return '<1 min';
  if (diff >= 60) return `${Math.floor(diff / 60)}h${diff % 60}min`;
  return `${diff} min`;
}

// Helper: Get priority badge for age
function getAgePriority(dataNascimento: string | null): { age: number; badge: string; color: string; label: string } {
  if (!dataNascimento) return { age: 0, badge: '—', color: '', label: '' };
  const age = calcularIdade(dataNascimento);
  if (age >= 60) return { age, badge: '🔴', color: 'text-red-600', label: 'PRIOR.' };
  if (age < 12) return { age, badge: '🟠', color: 'text-orange-600', label: 'CRIANÇA' };
  if (age < 18) return { age, badge: '🟡', color: 'text-yellow-600', label: '' };
  return { age, badge: '', color: '', label: '' };
}

const DEFAULT_TEMPLATES = [
  'Realizada escleroterapia com glicose hipertonica 75% em veias varicosas reticulares e telangiectasias nos membros inferiores bilateralmente. Aplicacao sem intercorrencias. Curativo compressivo aplicado. Orientacoes pos-procedimento fornecidas.',
  'Escleroterapia com espuma de polidocanol 1% guiada por Doppler em veia safena magna. Procedimento transcorreu sem complicacoes. Bandagem elastica aplicada. Paciente orientado quanto ao uso de meia elastica.',
];

export default function ConsultorioPage() {
  const { user, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const service = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmDialog();

  // Queue data
  const [filaDoMedico, setFilaDoMedico] = useState<Atendimento[]>([]);
  const [filaUnidade, setFilaUnidade] = useState<Atendimento[]>([]);
  const [finalizados, setFinalizados] = useState<Atendimento[]>([]);
  const [showFinalizados, setShowFinalizados] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessoesPaciente, setSessoesPaciente] = useState<number>(0);

  // Atendimento state
  const [atendimentoAtual, setAtendimentoAtual] = useState<Atendimento | null>(null);
  const [historico, setHistorico] = useState<Atendimento[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prontuario, setProntuario] = useState({ doppler: '', anamnese: '', descricao_procedimento: '', observacoes: '' });

  // Templates state
  const [templates, setTemplates] = useState<string[]>(DEFAULT_TEMPLATES);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newTemplate, setNewTemplate] = useState('');

  // Reload interval for wait times
  const [, setRefreshKey] = useState(0);

  // Load doctor's queue
  const loadFilaMedico = useCallback(async () => {
    if (!user || !selectedUnidade) return;
    try {
      const data = await service.getFilaDoDia(selectedUnidade.id, user.id);
      setFilaDoMedico(data);
    } catch (err) {
      console.error(err);
    }
  }, [user, selectedUnidade, service]);

  // Load unit's entire queue (for summary stats)
  const loadFilaUnidade = useCallback(async () => {
    if (!selectedUnidade) return;
    try {
      const data = await service.getFilaDoDia(selectedUnidade.id);
      setFilaUnidade(data);
    } catch (err) {
      console.error(err);
    }
  }, [selectedUnidade, service]);

  // Load finalized atendimentos for selected date
  const loadFinalizados = useCallback(async () => {
    if (!user || !selectedUnidade) return;
    try {
      const data = await service.getFinalizadosPorData(selectedUnidade.id, user.id, selectedDate);
      setFinalizados(data);
    } catch (err) {
      console.error(err);
    }
  }, [user, selectedUnidade, service, selectedDate]);

  useEffect(() => {
    if (showFinalizados) loadFinalizados();
  }, [showFinalizados, selectedDate, loadFinalizados]);

  // Setup real-time subscription and polling
  useEffect(() => {
    if (user && selectedUnidade) {
      loadFilaMedico();
      loadFilaUnidade();

      // Refresh wait times every minute
      const interval = setInterval(() => setRefreshKey(k => k + 1), 60000);

      const channel = supabase
        .channel('consultorio-rt')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'atendimentos',
          filter: `unidade_id=eq.${selectedUnidade.id}`,
        }, () => {
          loadFilaMedico();
          loadFilaUnidade();
        })
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }
  }, [user, selectedUnidade, loadFilaMedico, loadFilaUnidade, supabase]);

  // Calculate queue summary stats
  const stats = useMemo(() => {
    const aguardando = filaUnidade.filter(a => a.status === 'aguardando').length;
    const emAtendimento = filaUnidade.filter(a => a.status === 'em_atendimento').length;
    const finalizados = filaUnidade.filter(a => a.status === 'finalizado');

    let avgWait = 0;
    let countWithTimes = 0;
    finalizados.forEach(a => {
      if (a.hora_chegada && a.hora_inicio_atendimento) {
        const waitMs = new Date(a.hora_inicio_atendimento).getTime() - new Date(a.hora_chegada).getTime();
        avgWait += waitMs / 60000;
        countWithTimes++;
      }
    });
    avgWait = countWithTimes > 0 ? Math.round(avgWait / countWithTimes) : 0;

    return { aguardando, emAtendimento, finalizados: finalizados.length, avgWait };
  }, [filaUnidade]);

  async function iniciarAtendimento(atend: Atendimento) {
    await service.atualizarStatus(atend.id, 'em_atendimento', { hora_inicio_atendimento: new Date().toISOString() });
    setAtendimentoAtual({ ...atend, status: 'em_atendimento' as any });
    setProntuario({
      doppler: atend.doppler || '',
      anamnese: atend.anamnese || '',
      descricao_procedimento: atend.descricao_procedimento || '',
      observacoes: atend.observacoes || '',
    });
    const hist = await service.getHistoricoPaciente(atend.paciente_id);
    setHistorico(hist);
    // Load session count
    const sessoes = await service.contarSessoes12Meses(atend.paciente_id);
    setSessoesPaciente(sessoes);
    loadFilaMedico();
  }

  async function reabrirAtendimento(atend: Atendimento) {
    confirm({
      title: 'Reabrir Prontuario',
      description: `Deseja reabrir o prontuario de ${atend.paciente?.nome_completo}? Voce podera editar e finalizar novamente.`,
      variant: 'default',
      confirmLabel: 'Reabrir',
      onConfirm: async () => {
        try {
          await service.reabrirAtendimento(atend.id);
          toast.success('Prontuario reaberto para edicao');
          setAtendimentoAtual({ ...atend, status: 'em_atendimento' as any });
          setProntuario({
            doppler: atend.doppler || '',
            anamnese: atend.anamnese || '',
            descricao_procedimento: atend.descricao_procedimento || '',
            observacoes: atend.observacoes || '',
          });
          const hist = await service.getHistoricoPaciente(atend.paciente_id);
          setHistorico(hist);
          const sessoes = await service.contarSessoes12Meses(atend.paciente_id);
          setSessoesPaciente(sessoes);
          setShowFinalizados(false);
          loadFilaMedico();
          loadFilaUnidade();
          loadFinalizados();
        } catch (err: any) {
          toast.error(err.message || 'Erro ao reabrir');
        }
        closeConfirm();
      },
    });
  }

  async function salvarProntuario(finalizar = false) {
    if (!atendimentoAtual) return;
    if (finalizar) {
      confirm({
        title: 'Finalizar Atendimento',
        description: `Confirma a finalizacao do atendimento de ${atendimentoAtual.paciente?.nome_completo}? O prontuario sera salvo e o status sera alterado para finalizado.`,
        variant: 'default',
        confirmLabel: 'Finalizar',
        onConfirm: async () => {
          await doSave(true);
          closeConfirm();
        },
      });
      return;
    }
    await doSave(false);
  }

  async function doSave(finalizar: boolean) {
    if (!atendimentoAtual) return;
    setSaving(true);
    try {
      await service.salvarProntuario(atendimentoAtual.id, prontuario, finalizar);
      if (finalizar) {
        toast.success('Atendimento finalizado com sucesso');
        setAtendimentoAtual(null);
        setProntuario({ doppler: '', anamnese: '', descricao_procedimento: '', observacoes: '' });
        setHistorico([]);
        setShowHistorico(false);
      } else {
        toast.success('Prontuario salvo');
      }
      loadFilaMedico();
      loadFilaUnidade();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  function addTemplate() {
    if (!newTemplate.trim()) {
      toast.error('Template nao pode estar vazio');
      return;
    }
    setTemplates([...templates, newTemplate]);
    setNewTemplate('');
    toast.success('Template adicionado');
  }

  function updateTemplate() {
    if (editingIndex === null) return;
    if (!editingTemplate.trim()) {
      toast.error('Template nao pode estar vazio');
      return;
    }
    const updated = [...templates];
    updated[editingIndex] = editingTemplate;
    setTemplates(updated);
    setEditingIndex(null);
    setEditingTemplate('');
    toast.success('Template atualizado');
  }

  function deleteTemplate(index: number) {
    setTemplates(templates.filter((_, i) => i !== index));
    toast.success('Template removido');
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto pt-16 lg:pt-0">
      <PageHeader
        title="Consultorio"
        subtitle={`Dr(a). ${user?.nome_completo?.split(' ')[0]} • ${(selectedUnidade as any)?.municipio?.nome || '—'} • ${formatDate(new Date(), 'dd/MM/yyyy')}`}
      />

      {/* Queue Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="card p-4 border-l-4 border-blue-500">
          <p className="text-xs text-surface-500 uppercase tracking-wide">Aguardando</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{stats.aguardando}</p>
        </div>
        <div className="card p-4 border-l-4 border-amber-500">
          <p className="text-xs text-surface-500 uppercase tracking-wide">Em Atendimento</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{stats.emAtendimento}</p>
        </div>
        <div className="card p-4 border-l-4 border-emerald-500">
          <p className="text-xs text-surface-500 uppercase tracking-wide">Finalizados</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{stats.finalizados}</p>
        </div>
        <div className="card p-4 border-l-4 border-purple-500">
          <p className="text-xs text-surface-500 uppercase tracking-wide">Tempo Medio</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{stats.avgWait}m</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Queue */}
        <div className="lg:col-span-1">
          <div className="card sticky top-6">
            {/* Tab Toggle: Fila / Finalizados */}
            <div className="px-4 py-2 border-b border-surface-100 flex items-center gap-1">
              <button
                onClick={() => setShowFinalizados(false)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                  !showFinalizados ? 'bg-brand-500 text-white' : 'text-surface-600 hover:bg-surface-100'
                )}
              >
                Fila ({filaDoMedico.length})
              </button>
              <button
                onClick={() => setShowFinalizados(true)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                  showFinalizados ? 'bg-emerald-500 text-white' : 'text-surface-600 hover:bg-surface-100'
                )}
              >
                Finalizados ({showFinalizados ? finalizados.length : stats.finalizados})
              </button>
            </div>

            {/* Date picker for finalizados */}
            {showFinalizados && (
              <div className="px-4 py-2 border-b border-surface-100 bg-surface-50/50">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="input-field text-xs py-1.5"
                />
              </div>
            )}

            {/* Active queue */}
            {!showFinalizados && (
              <>
                {filaDoMedico.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-surface-400 text-sm">Nenhum paciente aguardando</p>
                  </div>
                ) : (
                  <div className="divide-y divide-surface-50">
                    {filaDoMedico.map((atend, idx) => {
                      const agePriority = getAgePriority(atend.paciente?.data_nascimento || null);
                      return (
                        <button
                          key={atend.id}
                          onClick={() => iniciarAtendimento(atend)}
                          className={cn(
                            'w-full text-left px-4 py-3 hover:bg-surface-50 transition-colors',
                            atendimentoAtual?.id === atend.id && 'bg-brand-50 border-l-4 border-brand-500'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs font-semibold text-surface-400 flex-shrink-0">#{idx + 1}</span>
                              <p className="text-sm font-medium text-surface-800 truncate">{atend.paciente?.nome_completo}</p>
                            </div>
                            <span className={`badge text-[10px] flex-shrink-0 ${getStatusColor(atend.status)}`}>
                              {getStatusLabel(atend.status)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1 text-xs text-surface-500">
                              <span className={agePriority.color}>{agePriority.age}a {agePriority.badge}</span>
                              {agePriority.label && <span className={`text-[10px] font-semibold ${agePriority.color}`}>{agePriority.label}</span>}
                              <span>•</span>
                              <span>{calcWaitTime(atend.hora_chegada)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Finalized list */}
            {showFinalizados && (
              <>
                {finalizados.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-surface-400 text-sm">Nenhum atendimento finalizado nesta data</p>
                  </div>
                ) : (
                  <div className="divide-y divide-surface-50">
                    {finalizados.map((atend) => {
                      const agePriority = getAgePriority(atend.paciente?.data_nascimento || null);
                      return (
                        <div
                          key={atend.id}
                          className="px-4 py-3 hover:bg-surface-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-surface-800 truncate">{atend.paciente?.nome_completo}</p>
                              <p className="text-xs text-surface-500 mt-0.5">
                                {agePriority.age}a • {atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
                                {atend.reabertura_count ? ` • Reaberto ${atend.reabertura_count}x` : ''}
                              </p>
                            </div>
                            <button
                              onClick={() => reabrirAtendimento(atend)}
                              className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-md hover:bg-amber-100 transition-colors flex-shrink-0"
                            >
                              Reabrir
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Prontuario */}
        <div className="lg:col-span-2">
          {!atendimentoAtual ? (
            <div className="card">
              <EmptyState
                icon="📋"
                title="Selecione um paciente da fila"
                description="Clique em um paciente para iniciar o atendimento"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Session Alert */}
              {sessoesPaciente >= 4 && (
                <div className="card p-3 bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 text-lg">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-red-700">ALERTA: {sessoesPaciente}a sessao em menos de 12 meses</p>
                      <p className="text-xs text-red-600">Paciente atingiu o limite de sessoes. Verificar necessidade clinica.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Patient Header */}
              <div className="card p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-display font-bold text-surface-900 text-lg">
                      {atendimentoAtual.paciente?.nome_completo}
                      {sessoesPaciente > 0 && (
                        <span className={cn(
                          'ml-2 text-xs font-semibold px-2 py-0.5 rounded-full',
                          sessoesPaciente >= 4 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        )}>
                          Sessao {sessoesPaciente}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-surface-500 mt-0.5">
                      {calcularIdade(atendimentoAtual.paciente?.data_nascimento || '')} anos •{' '}
                      {atendimentoAtual.paciente?.sexo === 'F' ? 'Feminino' : 'Masculino'} • CPF:{' '}
                      {maskCPF(atendimentoAtual.paciente?.cpf || '')} • Nasc:{' '}
                      {formatDate(atendimentoAtual.paciente?.data_nascimento || '', 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowHistorico(!showHistorico)}
                    className={cn('btn-secondary text-xs flex-shrink-0', showHistorico && 'bg-brand-50 border-brand-300')}
                  >
                    Historico ({historico.length})
                  </button>
                </div>
              </div>

              {/* History */}
              {showHistorico && historico.length > 0 && (
                <div className="card p-4">
                  <h4 className="font-semibold text-surface-800 mb-3 text-sm">Atendimentos Anteriores</h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {historico.map((h) => (
                      <div key={h.id} className="bg-surface-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-surface-600">
                            {formatDate(h.data_atendimento, 'dd/MM/yyyy')} • {(h.unidade as any)?.municipio?.nome}
                          </span>
                          <span className="badge bg-surface-200 text-surface-600 text-[10px]">
                            {h.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
                          </span>
                        </div>
                        {h.doppler && (
                          <p className="text-xs text-surface-600">
                            <strong>Doppler:</strong> {h.doppler}
                          </p>
                        )}
                        {h.anamnese && (
                          <p className="text-xs text-surface-600 mt-1">
                            <strong>Anamnese:</strong> {h.anamnese}
                          </p>
                        )}
                        {h.descricao_procedimento && (
                          <p className="text-xs text-surface-600 mt-1">
                            <strong>Procedimento:</strong> {h.descricao_procedimento}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form */}
              <div className="card">
                <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
                  <h3 className="font-display font-semibold text-surface-800">Prontuario</h3>
                  <button
                    onClick={() => setShowTemplateEditor(!showTemplateEditor)}
                    className="text-[11px] font-semibold text-brand-600 bg-brand-50 px-2 py-1 rounded-md hover:bg-brand-100 transition-colors"
                  >
                    Editar Templates
                  </button>
                </div>

                {/* Template Editor Modal */}
                {showTemplateEditor && (
                  <div className="p-5 border-b border-surface-100 bg-blue-50 rounded-b-lg">
                    <h4 className="font-semibold text-surface-800 mb-3 text-sm">Gerenciar Templates</h4>

                    {/* Existing Templates */}
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                      {templates.map((t, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-2 bg-white rounded-md border border-surface-100 group hover:border-surface-300 transition"
                        >
                          <div className="flex-1">
                            {editingIndex === idx ? (
                              <textarea
                                value={editingTemplate}
                                onChange={(e) => setEditingTemplate(e.target.value)}
                                className="input-field text-xs resize-none"
                                rows={3}
                              />
                            ) : (
                              <p className="text-xs text-surface-600 line-clamp-2">{t}</p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {editingIndex === idx ? (
                              <>
                                <button
                                  onClick={updateTemplate}
                                  className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingIndex(null);
                                    setEditingTemplate('');
                                  }}
                                  className="text-[10px] text-surface-600 bg-surface-100 px-2 py-1 rounded hover:bg-surface-200"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingIndex(idx);
                                    setEditingTemplate(t);
                                  }}
                                  className="text-[10px] text-brand-600 bg-brand-50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => deleteTemplate(idx)}
                                  className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
                                >
                                  Deletar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Template */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-surface-600">Adicionar Novo Template</p>
                      <textarea
                        value={newTemplate}
                        onChange={(e) => setNewTemplate(e.target.value)}
                        className="input-field text-xs resize-none"
                        rows={3}
                        placeholder="Digite o novo template..."
                      />
                      <button
                        onClick={addTemplate}
                        className="btn-primary text-xs w-full"
                      >
                        Adicionar Template
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  {[
                    { key: 'doppler', label: 'Doppler Vascular', color: 'bg-blue-500', placeholder: 'Achados do Doppler vascular...', rows: 3 },
                    { key: 'anamnese', label: 'Anamnese', color: 'bg-amber-500', placeholder: 'Historia clinica, queixas, sintomas...', rows: 3 },
                    { key: 'descricao_procedimento', label: 'Descricao do Procedimento', color: 'bg-emerald-500', placeholder: 'Descreva o procedimento realizado...', rows: 4, templates: true },
                    { key: 'observacoes', label: 'Observacoes', color: '', placeholder: 'Observacoes adicionais...', rows: 2 },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="input-label flex items-center gap-2">
                        {field.color && <span className={`w-2 h-2 rounded-full ${field.color}`} />}
                        {field.label}
                      </label>
                      <textarea
                        value={(prontuario as any)[field.key]}
                        onChange={(e) => setProntuario({ ...prontuario, [field.key]: e.target.value })}
                        className="input-field resize-y"
                        style={{ minHeight: `${field.rows * 28}px` }}
                        placeholder={field.placeholder}
                      />
                      {field.templates && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          {templates.map((t, i) => (
                            <button
                              key={i}
                              onClick={() => setProntuario({ ...prontuario, descricao_procedimento: t })}
                              className="text-[10px] text-brand-600 bg-brand-50 px-2 py-1 rounded-md hover:bg-brand-100 transition-colors"
                              title={t}
                            >
                              Template {i + 1}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 border-t border-surface-100 flex justify-between gap-2">
                  <button onClick={() => salvarProntuario(false)} disabled={saving} className="btn-secondary text-sm">
                    Salvar Rascunho
                  </button>
                  <button onClick={() => salvarProntuario(true)} disabled={saving} className="btn-success text-sm">
                    {saving ? 'Salvando...' : 'Finalizar Atendimento'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
