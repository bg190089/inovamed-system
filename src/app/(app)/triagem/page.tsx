'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { AtendimentoService, TriagemService, AgendamentoService } from '@/lib/services';
import type { Triagem } from '@/lib/services/triagemService';
import { toast } from 'sonner';
import { formatDate, calcularIdade, cn, maskCPF, maskPhone } from '@/lib/utils';
import { PageHeader } from '@/components/ui';
import type { Atendimento, Profissional } from '@/types';

interface TriagemForm {
  alergia: string;
  pressao_arterial: string;
  hgt: string;
  diabetes: boolean;
  hipertensao: boolean;
  doencas_cardiacas: boolean;
  doencas_hepaticas: boolean;
  doencas_renais: boolean;
  outras_doencas: string;
  escleroterapia_anterior: boolean;
  escleroterapia_quando: string;
  trombose_embolia: boolean;
  trombose_embolia_detalhe: string;
  doencas_vasculares: boolean;
  doencas_vasculares_detalhe: string;
  doppler_venoso: boolean;
  doppler_venoso_detalhe: string;
  gravidez_amamentacao: boolean;
  observacao: string;
  data_primeira_sessao: string;
}

const EMPTY_FORM: TriagemForm = {
  alergia: '', pressao_arterial: '', hgt: '',
  diabetes: false, hipertensao: false, doencas_cardiacas: false,
  doencas_hepaticas: false, doencas_renais: false, outras_doencas: '',
  escleroterapia_anterior: false, escleroterapia_quando: '',
  trombose_embolia: false, trombose_embolia_detalhe: '',
  doencas_vasculares: false, doencas_vasculares_detalhe: '',
  doppler_venoso: false, doppler_venoso_detalhe: '',
  gravidez_amamentacao: false, observacao: '', data_primeira_sessao: '',
};

