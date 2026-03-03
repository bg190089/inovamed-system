'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { PacienteService, AgendamentoService, AtendimentoService } from '@/lib/services';
import { toast } from 'sonner';
import { maskCPF, formatDate, calcularIdade, cn } from '@/lib/utils';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/ui';
import type { Agendamento, Paciente, Procedimento, Profissional } from '@/types';

export default function AgendamentoPage() {
  const { selectedEmpresa, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const pacienteService = useMemo(() => new PacienteService(supabase), [supabase]);
  const agendamentoService = useMemo(() => new AgendamentoService(supabase), [supabase]);
  const atendimentoService = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmDialog();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [weekAgendamentos, setWeekAgendamentos] = useState<Record<string, Agendamento[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Paciente[]>([]);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [pacienteHistory, setPacienteHistory] = useState<Agendamento[]>([]);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfissionalFilter, setSelectedProfissionalFilter] = useState<string>('');
  const [prefilledRetorno, setPrefilledRetorno] = useState<Agendamento | null>(null);
  const [sessoesPaciente, setSessoesPaciente] = useState<number>(0);

  const [form, setForm] = useState({
    data_agendamento: new Date().toISOString().split('T')[0],
    horario_inicio: '09:00',
    horario_fim: '10:00',
    procedimento_id: '',
    profissional_id: '',
    observacoes: '',
    tipo_consulta: 'primeira' as 'primeira' | 'retorno',
  });

  // Helpers
  const isRetorno = (obs?: string | null) => obs?.startsWith('[RETORNO]') || obs?.startsWith('[SESSAO');
  const getSessaoLabel = (obs?: string | null, numSessao?: number | null) => {
    if (numSessao) return `Sessao ${numSessao}`;
    const match = obs?.match(/\[SESSAO (\d+)\]/);
    if (match) return `Sessao ${match[1]}`;
    if (obs?.startsWith('[RETORNO]')) return 'Retorno';
    return '1a Sessao';
  };

  const getWeekDays = useCallback((date: string) => {
    const d = new Date(date);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      return dd.toISOString().split('T')[0];
    });
  }, []);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      agendado: 'bg-blue-100 text-blue-700',
      confirmado: 'bg-green-100 text-green-700',
      cancelado: 'bg-red-100 text-red-700',
      realizado: 'bg-emerald-100 text-emerald-700',
      faltou: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      agendado: 'Agendado',
      confirmado: 'Confirmado',
      cancelado: 'Cancelado',
      realizado: 'Realizado',
      faltou: 'Faltou',
    };
    return labels[status] || status;
  };

  const loadAgendamentos = useCallback(async () => {
    if (!selectedUnidade) return;
    try {
      if (viewMode === 'day') {
        const data = await agendamentoService.getAgendamentosDia(selectedDate, selectedUnidade.id);
        setAgendamentos(data);
      } else {
        const weekDays = getWeekDays(selectedDate);
        const weekData: Record<string, Agendamento[]> = {};
        for (const day of weekDays) {
          const data = await agendamentoService.getAgendamentosDia(day, selectedUnidade.id);
          weekData[day] = data;
        }
        setWeekAgendamentos(weekData);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar agendamentos');
    }
  }, [selectedDate, selectedUnidade, agendamentoService, viewMode, getWeekDays]);

  const loadPacienteHistory = useCallback(async (pacienteId: string) => {
    try {
      const history = await agendamentoService.getAgendamentosPaciente(pacienteId);
      setPacienteHistory(history.slice(0, 5));
    } catch (err) {
      console.error(err);
    }
  }, [agendamentoService]);

  useEffect(() => {
    if (selectedUnidade) {
      agendamentoService.getProcedimentos().then(setProcedimentos);
      agendamentoService.getMedicos().then(setProfissionais);
      loadAgendamentos();

      const channel = supabase
        .channel('agendamento-rt')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'agendamentos',
          filter: `unidade_id=eq.${selectedUnidade.id}`,
        }, () => loadAgendamentos())
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedUnidade, loadAgendamentos, supabase, agendamentoService]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (searchTerm.length < 3) {
        setSearchResults([]);
        return;
      }
      const results = await pacienteService.buscar(searchTerm);
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, pacienteService]);

  async function selectPaciente(pac: Paciente) {
    setSelectedPaciente(pac);
    loadPacienteHistory(pac.id);
    setSearchResults([]);
    setSearchTerm('');
    // Load session count
    try {
      const count = await atendimentoService.contarSessoes12Meses(pac.id);
      setSessoesPaciente(count);
    } catch { setSessoesPaciente(0); }
  }

  async function handleCreateAgendamento() {
    if (!selectedPaciente) {
      toast.error('Selecione um paciente');
      return;
    }
    if (!form.procedimento_id) {
      toast.error('Selecione o procedimento');
      return;
    }
    if (!form.profissional_id) {
      toast.error('Selecione o profissional');
      return;
    }
    if (!selectedEmpresa || !selectedUnidade) {
      toast.error('Selecione empresa e unidade');
      return;
    }

    setLoading(true);
    try {
      const sessaoLabel = sessoesPaciente > 0 ? `[SESSAO ${sessoesPaciente + 1}] ` : '[SESSAO 1] ';
      const fullObs = sessaoLabel + (form.observacoes || '');

      await agendamentoService.createAgendamento({
        empresa_id: selectedEmpresa.id,
        unidade_id: selectedUnidade.id,
        paciente_id: selectedPaciente.id,
        profissional_id: form.profissional_id,
        procedimento_id: form.procedimento_id,
        data_agendamento: form.data_agendamento,
        horario_inicio: form.horario_inicio,
        horario_fim: form.horario_fim || null,
        observacoes: fullObs,
        numero_sessao: sessoesPaciente + 1,
        status: 'agendado',
      });

      toast.success(`Agendamento criado para ${selectedPaciente.nome_completo}`);
      resetAndClose();
      loadAgendamentos();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar agendamento');
    } finally {
      setLoading(false);
    }
  }

  function resetAndClose() {
    setShowModal(false);
    setSelectedPaciente(null);
    setSearchTerm('');
    setSearchResults([]);
    setPacienteHistory([]);
    setPrefilledRetorno(null);
    setSessoesPaciente(0);
    setForm({
      data_agendamento: new Date().toISOString().split('T')[0],
      horario_inicio: '09:00',
      horario_fim: '10:00',
      procedimento_id: '',
      profissional_id: '',
      observacoes: '',
      tipo_consulta: 'primeira',
    });
  }

  async function openRetornoModal(agendamento: Agendamento) {
    setPrefilledRetorno(agendamento);
    setSelectedPaciente(agendamento.paciente || null);

    // Load session count
    if (agendamento.paciente_id) {
      try {
        const count = await atendimentoService.contarSessoes12Meses(agendamento.paciente_id);
        setSessoesPaciente(count);
      } catch { setSessoesPaciente(0); }
    }

    const novaData = new Date(agendamento.data_agendamento);
    novaData.setDate(novaData.getDate() + 30);
    const proximaData = novaData.toISOString().split('T')[0];

    setForm({
      data_agendamento: proximaData,
      horario_inicio: agendamento.horario_inicio,
      horario_fim: agendamento.horario_fim || '10:00',
      procedimento_id: agendamento.procedimento_id,
      profissional_id: agendamento.profissional_id,
      observacoes: '',
      tipo_consulta: 'retorno',
    });

    setShowModal(true);
  }

  function confirmActionAgendamento(agendamento: Agendamento, action: 'confirmar' | 'cancelar' | 'realizado' | 'faltou') {
    const titles: Record<string, string> = {
      confirmar: 'Confirmar Agendamento',
      cancelar: 'Cancelar Agendamento',
      realizado: 'Marcar como Realizado',
      faltou: 'Marcar como Falta',
    };

    const descriptions: Record<string, string> = {
      confirmar: `Confirmar o agendamento de ${agendamento.paciente?.nome_completo}?`,
      cancelar: `Cancelar o agendamento de ${agendamento.paciente?.nome_completo}? Esta acao nao pode ser desfeita.`,
      realizado: `Marcar o agendamento de ${agendamento.paciente?.nome_completo} como realizado?`,
      faltou: `Marcar o agendamento de ${agendamento.paciente?.nome_completo} como falta?`,
    };

    const newStatus: Record<string, string> = {
      confirmar: 'confirmado',
      cancelar: 'cancelado',
      realizado: 'realizado',
      faltou: 'faltou',
    };

    confirm({
      title: titles[action],
      description: descriptions[action],
      variant: action === 'cancelar' ? 'danger' : 'default',
      confirmLabel: action === 'cancelar' ? 'Sim, Cancelar' : 'Confirmar',
      onConfirm: async () => {
        try {
          await agendamentoService.updateAgendamentoStatus(agendamento.id, newStatus[action]);
          toast.success('Agendamento atualizado');
          loadAgendamentos();
          closeConfirm();
        } catch (err: any) {
          toast.error(err.message || 'Erro ao atualizar agendamento');
        }
      },
    });
  }

  // Filtered agendamentos for day view
  const filteredAgendamentos = useMemo(() => {
    return selectedProfissionalFilter
      ? agendamentos.filter((a) => a.profissional_id === selectedProfissionalFilter)
      : agendamentos;
  }, [agendamentos, selectedProfissionalFilter]);

  // Filtered agendamentos for week view
  const filteredWeekAgendamentos = useMemo(() => {
    const result: Record<string, Agendamento[]> = {};
    for (const [day, items] of Object.entries(weekAgendamentos)) {
      result[day] = selectedProfissionalFilter
        ? items.filter((a) => a.profissional_id === selectedProfissionalFilter)
        : items;
    }
    return result;
  }, [weekAgendamentos, selectedProfissionalFilter]);

  // Stats calculations
  const stats = useMemo(() => {
    const allAgendamentos = Object.values(filteredWeekAgendamentos).flat();
    const dayAgendamentos = viewMode === 'day' ? filteredAgendamentos : allAgendamentos;

    return {
      agendados: dayAgendamentos.filter((a) => a.status === 'agendado').length,
      confirmados: dayAgendamentos.filter((a) => a.status === 'confirmado').length,
      realizados: dayAgendamentos.filter((a) => a.status === 'realizado').length,
      faltas: dayAgendamentos.filter((a) => a.status === 'faltou').length,
      total: dayAgendamentos.length,
    };
  }, [filteredAgendamentos, filteredWeekAgendamentos, viewMode]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Agendamentos"
        subtitle={`${(selectedUnidade as any)?.municipio?.nome || '—'} • ${formatDate(new Date(selectedDate), 'dd/MM/yyyy')}`}
        action={
          <button onClick={() => {
            resetAndClose();
            setShowModal(true);
          }} className="btn-primary text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Agendamento
          </button>
        }
      />

      {/* View Mode Toggle & Date Selector */}
      <div className="mb-6 card p-4 bg-white border border-surface-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="font-semibold text-surface-700 text-sm md:text-base">Visualizar:</label>
            <div className="flex gap-2 border border-surface-200 rounded-lg p-1">
              <button
                onClick={() => setViewMode('day')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded transition-colors',
                  viewMode === 'day'
                    ? 'bg-brand-500 text-white'
                    : 'text-surface-600 hover:bg-surface-100'
                )}
              >
                Dia
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded transition-colors',
                  viewMode === 'week'
                    ? 'bg-brand-500 text-white'
                    : 'text-surface-600 hover:bg-surface-100'
                )}
              >
                Semana
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="font-semibold text-surface-700 text-sm md:text-base">Data:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field w-full md:w-48"
            />
          </div>
        </div>

        {/* Doctor Filter */}
        <div className="flex items-center gap-2">
          <label className="font-semibold text-surface-700 text-sm md:text-base">Profissional:</label>
          <select
            value={selectedProfissionalFilter}
            onChange={(e) => setSelectedProfissionalFilter(e.target.value)}
            className="input-field flex-1"
          >
            <option value="">Todos</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                Dr(a). {p.nome_completo}
              </option>
            ))}
          </select>
          <button onClick={loadAgendamentos} className="text-xs text-brand-600 hover:text-brand-700 font-medium px-3 py-2 rounded-lg hover:bg-brand-50">
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mb-6">
        {[
          { label: 'Agendados', count: stats.agendados, bg: 'bg-blue-100', text: 'text-blue-600' },
          { label: 'Confirmados', count: stats.confirmados, bg: 'bg-green-100', text: 'text-green-600' },
          { label: 'Realizados', count: stats.realizados, bg: 'bg-emerald-100', text: 'text-emerald-600' },
          { label: 'Faltas', count: stats.faltas, bg: 'bg-red-100', text: 'text-red-600' },
        ].map((s, i) => (
          <div key={i} className="card p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full ${s.bg} flex items-center justify-center`}>
                <span className={`${s.text} font-bold text-xs md:text-sm`}>{s.count}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-surface-500 truncate">{s.label}</p>
                <p className="font-semibold text-surface-800 text-sm">{s.count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <div className="card mb-6">
          <div className="px-4 md:px-6 py-4 border-b border-surface-100">
            <h2 className="font-display font-semibold text-surface-800">Agendamentos da Semana</h2>
          </div>
          <div className="grid grid-cols-7 gap-1 md:gap-2 p-4 md:p-6">
            {getWeekDays(selectedDate).map((day) => {
              const dayAgendamentos = filteredWeekAgendamentos[day] || [];
              const dayOfWeek = new Date(day).toLocaleDateString('pt-BR', { weekday: 'short' });
              const dayNum = new Date(day).getDate();

              return (
                <button
                  key={day}
                  onClick={() => {
                    setSelectedDate(day);
                    setViewMode('day');
                  }}
                  className={cn(
                    'p-3 md:p-4 rounded-lg border-2 transition-all cursor-pointer text-center',
                    selectedDate === day
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-surface-200 hover:border-surface-300'
                  )}
                >
                  <p className="text-xs md:text-sm font-semibold text-surface-700 capitalize">{dayOfWeek}</p>
                  <p className="text-lg md:text-xl font-bold text-surface-800 mt-1">{dayNum}</p>
                  <p className="text-xs text-brand-600 font-medium mt-2">{dayAgendamentos.length} agend.</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View - Desktop Table */}
      {viewMode === 'day' && (
        <div className="card hidden md:block">
          <div className="px-4 md:px-6 py-4 border-b border-surface-100 flex items-center justify-between">
            <h2 className="font-display font-semibold text-surface-800">Agendamentos do Dia</h2>
          </div>
          {filteredAgendamentos.length === 0 ? (
            <EmptyState icon="📅" title="Nenhum agendamento" description='Clique em "Novo Agendamento" para começar' />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-3 text-left w-12">#</th>
                    <th className="px-4 py-3 text-left">Paciente</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Procedimento</th>
                    <th className="px-4 py-3 text-left">Profissional</th>
                    <th className="px-4 py-3 text-left">Horário</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center w-48">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgendamentos.map((agendamento, i) => (
                    <tr key={agendamento.id} className="table-row">
                      <td className="px-4 py-3 text-sm font-mono text-surface-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-surface-800">{agendamento.paciente?.nome_completo}</p>
                        <p className="text-xs text-surface-400">
                          {maskCPF(agendamento.paciente?.cpf || '')} • {calcularIdade(agendamento.paciente?.data_nascimento || '')}a
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'badge text-xs',
                          isRetorno(agendamento.observacoes) ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                        )}>
                          {getSessaoLabel(agendamento.observacoes, agendamento.numero_sessao)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('badge text-xs', agendamento.procedimento?.tipo === 'bilateral' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700')}>
                          {agendamento.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-600">Dr(a). {agendamento.profissional?.nome_completo?.split(' ')[0]}</td>
                      <td className="px-4 py-3 text-sm text-surface-500">
                        {agendamento.horario_inicio} {agendamento.horario_fim ? `- ${agendamento.horario_fim}` : ''}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${getStatusColor(agendamento.status)}`}>{getStatusLabel(agendamento.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {agendamento.status === 'agendado' && (
                            <>
                              <button
                                onClick={() => confirmActionAgendamento(agendamento, 'confirmar')}
                                className="text-green-600 hover:text-green-700 transition-colors"
                                title="Confirmar"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => confirmActionAgendamento(agendamento, 'cancelar')}
                                className="text-red-600 hover:text-red-700 transition-colors"
                                title="Cancelar"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </>
                          )}
                          {(agendamento.status === 'agendado' || agendamento.status === 'confirmado') && (
                            <>
                              <button
                                onClick={() => confirmActionAgendamento(agendamento, 'realizado')}
                                className="text-emerald-600 hover:text-emerald-700 transition-colors"
                                title="Marcar como Realizado"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => confirmActionAgendamento(agendamento, 'faltou')}
                                className="text-yellow-600 hover:text-yellow-700 transition-colors"
                                title="Marcar como Falta"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            </>
                          )}
                          {agendamento.status === 'realizado' && (
                            <button
                              onClick={() => openRetornoModal(agendamento)}
                              className="text-brand-600 hover:text-brand-700 transition-colors text-xs font-medium px-2 py-1 rounded hover:bg-brand-50"
                              title="Agendar Retorno"
                            >
                              Retorno
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Day View - Mobile Cards */}
      {viewMode === 'day' && (
        <div className="md:hidden space-y-3">
          {filteredAgendamentos.length === 0 ? (
            <EmptyState icon="📅" title="Nenhum agendamento" description='Clique em "Novo Agendamento" para começar' />
          ) : (
            filteredAgendamentos.map((agendamento, i) => (
              <div key={agendamento.id} className="card p-4 border border-surface-200">
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-800 truncate">{agendamento.paciente?.nome_completo}</p>
                      <p className="text-xs text-surface-400">
                        {maskCPF(agendamento.paciente?.cpf || '')} • {calcularIdade(agendamento.paciente?.data_nascimento || '')}a
                      </p>
                    </div>
                    <span className={`badge ${getStatusColor(agendamento.status)} text-xs whitespace-nowrap ml-2`}>
                      {getStatusLabel(agendamento.status)}
                    </span>
                  </div>

                  {/* Badges */}
                  <div className="flex gap-2 flex-wrap">
                    <span className={cn(
                      'badge text-xs',
                      isRetorno(agendamento.observacoes) ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                    )}>
                      {getSessaoLabel(agendamento.observacoes, agendamento.numero_sessao)}
                    </span>
                    <span className={cn('badge text-xs', agendamento.procedimento?.tipo === 'bilateral' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700')}>
                      {agendamento.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-1 text-xs text-surface-600 bg-surface-50 p-2 rounded">
                    <div><span className="font-medium">Profissional:</span> Dr(a). {agendamento.profissional?.nome_completo?.split(' ')[0]}</div>
                    <div><span className="font-medium">Horário:</span> {agendamento.horario_inicio} {agendamento.horario_fim ? `- ${agendamento.horario_fim}` : ''}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-surface-100">
                    {agendamento.status === 'agendado' && (
                      <>
                        <button
                          onClick={() => confirmActionAgendamento(agendamento, 'confirmar')}
                          className="flex-1 text-xs py-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 font-medium transition-colors"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => confirmActionAgendamento(agendamento, 'cancelar')}
                          className="flex-1 text-xs py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    {(agendamento.status === 'agendado' || agendamento.status === 'confirmado') && (
                      <>
                        <button
                          onClick={() => confirmActionAgendamento(agendamento, 'realizado')}
                          className="flex-1 text-xs py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium transition-colors"
                        >
                          Realizado
                        </button>
                        <button
                          onClick={() => confirmActionAgendamento(agendamento, 'faltou')}
                          className="flex-1 text-xs py-2 rounded-lg bg-yellow-50 text-yellow-600 hover:bg-yellow-100 font-medium transition-colors"
                        >
                          Falta
                        </button>
                      </>
                    )}
                    {agendamento.status === 'realizado' && (
                      <button
                        onClick={() => openRetornoModal(agendamento)}
                        className="flex-1 text-xs py-2 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 font-medium transition-colors"
                      >
                        Agendar Retorno
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {/* New/Return Agendamento Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-8 md:pt-12 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-elevated w-full max-w-2xl mb-8">
            <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-surface-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-display font-bold text-surface-900">
                {prefilledRetorno ? 'Proxima Sessao' : 'Novo Agendamento'}
              </h2>
              <button onClick={resetAndClose} className="p-2 rounded-lg hover:bg-surface-100">
                <svg className="w-5 h-5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
              {!selectedPaciente && (
                <div>
                  <label className="input-label">Buscar Paciente (CPF, CNS ou Nome)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input-field pl-10"
                      autoFocus
                      placeholder="Digite pelo menos 3 caracteres..."
                    />
                    <svg className="w-5 h-5 text-surface-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 border border-surface-200 rounded-xl overflow-hidden">
                      {searchResults.map((pac) => (
                        <button
                          key={pac.id}
                          onClick={() => selectPaciente(pac)}
                          className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors border-b border-surface-50 last:border-0"
                        >
                          <p className="font-medium text-surface-800 text-sm">{pac.nome_completo}</p>
                          <p className="text-xs text-surface-400">
                            CPF: {maskCPF(pac.cpf || '')} | Nasc: {formatDate(pac.data_nascimento)} | {calcularIdade(pac.data_nascimento)}a | {pac.sexo === 'F' ? 'Fem' : 'Masc'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedPaciente && (
                <>
                  <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand-800">{selectedPaciente.nome_completo}</p>
                      <p className="text-sm text-brand-600">CPF: {maskCPF(selectedPaciente.cpf || '')} | {calcularIdade(selectedPaciente.data_nascimento)}a</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPaciente(null);
                        setPacienteHistory([]);
                        setSearchTerm('');
                      }}
                      className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                    >
                      Trocar
                    </button>
                  </div>

                  {/* Patient History */}
                  {pacienteHistory.length > 0 && (
                    <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 space-y-2">
                      <p className="text-sm font-semibold text-surface-800">Histórico de Agendamentos</p>
                      <div className="space-y-2">
                        {pacienteHistory.map((agend) => (
                          <div key={agend.id} className="text-xs p-2 bg-white rounded border border-surface-100">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-surface-700">{formatDate(agend.data_agendamento, 'dd/MM/yyyy')} às {agend.horario_inicio}</span>
                              <span className={`badge text-xs ${getStatusColor(agend.status)}`}>{getStatusLabel(agend.status)}</span>
                            </div>
                            <p className="text-surface-600 mt-1">Profissional: Dr(a). {agend.profissional?.nome_completo}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-surface-100 pt-4 space-y-4">
                    <h3 className="font-semibold text-surface-800">Dados do Agendamento</h3>

                    {/* Session Info */}
                    <div>
                      <label className="input-label">Sessao</label>
                      <div className={cn(
                        'p-3 rounded-xl border-2 text-sm font-medium',
                        sessoesPaciente >= 3 ? 'border-red-300 bg-red-50 text-red-700' : 'border-blue-300 bg-blue-50 text-blue-700'
                      )}>
                        {selectedPaciente ? (
                          <div className="flex items-center justify-between">
                            <span>Proxima: Sessao {sessoesPaciente + 1}</span>
                            <span className="text-xs opacity-75">{sessoesPaciente} sessao(es) nos ultimos 12 meses</span>
                          </div>
                        ) : (
                          <span className="text-surface-400">Selecione um paciente</span>
                        )}
                        {sessoesPaciente >= 3 && (
                          <p className="text-xs mt-1 text-red-600 font-bold">ATENCAO: Paciente atingira 4+ sessoes em 12 meses!</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="input-label">Data <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={form.data_agendamento}
                          onChange={(e) => setForm({ ...form, data_agendamento: e.target.value })}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="input-label">Hora Início <span className="text-red-500">*</span></label>
                        <input
                          type="time"
                          value={form.horario_inicio}
                          onChange={(e) => setForm({ ...form, horario_inicio: e.target.value })}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="input-label">Hora Fim</label>
                        <input
                          type="time"
                          value={form.horario_fim}
                          onChange={(e) => setForm({ ...form, horario_fim: e.target.value })}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="input-label">Procedimento <span className="text-red-500">*</span></label>
                        <select value={form.procedimento_id} onChange={(e) => setForm({ ...form, procedimento_id: e.target.value })} className="input-field">
                          <option value="">Selecione...</option>
                          {procedimentos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'} ({p.codigo_sus})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="input-label">Profissional <span className="text-red-500">*</span></label>
                        <select value={form.profissional_id} onChange={(e) => setForm({ ...form, profissional_id: e.target.value })} className="input-field">
                          <option value="">Selecione...</option>
                          {profissionais.map((p) => (
                            <option key={p.id} value={p.id}>
                              Dr(a). {p.nome_completo}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="input-label">Observações</label>
                      <textarea
                        value={form.observacoes}
                        onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                        className="input-field resize-none"
                        rows={3}
                        placeholder="Digite aqui qualquer observação relevante..."
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {selectedPaciente && (
              <div className="px-4 md:px-6 py-4 border-t border-surface-100 flex gap-3 sticky bottom-0 bg-white rounded-b-2xl justify-end">
                <button onClick={resetAndClose} className="btn-secondary">
                  Cancelar
                </button>
                <button onClick={handleCreateAgendamento} disabled={loading} className="btn-success">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Criando...
                    </span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {prefilledRetorno ? 'Agendar Proxima Sessao' : 'Criar Agendamento'}
                    </>
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