export default function TriagemPage() {
  const { user, selectedEmpresa, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const atendimentoService = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const triagemService = useMemo(() => new TriagemService(supabase), [supabase]);
  const agendamentoService = useMemo(() => new AgendamentoService(supabase), [supabase]);

  const [fila, setFila] = useState<Atendimento[]>([]);
  const [selectedAtend, setSelectedAtend] = useState<Atendimento | null>(null);
  const [form, setForm] = useState<TriagemForm>(EMPTY_FORM);
  const [historico, setHistorico] = useState<Triagem[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [medicos, setMedicos] = useState<Profissional[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load queue of patients waiting for triage
  const loadFila = useCallback(async () => {
    if (!selectedUnidade) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('atendimentos')
        .select('*, paciente:pacientes(*), profissional:profissionais(*), procedimento:procedimentos(*), unidade:unidades(*, municipio:municipios(*))')
        .eq('unidade_id', selectedUnidade.id)
        .eq('data_atendimento', today)
        .eq('status', 'aguardando_triagem')
        .order('hora_chegada', { ascending: true });
      setFila(data || []);
    } catch (err) { console.error(err); }
  }, [selectedUnidade, supabase]);

  useEffect(() => {
    if (selectedUnidade) {
      loadFila();
      atendimentoService.getMedicos().then(setMedicos);
      // Realtime
      const channel = supabase
        .channel('triagem-rt')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'atendimentos',
          filter: `unidade_id=eq.${selectedUnidade.id}`,
        }, () => loadFila())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedUnidade, loadFila, supabase, atendimentoService]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // When selecting a patient, load their triage history
  async function handleSelectPatient(atend: Atendimento) {
    setSelectedAtend(atend);
    setShowHistorico(false);
    setLoading(true);
    try {
      if (atend.paciente_id) {
        const hist = await triagemService.getHistoricoPaciente(atend.paciente_id);
        setHistorico(hist);
        if (hist.length > 0) {
          // Pre-fill from last triagem but leave PA, HGT and data blank
          const last = hist[0];
          setForm({
            alergia: last.alergia || '',
            pressao_arterial: '', // blank
            hgt: '', // blank
            diabetes: last.diabetes,
            hipertensao: last.hipertensao,
            doencas_cardiacas: last.doencas_cardiacas,
            doencas_hepaticas: last.doencas_hepaticas,
            doencas_renais: last.doencas_renais,
            outras_doencas: last.outras_doencas || '',
            escleroterapia_anterior: last.escleroterapia_anterior,
            escleroterapia_quando: last.escleroterapia_quando || '',
            trombose_embolia: last.trombose_embolia,
            trombose_embolia_detalhe: last.trombose_embolia_detalhe || '',
            doencas_vasculares: last.doencas_vasculares,
            doencas_vasculares_detalhe: last.doencas_vasculares_detalhe || '',
            doppler_venoso: last.doppler_venoso,
            doppler_venoso_detalhe: last.doppler_venoso_detalhe || '',
            gravidez_amamentacao: last.gravidez_amamentacao,
            observacao: last.observacao || '',
            data_primeira_sessao: '', // blank
          });
        } else {
          setForm(EMPTY_FORM);
        }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSalvarTriagem(encaminhar = true) {
    if (!selectedAtend || !selectedUnidade || !user) return;
    setSaving(true);
    try {
      // Create triagem record
      const triagem = await triagemService.criar({
        paciente_id: selectedAtend.paciente_id,
        unidade_id: selectedUnidade.id,
        profissional_id: user.id,
        empresa_id: selectedEmpresa?.id,
        ...form,
        data_primeira_sessao: form.data_primeira_sessao || null,
      });

      // Update atendimento: link triagem and move to doctor's queue
      if (encaminhar) {
        await atendimentoService.atualizarStatus(selectedAtend.id, 'aguardando', {
          triagem_id: triagem.id,
        });
        toast.success(`${selectedAtend.paciente?.nome_completo} encaminhado(a) para o médico`);
      } else {
        // Just save triagem without changing status
        await supabase.from('atendimentos').update({ triagem_id: triagem.id }).eq('id', selectedAtend.id);
        toast.success('Triagem salva');
      }

      // Create agendamento if data_primeira_sessao is set
      if (form.data_primeira_sessao && selectedAtend.profissional_id) {
        try {
          await agendamentoService.createAgendamento({
            empresa_id: selectedEmpresa?.id,
            unidade_id: selectedUnidade.id,
            paciente_id: selectedAtend.paciente_id,
            profissional_id: selectedAtend.profissional_id,
            procedimento_id: selectedAtend.procedimento_id,
            data_agendamento: form.data_primeira_sessao,
            hora_inicio: '08:00',
            status: 'agendado',
          });
        } catch (e) {
          console.error('Erro ao criar agendamento:', e);
        }
      }

      setSelectedAtend(null);
      setForm(EMPTY_FORM);
      setHistorico([]);
      loadFila();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar triagem');
    } finally { setSaving(false); }
  }

  const paciente = selectedAtend?.paciente;
  const _ = refreshKey;

  function calcWaitTime(hora: string | null): string {
    if (!hora) return '—';
    const diff = Math.floor((Date.now() - new Date(hora).getTime()) / 60000);
    if (diff < 1) return '<1 min';
    if (diff >= 60) { const h = Math.floor(diff / 60); const m = diff % 60; return m > 0 ? `${h}h${String(m).padStart(2,'0')}min` : `${h}h`; }
    return `${diff} min`;
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto pt-16 lg:pt-0">
      <PageHeader
        title="Triagem"
        subtitle={`${(selectedUnidade as any)?.municipio?.nome || '—'} • ${formatDate(new Date(), 'dd/MM/yyyy')} • ${fila.length} pacientes aguardando`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: Patient Queue */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-100 bg-purple-50">
              <h2 className="text-sm font-semibold text-purple-800">
                Fila da Triagem ({fila.length})
              </h2>
            </div>

            {fila.length === 0 ? (
              <div className="p-8 text-center text-surface-400 text-sm">
                Nenhum paciente aguardando triagem
              </div>
            ) : (
              <div className="divide-y divide-surface-100 max-h-[calc(100vh-250px)] overflow-y-auto">
                {fila.map(atend => {
                  const pac = atend.paciente;
                  const isSelected = selectedAtend?.id === atend.id;
                  const age = pac?.data_nascimento ? calcularIdade(pac.data_nascimento) : null;
                  return (
                    <button
                      key={atend.id}
                      onClick={() => handleSelectPatient(atend)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors hover:bg-purple-50',
                        isSelected && 'bg-purple-100 border-l-4 border-purple-600'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-surface-800 truncate">
                            {pac?.nome_completo || '—'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {age !== null && (
                              <span className="text-xs text-surface-500">{age}a</span>
                            )}
                            <span className="text-xs text-surface-400">•</span>
                            <span className="text-xs text-surface-500">
                              {atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-purple-600 font-medium">
                            {calcWaitTime(atend.hora_chegada)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Triage Form */}
        <div className="lg:col-span-8">
          {!selectedAtend ? (
            <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
              <svg className="w-16 h-16 mx-auto text-surface-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <h3 className="text-lg font-medium text-surface-700">Selecione um paciente da fila</h3>
              <p className="text-sm text-surface-400 mt-1">Clique em um paciente para iniciar a triagem</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
              {/* Patient Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-white border-b border-surface-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900">
                      {paciente?.nome_completo}
                    </h2>
                    <div className="flex items-center gap-3 mt-1 text-sm text-surface-500">
                      {paciente?.data_nascimento && (
                        <span>{calcularIdade(paciente.data_nascimento)}a • {formatDate(paciente.data_nascimento)}</span>
                      )}
                      <span>• {paciente?.sexo === 'F' ? 'Feminino' : 'Masculino'}</span>
                      {paciente?.cpf && <span>• CPF: {maskCPF(paciente.cpf)}</span>}
                      {paciente?.telefone && <span>• {maskPhone(paciente.telefone)}</span>}
                    </div>
                    {paciente?.logradouro && (
                      <p className="text-xs text-surface-400 mt-1">
                        {paciente.logradouro}{paciente.numero ? `, ${paciente.numero}` : ''} - {paciente.bairro || ''} - {paciente.cidade || ''}/{paciente.uf}
                      </p>
                    )}
                    {paciente?.cns && (
                      <p className="text-xs text-surface-400">Cartao SUS: {paciente.cns}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {historico.length > 0 && (
                      <button
                        onClick={() => setShowHistorico(!showHistorico)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors font-medium"
                      >
                        Historico ({historico.length})
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedAtend(null); setForm(EMPTY_FORM); setHistorico([]); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>

                {historico.length > 0 && !showHistorico && (
                  <div className="mt-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                    Paciente com {historico.length} triagem(ns) anterior(es). Dados pre-preenchidos. PA, HGT e data sessao em branco.
                  </div>
                )}
              </div>

              {/* History panel */}
              {showHistorico && historico.length > 0 && (
                <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 max-h-48 overflow-y-auto">
                  <h4 className="text-xs font-semibold text-amber-800 mb-2">Historico de Triagens</h4>
                  {historico.map((h, i) => (
                    <div key={h.id} className="text-xs text-amber-700 mb-1">
                      <span className="font-medium">{formatDate(h.created_at, 'dd/MM/yyyy HH:mm')}</span>
                      {' — '}PA: {h.pressao_arterial || '—'} | HGT: {h.hgt || '—'}
                      {h.observacao && ` | Obs: ${h.observacao}`}
                    </div>
                  ))}
                </div>
              )}

              {loading ? (
                <div className="p-12 text-center text-surface-400">Carregando...</div>
              ) : (
                <div className="p-6 space-y-6 max-h-[calc(100vh-350px)] overflow-y-auto">
                  {/* Section: Clinical Data */}
                  <div>
                    <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Dados Clinicos
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-surface-600 mb-1">Alergia</label>
                        <input type="text" value={form.alergia}
                          onChange={e => setForm(f => ({ ...f, alergia: e.target.value }))}
                          placeholder="Nenhuma / descrever..."
                          className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 mb-1">Pressao Arterial</label>
                        <input type="text" value={form.pressao_arterial}
                          onChange={e => setForm(f => ({ ...f, pressao_arterial: e.target.value }))}
                          placeholder="Ex: 120/80"
                          className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 mb-1">HGT (mg/dL)</label>
                        <input type="text" value={form.hgt}
                          onChange={e => setForm(f => ({ ...f, hgt: e.target.value }))}
                          placeholder="Ex: 95"
                          className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400" />
                      </div>
                    </div>
                  </div>

                  {/* Section: Disease History */}
                  <div>
                    <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      Historico de Doencas
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { key: 'diabetes', label: 'Diabetes' },
                        { key: 'hipertensao', label: 'Hipertensao' },
                        { key: 'doencas_cardiacas', label: 'Doencas Cardiacas' },
                        { key: 'doencas_hepaticas', label: 'Doencas Hepaticas' },
                        { key: 'doencas_renais', label: 'Doencas Renais' },
                      ].map(item => (
                        <label key={item.key} className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                          (form as any)[item.key] ? 'bg-red-50 border-red-300 text-red-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                        )}>
                          <input type="checkbox" checked={(form as any)[item.key]}
                            onChange={e => setForm(f => ({ ...f, [item.key]: e.target.checked }))}
                            className="rounded text-red-600 focus:ring-red-300" />
                          <span className="text-sm">{item.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-surface-600 mb-1">Outras Doencas</label>
                      <input type="text" value={form.outras_doencas}
                        onChange={e => setForm(f => ({ ...f, outras_doencas: e.target.value }))}
                        placeholder="Descrever outras doencas..."
                        className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400" />
                    </div>
                  </div>

                  {/* Section: Escleroterapia History */}
                  <div>
                    <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                      Historico de Escleroterapia
                    </h3>
                    <div className="space-y-3">
                      <label className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                        form.escleroterapia_anterior ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                      )}>
                        <input type="checkbox" checked={form.escleroterapia_anterior}
                          onChange={e => setForm(f => ({ ...f, escleroterapia_anterior: e.target.checked }))}
                          className="rounded text-orange-600 focus:ring-orange-300" />
                        <span className="text-sm">Ja foi submetido(a) a escleroterapia antes?</span>
                      </label>
                      {form.escleroterapia_anterior && (
                        <input type="text" value={form.escleroterapia_quando}
                          onChange={e => setForm(f => ({ ...f, escleroterapia_quando: e.target.value }))}
                          placeholder="Quando? Ex: 2023, ha 2 anos..."
                          className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm bg-orange-50 focus:ring-2 focus:ring-orange-300" />
                      )}

                      <label className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                        form.trombose_embolia ? 'bg-red-50 border-red-300 text-red-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                      )}>
                        <input type="checkbox" checked={form.trombose_embolia}
                          onChange={e => setForm(f => ({ ...f, trombose_embolia: e.target.checked }))}
                          className="rounded text-red-600 focus:ring-red-300" />
                        <span className="text-sm">Trombose ou Embolia Pulmonar?</span>
                      </label>
                      {form.trombose_embolia && (
                        <input type="text" value={form.trombose_embolia_detalhe}
                          onChange={e => setForm(f => ({ ...f, trombose_embolia_detalhe: e.target.value }))}
                          placeholder="Detalhar..."
                          className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-red-50 focus:ring-2 focus:ring-red-300" />
                      )}

                      <label className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                        form.doencas_vasculares ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                      )}>
                        <input type="checkbox" checked={form.doencas_vasculares}
                          onChange={e => setForm(f => ({ ...f, doencas_vasculares: e.target.checked }))}
                          className="rounded text-orange-600 focus:ring-orange-300" />
                        <span className="text-sm">Historico de Doencas Vasculares? (varizes, tromboflebite, ulceras venosas)</span>
                      </label>
                      {form.doencas_vasculares && (
                        <input type="text" value={form.doencas_vasculares_detalhe}
                          onChange={e => setForm(f => ({ ...f, doencas_vasculares_detalhe: e.target.value }))}
                          placeholder="Detalhar..."
                          className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm bg-orange-50 focus:ring-2 focus:ring-orange-300" />
                      )}

                      <label className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                        form.doppler_venoso ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                      )}>
                        <input type="checkbox" checked={form.doppler_venoso}
                          onChange={e => setForm(f => ({ ...f, doppler_venoso: e.target.checked }))}
                          className="rounded text-blue-600 focus:ring-blue-300" />
                        <span className="text-sm">Exame de Doppler Venoso?</span>
                      </label>
                      {form.doppler_venoso && (
                        <input type="text" value={form.doppler_venoso_detalhe}
                          onChange={e => setForm(f => ({ ...f, doppler_venoso_detalhe: e.target.value }))}
                          placeholder="Resultado / observacoes do doppler..."
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-blue-50 focus:ring-2 focus:ring-blue-300" />
                      )}
                    </div>
                  </div>

                  {/* Section: Other */}
                  <div>
                    <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                      Outras Informacoes
                    </h3>
                    {paciente?.sexo === 'F' && (
                      <label className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors mb-3',
                        form.gravidez_amamentacao ? 'bg-pink-50 border-pink-300 text-pink-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                      )}>
                        <input type="checkbox" checked={form.gravidez_amamentacao}
                          onChange={e => setForm(f => ({ ...f, gravidez_amamentacao: e.target.checked }))}
                          className="rounded text-pink-600 focus:ring-pink-300" />
                        <span className="text-sm">Gravidez ou Amamentacao?</span>
                      </label>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Observacao</label>
                      <textarea value={form.observacao}
                        onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                        rows={3} placeholder="Observacoes gerais da triagem..."
                        className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 resize-none" />
                    </div>
                  </div>

                  {/* Section: Scheduling */}
                  <div>
                    <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Agendamento
                    </h3>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Data da Primeira Sessao</label>
                      <input type="date" value={form.data_primeira_sessao}
                        onChange={e => setForm(f => ({ ...f, data_primeira_sessao: e.target.value }))}
                        className="w-full sm:w-64 px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                      <p className="text-xs text-surface-400 mt-1">Sera criado automaticamente no modulo de Agendamento</p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 pt-4 border-t border-surface-100">
                    <button
                      onClick={() => handleSalvarTriagem(true)}
                      disabled={saving}
                      className="flex-1 sm:flex-none px-6 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Salvando...' : 'Salvar e Encaminhar ao Medico'}
                    </button>
                    <button
                      onClick={() => handleSalvarTriagem(false)}
                      disabled={saving}
                      className="px-4 py-2.5 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200 disabled:opacity-50 transition-colors"
                    >
                      Salvar Rascunho
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
