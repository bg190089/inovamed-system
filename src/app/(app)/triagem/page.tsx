'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { AtendimentoService, TriagemService, AgendamentoService, PacienteService } from '@/lib/services';
import type { EscalaDoDia } from '@/lib/services/agendamentoService';
import type { Triagem } from '@/lib/services/triagemService';
import { toast } from 'sonner';
import { formatDate, calcularIdade, cn, maskCPF, maskPhone } from '@/lib/utils';
import { PageHeader } from '@/components/ui';
import type { Atendimento, Profissional } from '@/types';
import SignatureCanvas from 'react-signature-canvas';

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
  data_proxima_sessao: string;
}

const EMPTY_FORM: TriagemForm = {
  alergia: '', pressao_arterial: '', hgt: '',
  diabetes: false, hipertensao: false, doencas_cardiacas: false,
  doencas_hepaticas: false, doencas_renais: false, outras_doencas: '',
  escleroterapia_anterior: false, escleroterapia_quando: '',
  trombose_embolia: false, trombose_embolia_detalhe: '',
  doencas_vasculares: false, doencas_vasculares_detalhe: '',
  doppler_venoso: false, doppler_venoso_detalhe: '',
  gravidez_amamentacao: false, observacao: '', data_proxima_sessao: '',
};

export default function TriagemPage() {
  const { user, selectedEmpresa, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const atendimentoService = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const triagemService = useMemo(() => new TriagemService(supabase), [supabase]);
  const agendamentoService = useMemo(() => new AgendamentoService(supabase), [supabase]);
  const pacienteService = useMemo(() => new PacienteService(supabase), [supabase]);

  const [fila, setFila] = useState<Atendimento[]>([]);
  const [selectedAtend, setSelectedAtend] = useState<Atendimento | null>(null);
  const [form, setForm] = useState<TriagemForm>(EMPTY_FORM);
  const [historico, setHistorico] = useState<Triagem[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [medicos, setMedicos] = useState<Profissional[]>([]);
  const [procedimentos, setProcedimentos] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Nova triagem avulsa
  const [showNovaTriagem, setShowNovaTriagem] = useState(false);
  const [buscaPaciente, setBuscaPaciente] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<any[]>([]);
  const [pacienteAvulso, setPacienteAvulso] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);

  // Cadastro de novo paciente inline
  const [showCadastroPaciente, setShowCadastroPaciente] = useState(false);
  const [salvandoPaciente, setSalvandoPaciente] = useState(false);
  const [novoPaciente, setNovoPaciente] = useState({
    nome_completo: '', cpf: '', cns: '', data_nascimento: '',
    sexo: 'F' as 'F' | 'M', telefone: '', cep: '', logradouro: '',
    numero: '', complemento: '', bairro: '', cidade: '', uf: 'BA',
  });

  // Sessoes anteriores
  const [sessoesAnteriores, setSessoesAnteriores] = useState<{data: string; medico_nome: string}[]>([]);
  const [cadastroProximaSessao, setCadastroProximaSessao] = useState('');

  // TCLE (Termo de Consentimento)
  const [showTcle, setShowTcle] = useState(false);
  const [tclePaciente, setTclePaciente] = useState<any>(null);
  const [tcleEnviando, setTcleEnviando] = useState(false);
  const [tcleMedico, setTcleMedico] = useState<{ nome: string; crm: string } | null>(null);
  const [tcleIp, setTcleIp] = useState('');
  const sigCanvasRef = useRef<SignatureCanvas | null>(null);

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
      agendamentoService.getProcedimentos().then(setProcedimentos);
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

  // Busca de paciente para triagem avulsa (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (buscaPaciente.length < 3) { setResultadosBusca([]); return; }
      setBuscando(true);
      try {
        const results = await pacienteService.buscar(buscaPaciente);
        setResultadosBusca(results);
      } catch { setResultadosBusca([]); }
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaPaciente, pacienteService]);

  // Selecionar paciente avulso para triagem
  async function handleSelectPacienteAvulso(pac: any) {
    setPacienteAvulso(pac);
    setResultadosBusca([]);
    setBuscaPaciente('');
    setLoading(true);
    try {
      const hist = await triagemService.getHistoricoPaciente(pac.id);
      setHistorico(hist);
      if (hist.length > 0) {
        const last = hist[0];
        setForm({
          alergia: last.alergia || '',
          pressao_arterial: '',
          hgt: '',
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
          data_proxima_sessao: '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  // Criar novo paciente e ir direto para triagem
  async function handleCriarPaciente() {
    if (!novoPaciente.nome_completo.trim()) { toast.error('Nome completo e obrigatorio'); return; }
    if (!novoPaciente.data_nascimento) { toast.error('Data de nascimento e obrigatoria'); return; }
    setSalvandoPaciente(true);
    try {
      const cpfClean = novoPaciente.cpf.replace(/\D/g, '');
      const telClean = novoPaciente.telefone.replace(/\D/g, '');
      const cepClean = novoPaciente.cep.replace(/\D/g, '');

      // Prepare sessoes_anteriores with session numbers
      const sessoes_anteriores = sessoesAnteriores.map((s, idx) => ({
        numero: idx + 1,
        data: s.data,
        medico_nome: s.medico_nome,
      }));

      const created = await pacienteService.criar({
        nome_completo: novoPaciente.nome_completo.trim().toUpperCase(),
        cpf: cpfClean || undefined,
        cns: novoPaciente.cns.trim() || undefined,
        data_nascimento: novoPaciente.data_nascimento,
        sexo: novoPaciente.sexo,
        telefone: telClean || undefined,
        cep: cepClean || undefined,
        logradouro: novoPaciente.logradouro.trim() || undefined,
        numero: novoPaciente.numero.trim() || undefined,
        complemento: novoPaciente.complemento.trim() || undefined,
        bairro: novoPaciente.bairro.trim() || undefined,
        cidade: novoPaciente.cidade.trim() || undefined,
        uf: novoPaciente.uf || 'BA',
        sessoes_anteriores: sessoes_anteriores.length > 0 ? sessoes_anteriores : undefined,
      });
      toast.success(`Paciente ${created.nome_completo} cadastrado!`);

      // Create agendamento if cadastroProximaSessao is set
      if (cadastroProximaSessao && selectedEmpresa && selectedUnidade) {
        try {
          const defaultProc = procedimentos.find(p => p.tipo === 'bilateral') || procedimentos[0];
          const proximoNumeroSessao = sessoes_anteriores.length + 1;
          await agendamentoService.createAgendamento({
            empresa_id: selectedEmpresa.id,
            unidade_id: selectedUnidade.id,
            paciente_id: created.id,
            procedimento_id: defaultProc?.id,
            data_agendamento: cadastroProximaSessao,
            horario_inicio: '08:00',
            horario_fim: '09:00',
            numero_sessao: proximoNumeroSessao,
            status: 'agendado',
            observacoes: `[SESSAO] Agendado via cadastro de paciente - Sessão ${proximoNumeroSessao}`,
          });
          toast.success(`Agendamento criado para ${formatDate(cadastroProximaSessao)}`);
        } catch (e: any) {
          console.error('Erro ao criar agendamento:', e);
          toast.error('Erro ao criar agendamento: ' + (e?.message || ''));
        }
      }

      // Ir direto para triagem do novo paciente
      handleSelectPacienteAvulso(created);
      setShowCadastroPaciente(false);
      setNovoPaciente({ nome_completo: '', cpf: '', cns: '', data_nascimento: '', sexo: 'F', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'BA' });
      setSessoesAnteriores([]);
      setCadastroProximaSessao('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar paciente');
    } finally { setSalvandoPaciente(false); }
  }

  // ---------- TCLE Helpers ----------
  async function abrirTcle(pacienteData: any) {
    setTclePaciente(pacienteData);

    // Capturar IP
    try {
      const res = await fetch('/api/ip');
      const data = await res.json();
      setTcleIp(data.ip || '');
    } catch { setTcleIp(''); }

    // Buscar médico do dia via escala
    try {
      const today = new Date().toISOString().split('T')[0];
      const municipioNome = (selectedUnidade as any)?.municipio?.nome || '';
      if (municipioNome) {
        const escala = await agendamentoService.getEscalaDoDia(today, municipioNome);
        if (escala.length > 0) {
          // Buscar CRM do profissional
          const profId = escala[0].profissional_id;
          let crm = '';
          if (profId) {
            const { data: prof } = await supabase
              .from('profissionais')
              .select('crm')
              .eq('id', profId)
              .maybeSingle();
            crm = prof?.crm || '';
          }
          setTcleMedico({ nome: escala[0].medico_nome_formal, crm });
        } else {
          setTcleMedico(null);
        }
      } else {
        setTcleMedico(null);
      }
    } catch { setTcleMedico(null); }

    setShowTcle(true);
  }

  async function handleAssinarTcle() {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      toast.error('Assinatura do paciente é obrigatória');
      return;
    }
    if (!tclePaciente) return;

    setTcleEnviando(true);
    try {
      const assinaturaBase64 = sigCanvasRef.current.toDataURL('image/png');

      // Montar endereço
      const pac = tclePaciente;
      let endereco = '';
      if (pac.logradouro) {
        endereco = pac.logradouro;
        if (pac.numero) endereco += `, ${pac.numero}`;
        if (pac.bairro) endereco += ` - ${pac.bairro}`;
        if (pac.cidade) endereco += ` - ${pac.cidade}`;
        if (pac.uf) endereco += `/${pac.uf}`;
      }

      // Buscar dados do profissional logado (triador/testemunha)
      let triadorNome = user?.email || 'Profissional';
      let triadorCpf = '';
      if (user?.id) {
        const { data: profTriador } = await supabase
          .from('profissionais')
          .select('nome_completo, cpf')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profTriador) {
          triadorNome = profTriador.nome_completo;
          triadorCpf = profTriador.cpf || '';
        }
      }

      // Empresa
      const empresaNome = selectedEmpresa?.tipo === 'mj' ? 'M&J SERVICOS MEDICOS' : 'INOVAMED';

      const payload = {
        paciente_nome: pac.nome_completo,
        paciente_cpf: pac.cpf || '',
        paciente_data_nascimento: pac.data_nascimento || '',
        paciente_sexo: pac.sexo || '',
        paciente_endereco: endereco,
        medico_nome: tcleMedico?.nome || '',
        medico_crm: tcleMedico?.crm || '',
        triador_nome: triadorNome,
        triador_cpf: triadorCpf,
        unidade_nome: selectedUnidade?.nome || '',
        unidade_cnes: selectedUnidade?.cnes || '',
        municipio_nome: (selectedUnidade as any)?.municipio?.nome || '',
        empresa_nome: empresaNome,
        assinatura_paciente: assinaturaBase64,
        ip_address: tcleIp,
      };

      const res = await fetch('/api/drive/upload-tcle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.success) {
        toast.success('TCLE assinado e salvo no Google Drive!');
      } else {
        toast.error('Erro ao salvar TCLE: ' + (result.error || 'Erro desconhecido'));
      }
    } catch (err: any) {
      console.error('Erro TCLE:', err);
      toast.error('Erro ao processar TCLE');
    } finally {
      setTcleEnviando(false);
      setShowTcle(false);
      setTclePaciente(null);
      setTcleMedico(null);
      sigCanvasRef.current?.clear();
    }
  }

  function fecharTcleSemAssinar() {
    setShowTcle(false);
    setTclePaciente(null);
    setTcleMedico(null);
    sigCanvasRef.current?.clear();
  }

  // Salvar triagem avulsa (sem atendimento vinculado)
  async function handleSalvarTriagemAvulsa() {
    if (!pacienteAvulso || !selectedUnidade || !user) return;
    setSaving(true);
    try {
      await triagemService.criar({
        paciente_id: pacienteAvulso.id,
        unidade_id: selectedUnidade.id,
        profissional_id: user.id,
        empresa_id: selectedEmpresa?.id,
        ...form,
        data_proxima_sessao: form.data_proxima_sessao || null,
      });

      // Create agendamento if data_proxima_sessao is set
      if (form.data_proxima_sessao) {
        try {
          // Use bilateral as default procedimento, fallback to first available
          const defaultProc = procedimentos.find(p => p.tipo === 'bilateral') || procedimentos[0];
          await agendamentoService.createAgendamento({
            empresa_id: selectedEmpresa?.id,
            unidade_id: selectedUnidade.id,
            paciente_id: pacienteAvulso.id,
            procedimento_id: defaultProc?.id,
            data_agendamento: form.data_proxima_sessao,
            horario_inicio: '08:00',
            horario_fim: '09:00',
            numero_sessao: 1,
            status: 'agendado',
            observacoes: '[SESSAO] Agendado via triagem avulsa',
          });
          toast.success(`Agendamento criado para ${formatDate(form.data_proxima_sessao)}`);
        } catch (e: any) {
          console.error('Erro ao criar agendamento:', e);
          toast.error('Erro ao criar agendamento: ' + (e?.message || ''));
        }
      }

      toast.success(`Triagem avulsa salva para ${pacienteAvulso.nome_completo}`);

      // Abrir TCLE para assinatura antes de limpar os dados
      const pacParaTcle = { ...pacienteAvulso };
      setPacienteAvulso(null);
      setShowNovaTriagem(false);
      setForm(EMPTY_FORM);
      setHistorico([]);

      // Abrir modal TCLE (fire-and-forget no sentido do fluxo da triagem)
      abrirTcle(pacParaTcle);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar triagem avulsa');
    } finally { setSaving(false); }
  }

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
            data_proxima_sessao: '', // blank
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
        data_proxima_sessao: form.data_proxima_sessao || null,
      });

      // Update atendimento: link triagem and move to doctor's queue
      try {
        if (encaminhar) {
          await atendimentoService.atualizarStatus(selectedAtend.id, 'aguardando', {
            triagem_id: triagem.id,
          });
          toast.success(`${selectedAtend.paciente?.nome_completo} encaminhado(a) para o médico`);
        } else {
          await supabase.from('atendimentos').update({ triagem_id: triagem.id }).eq('id', selectedAtend.id);
          toast.success('Triagem salva');
        }
      } catch (e: any) {
        console.error('Erro ao atualizar atendimento:', e);
        toast.error('Erro ao encaminhar: ' + (e?.message || ''));
      }

      // Create agendamento if data_proxima_sessao is set (independent of above)
      if (form.data_proxima_sessao) {
        try {
          const defaultProc = procedimentos.find(p => p.tipo === 'bilateral') || procedimentos[0];
          const agendPayload: Record<string, any> = {
            empresa_id: selectedEmpresa?.id,
            unidade_id: selectedUnidade.id,
            paciente_id: selectedAtend.paciente_id,
            procedimento_id: selectedAtend.procedimento_id || defaultProc?.id,
            data_agendamento: form.data_proxima_sessao,
            horario_inicio: '08:00',
            horario_fim: '09:00',
            numero_sessao: 1,
            status: 'agendado',
            observacoes: '[SESSAO] Agendado via triagem',
          };
          if (selectedAtend.profissional_id) agendPayload.profissional_id = selectedAtend.profissional_id;
          await agendamentoService.createAgendamento(agendPayload);
          toast.success(`Agendamento criado para ${formatDate(form.data_proxima_sessao)}`);
        } catch (e: any) {
          console.error('Erro ao criar agendamento:', e);
          toast.error('Erro ao criar agendamento: ' + (e?.message || ''));
        }
      }

      // Abrir TCLE com dados do paciente antes de limpar
      const pacParaTcle = selectedAtend.paciente ? { ...selectedAtend.paciente } : null;
      setSelectedAtend(null);
      setForm(EMPTY_FORM);
      setHistorico([]);
      loadFila();

      // Abrir modal TCLE
      if (pacParaTcle) {
        abrirTcle(pacParaTcle);
      }
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
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Triagem"
          subtitle={`${(selectedUnidade as any)?.municipio?.nome || '—'} • ${formatDate(new Date(), 'dd/MM/yyyy')} • ${fila.length} pacientes aguardando`}
        />
        <button
          onClick={() => { setShowNovaTriagem(!showNovaTriagem); setSelectedAtend(null); setPacienteAvulso(null); setShowCadastroPaciente(false); setForm(EMPTY_FORM); setHistorico([]); }}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nova Triagem
        </button>
      </div>

      {/* Painel Nova Triagem Avulsa */}
      {showNovaTriagem && !pacienteAvulso && (
        <div className="card p-4 mb-6 border-2 border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-emerald-800">Nova Triagem Avulsa</h3>
            <button onClick={() => { setShowNovaTriagem(false); setShowCadastroPaciente(false); }} className="text-xs text-surface-400 hover:text-surface-600">Fechar</button>
          </div>

          {/* Tabs: Buscar / Cadastrar */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setShowCadastroPaciente(false)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', !showCadastroPaciente ? 'bg-emerald-600 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200')}>
              Buscar Paciente
            </button>
            <button onClick={() => setShowCadastroPaciente(true)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', showCadastroPaciente ? 'bg-emerald-600 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200')}>
              Cadastrar Novo Paciente
            </button>
          </div>

          {!showCadastroPaciente ? (
            <>
              <div className="relative">
                <input
                  type="text"
                  value={buscaPaciente}
                  onChange={(e) => setBuscaPaciente(e.target.value)}
                  className="w-full px-3 py-2 pl-9 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                  placeholder="Buscar paciente por nome, CPF ou CNS..."
                  autoFocus
                />
                <svg className="w-4 h-4 text-surface-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                {buscando && <div className="absolute right-3 top-2.5"><div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" /></div>}
              </div>
              {resultadosBusca.length > 0 && (
                <div className="mt-2 border border-surface-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto bg-white">
                  {resultadosBusca.map((pac: any) => (
                    <button key={pac.id} onClick={() => handleSelectPacienteAvulso(pac)}
                      className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 transition-colors border-b border-surface-50 last:border-0">
                      <p className="text-sm font-medium text-surface-800">{pac.nome_completo}</p>
                      <p className="text-xs text-surface-400">
                        CPF: {maskCPF(pac.cpf || '')} | {pac.data_nascimento ? calcularIdade(pac.data_nascimento) + 'a' : ''} | {pac.sexo === 'F' ? 'Fem' : 'Masc'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {buscaPaciente.length >= 3 && !buscando && resultadosBusca.length === 0 && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <p className="text-xs text-amber-700 mb-2">Nenhum paciente encontrado para "{buscaPaciente}"</p>
                  <button onClick={() => { setShowCadastroPaciente(true); setNovoPaciente(p => ({ ...p, nome_completo: buscaPaciente.toUpperCase() })); }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors">
                    Cadastrar Novo Paciente
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Formulario de Cadastro de Novo Paciente */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-surface-600 mb-1">Nome Completo *</label>
                  <input type="text" value={novoPaciente.nome_completo}
                    onChange={e => setNovoPaciente(p => ({ ...p, nome_completo: e.target.value }))}
                    placeholder="Nome completo do paciente"
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 uppercase"
                    autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">CPF</label>
                  <input type="text" value={novoPaciente.cpf}
                    onChange={e => setNovoPaciente(p => ({ ...p, cpf: maskCPF(e.target.value) }))}
                    placeholder="000.000.000-00" maxLength={14}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Cartao SUS (CNS)</label>
                  <input type="text" value={novoPaciente.cns}
                    onChange={e => setNovoPaciente(p => ({ ...p, cns: e.target.value }))}
                    placeholder="Numero do Cartao SUS" maxLength={15}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Data de Nascimento *</label>
                  <input type="date" value={novoPaciente.data_nascimento}
                    onChange={e => setNovoPaciente(p => ({ ...p, data_nascimento: e.target.value }))}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Sexo *</label>
                  <select value={novoPaciente.sexo}
                    onChange={e => setNovoPaciente(p => ({ ...p, sexo: e.target.value as 'F' | 'M' }))}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white">
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Telefone</label>
                  <input type="text" value={novoPaciente.telefone}
                    onChange={e => setNovoPaciente(p => ({ ...p, telefone: maskPhone(e.target.value) }))}
                    placeholder="(00) 00000-0000" maxLength={15}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">CEP</label>
                  <input type="text" value={novoPaciente.cep}
                    onChange={e => setNovoPaciente(p => ({ ...p, cep: e.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9) }))}
                    placeholder="00000-000" maxLength={9}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-surface-600 mb-1">Logradouro</label>
                  <input type="text" value={novoPaciente.logradouro}
                    onChange={e => setNovoPaciente(p => ({ ...p, logradouro: e.target.value }))}
                    placeholder="Rua, Avenida, Travessa..."
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Numero</label>
                  <input type="text" value={novoPaciente.numero}
                    onChange={e => setNovoPaciente(p => ({ ...p, numero: e.target.value }))}
                    placeholder="Nº"
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Complemento</label>
                  <input type="text" value={novoPaciente.complemento}
                    onChange={e => setNovoPaciente(p => ({ ...p, complemento: e.target.value }))}
                    placeholder="Apto, Bloco..."
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Bairro</label>
                  <input type="text" value={novoPaciente.bairro}
                    onChange={e => setNovoPaciente(p => ({ ...p, bairro: e.target.value }))}
                    placeholder="Bairro"
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-600 mb-1">Cidade</label>
                  <input type="text" value={novoPaciente.cidade}
                    onChange={e => setNovoPaciente(p => ({ ...p, cidade: e.target.value }))}
                    placeholder="Ex: Santo Estevao"
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" />
                </div>
              </div>

              {/* Sessões Anteriores Section */}
              <div className="border-t border-surface-200 pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-surface-700">Sessões Anteriores</h3>
                  <button
                    type="button"
                    onClick={() => setSessoesAnteriores([...sessoesAnteriores, { data: '', medico_nome: '' }])}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                  >
                    + Adicionar Sessão
                  </button>
                </div>

                {sessoesAnteriores.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {sessoesAnteriores.map((sessao, idx) => {
                      const doctorsList = [
                        { name: 'LUCAS PORTELA TAVARES', crm: '033657' },
                        { name: 'VITORIA CASTRO MARCOS', crm: '028890' },
                        { name: 'LAIS CARVALHO MUHANA ALVES', crm: '034812' },
                        { name: 'ALINE FERNANDES MANGABEIRA', crm: '033167' },
                        { name: 'MARIANA SANTOS PIRES', crm: '029434' },
                        { name: 'VICTOR PORTO SALES', crm: '029742' },
                        { name: 'GUSTAVO SILVA DOS SANTOS', crm: '026902' },
                        { name: 'BRENDA DE LIMA LEITE', crm: '030028' },
                      ];

                      // Check if medico_nome is not in the doctors list (means "Outro")
                      const isOutroMedico = !doctorsList.find(d => d.name === sessao.medico_nome);

                      return (
                        <div key={idx} className="flex items-end gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                          <div className="w-12">
                            <label className="block text-xs font-medium text-surface-600 mb-1">Sessão</label>
                            <div className="px-3 py-2 bg-white rounded-lg text-sm font-medium text-surface-700 border border-emerald-200">
                              {idx + 1}
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-surface-600 mb-1">Data</label>
                            <input
                              type="date"
                              value={sessao.data}
                              onChange={e => {
                                const newSessoes = [...sessoesAnteriores];
                                newSessoes[idx].data = e.target.value;
                                setSessoesAnteriores(newSessoes);
                              }}
                              className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-surface-600 mb-1">Médico</label>
                            {isOutroMedico ? (
                              <input
                                type="text"
                                value={sessao.medico_nome}
                                onChange={e => {
                                  const newSessoes = [...sessoesAnteriores];
                                  newSessoes[idx].medico_nome = e.target.value;
                                  setSessoesAnteriores(newSessoes);
                                }}
                                placeholder="Nome do médico"
                                className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white"
                              />
                            ) : (
                              <select
                                value={sessao.medico_nome}
                                onChange={e => {
                                  const newSessoes = [...sessoesAnteriores];
                                  newSessoes[idx].medico_nome = e.target.value;
                                  setSessoesAnteriores(newSessoes);
                                }}
                                className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white"
                              >
                                <option value="">Selecione o médico...</option>
                                {doctorsList.map(doc => (
                                  <option key={doc.crm} value={doc.name}>
                                    {doc.name}
                                  </option>
                                ))}
                                <option value="OUTRO">Outro (digitar)</option>
                              </select>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newSessoes = sessoesAnteriores.filter((_, i) => i !== idx);
                              setSessoesAnteriores(newSessoes);
                            }}
                            className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                          >
                            X
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Data da Próxima Sessão */}
                <div className="mt-4">
                  <label className="block text-xs font-medium text-surface-600 mb-1">Data da Próxima Sessão (Opcional)</label>
                  <input
                    type="date"
                    value={cadastroProximaSessao}
                    onChange={e => setCadastroProximaSessao(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button onClick={handleCriarPaciente} disabled={salvandoPaciente}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {salvandoPaciente ? 'Salvando...' : 'Cadastrar e Iniciar Triagem'}
                </button>
                <button onClick={() => { setShowCadastroPaciente(false); setNovoPaciente({ nome_completo: '', cpf: '', cns: '', data_nascimento: '', sexo: 'F', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'BA' }); setSessoesAnteriores([]); setCadastroProximaSessao(''); }}
                  disabled={salvandoPaciente}
                  className="px-4 py-2 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200 disabled:opacity-50 transition-colors">Voltar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRIAGEM AVULSA - Formulário completo quando paciente selecionado */}
      {showNovaTriagem && pacienteAvulso && (
        <div className="bg-white rounded-xl border-2 border-emerald-200 overflow-hidden mb-6">
          {/* Patient Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-white border-b border-surface-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase">Triagem Avulsa</span>
                </div>
                <h2 className="text-lg font-bold text-surface-900 mt-1">{pacienteAvulso.nome_completo}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-surface-500">
                  {pacienteAvulso.data_nascimento && <span>{calcularIdade(pacienteAvulso.data_nascimento)}a • {formatDate(pacienteAvulso.data_nascimento)}</span>}
                  <span>• {pacienteAvulso.sexo === 'F' ? 'Feminino' : 'Masculino'}</span>
                  {pacienteAvulso.cpf && <span>• CPF: {maskCPF(pacienteAvulso.cpf)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {historico.length > 0 && (
                  <button onClick={() => setShowHistorico(!showHistorico)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors font-medium">
                    Historico ({historico.length})
                  </button>
                )}
                <button onClick={() => { setPacienteAvulso(null); setForm(EMPTY_FORM); setHistorico([]); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors">Voltar</button>
              </div>
            </div>
            {(historico.length > 0 || (pacienteAvulso?.sessoes_anteriores?.length || 0) > 0) && !showHistorico && (
              <div className="mt-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                Paciente com {historico.length} triagem(ns) e {(pacienteAvulso?.sessoes_anteriores?.length || 0)} sessao(es) anterior(es). Dados pre-preenchidos. PA, HGT e data sessao em branco.
              </div>
            )}
          </div>

          {/* History */}
          {showHistorico && historico.length > 0 && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 max-h-48 overflow-y-auto">
              <h4 className="text-xs font-semibold text-amber-800 mb-2">Historico de Triagens</h4>
              {historico.map((h) => (
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
              {/* SAME FORM FIELDS as regular triage */}
              <div>
                <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Dados Clinicos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-xs font-medium text-surface-600 mb-1">Alergia</label><input type="text" value={form.alergia} onChange={e => setForm(f => ({ ...f, alergia: e.target.value }))} placeholder="Nenhuma / descrever..." className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-surface-600 mb-1">Pressao Arterial</label><input type="text" value={form.pressao_arterial} onChange={e => setForm(f => ({ ...f, pressao_arterial: e.target.value }))} placeholder="Ex: 120/80" className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-surface-600 mb-1">HGT (mg/dL)</label><input type="text" value={form.hgt} onChange={e => setForm(f => ({ ...f, hgt: e.target.value }))} placeholder="Ex: 95" className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" /></div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"></span>Historico de Doencas</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[{ key: 'diabetes', label: 'Diabetes' },{ key: 'hipertensao', label: 'Hipertensao' },{ key: 'doencas_cardiacas', label: 'Doencas Cardiacas' },{ key: 'doencas_hepaticas', label: 'Doencas Hepaticas' },{ key: 'doencas_renais', label: 'Doencas Renais' }].map(item => (
                    <label key={item.key} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors', (form as any)[item.key] ? 'bg-red-50 border-red-300 text-red-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50')}>
                      <input type="checkbox" checked={(form as any)[item.key]} onChange={e => setForm(f => ({ ...f, [item.key]: e.target.checked }))} className="rounded text-red-600 focus:ring-red-300" />
                      <span className="text-sm">{item.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3"><label className="block text-xs font-medium text-surface-600 mb-1">Outras Doencas</label><input type="text" value={form.outras_doencas} onChange={e => setForm(f => ({ ...f, outras_doencas: e.target.value }))} placeholder="Descrever..." className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400" /></div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span>Historico de Escleroterapia</h3>
                <div className="space-y-3">
                  <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors', form.escleroterapia_anterior ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50')}><input type="checkbox" checked={form.escleroterapia_anterior} onChange={e => setForm(f => ({ ...f, escleroterapia_anterior: e.target.checked }))} className="rounded text-orange-600 focus:ring-orange-300" /><span className="text-sm">Ja foi submetido(a) a escleroterapia antes?</span></label>
                  {form.escleroterapia_anterior && <input type="text" value={form.escleroterapia_quando} onChange={e => setForm(f => ({ ...f, escleroterapia_quando: e.target.value }))} placeholder="Quando?" className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm bg-orange-50" />}
                  <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors', form.trombose_embolia ? 'bg-red-50 border-red-300 text-red-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50')}><input type="checkbox" checked={form.trombose_embolia} onChange={e => setForm(f => ({ ...f, trombose_embolia: e.target.checked }))} className="rounded text-red-600 focus:ring-red-300" /><span className="text-sm">Trombose ou Embolia Pulmonar?</span></label>
                  {form.trombose_embolia && <input type="text" value={form.trombose_embolia_detalhe} onChange={e => setForm(f => ({ ...f, trombose_embolia_detalhe: e.target.value }))} placeholder="Detalhar..." className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-red-50" />}
                  <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors', form.doencas_vasculares ? 'bg-orange-50 border-orange-300 text-orange-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50')}><input type="checkbox" checked={form.doencas_vasculares} onChange={e => setForm(f => ({ ...f, doencas_vasculares: e.target.checked }))} className="rounded text-orange-600 focus:ring-orange-300" /><span className="text-sm">Doencas Vasculares?</span></label>
                  {form.doencas_vasculares && <input type="text" value={form.doencas_vasculares_detalhe} onChange={e => setForm(f => ({ ...f, doencas_vasculares_detalhe: e.target.value }))} placeholder="Detalhar..." className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm bg-orange-50" />}
                  <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors', form.doppler_venoso ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50')}><input type="checkbox" checked={form.doppler_venoso} onChange={e => setForm(f => ({ ...f, doppler_venoso: e.target.checked }))} className="rounded text-blue-600 focus:ring-blue-300" /><span className="text-sm">Doppler Venoso?</span></label>
                  {form.doppler_venoso && <input type="text" value={form.doppler_venoso_detalhe} onChange={e => setForm(f => ({ ...f, doppler_venoso_detalhe: e.target.value }))} placeholder="Resultado..." className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-blue-50" />}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-pink-500"></span>Outras Informacoes</h3>
                {pacienteAvulso?.sexo === 'F' && (
                  <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors mb-3', form.gravidez_amamentacao ? 'bg-pink-50 border-pink-300 text-pink-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50')}><input type="checkbox" checked={form.gravidez_amamentacao} onChange={e => setForm(f => ({ ...f, gravidez_amamentacao: e.target.checked }))} className="rounded text-pink-600 focus:ring-pink-300" /><span className="text-sm">Gravidez ou Amamentacao?</span></label>
                )}
                <div><label className="block text-xs font-medium text-surface-600 mb-1">Observacao</label><textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={3} placeholder="Observacoes..." className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 resize-none" /></div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Agendamento</h3>
                <div><label className="block text-xs font-medium text-surface-600 mb-1">Data da Proxima Sessao</label><input type="date" value={form.data_proxima_sessao} onChange={e => setForm(f => ({ ...f, data_proxima_sessao: e.target.value }))} className="w-full sm:w-64 px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300" /></div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-surface-100">
                <button onClick={handleSalvarTriagemAvulsa} disabled={saving}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Salvando...' : 'Salvar Triagem Avulsa'}
                </button>
                <button onClick={() => { setPacienteAvulso(null); setShowNovaTriagem(false); setForm(EMPTY_FORM); }}
                  disabled={saving} className="px-4 py-2.5 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200 disabled:opacity-50 transition-colors">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

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

                {(historico.length > 0 || (paciente?.sessoes_anteriores?.length || 0) > 0) && !showHistorico && (
                  <div className="mt-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                    Paciente com {historico.length} triagem(ns) e {(paciente?.sessoes_anteriores?.length || 0)} sessao(es) anterior(es). Dados pre-preenchidos. PA, HGT e data sessao em branco.
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
                      <label className="block text-xs font-medium text-surface-600 mb-1">Data da Proxima Sessao</label>
                      <input type="date" value={form.data_proxima_sessao}
                        onChange={e => setForm(f => ({ ...f, data_proxima_sessao: e.target.value }))}
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

      {/* ========== MODAL TCLE ========== */}
      {showTcle && tclePaciente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-blue-800 text-white px-6 py-4 rounded-t-2xl">
              <h2 className="text-lg font-bold">Termo de Consentimento Livre e Esclarecido</h2>
              <p className="text-blue-100 text-xs mt-0.5">Escleroterapia Ecoguiada com Espuma de Polidocanol</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Dados do Paciente */}
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <h3 className="text-xs font-bold text-blue-800 mb-1">PACIENTE</h3>
                <p className="text-sm font-medium text-surface-800">{tclePaciente.nome_completo}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-surface-600 mt-0.5">
                  {tclePaciente.cpf && <span>CPF: {maskCPF(tclePaciente.cpf)}</span>}
                  {tclePaciente.data_nascimento && <span>{calcularIdade(tclePaciente.data_nascimento)} anos</span>}
                  <span>{tclePaciente.sexo === 'F' ? 'Feminino' : 'Masculino'}</span>
                </div>
              </div>

              {/* Médico do Dia */}
              <div className={cn('rounded-lg p-3 border', tcleMedico ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')}>
                <h3 className={cn('text-xs font-bold mb-1', tcleMedico ? 'text-emerald-800' : 'text-amber-800')}>MÉDICO(A) RESPONSÁVEL</h3>
                {tcleMedico ? (
                  <p className="text-sm font-medium text-surface-800">
                    Dr(a). {tcleMedico.nome} {tcleMedico.crm && <span className="text-xs text-surface-500">— CRM/BA {tcleMedico.crm}</span>}
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 italic">Médico não identificado na escala do dia. Campo será preenchido posteriormente.</p>
                )}
              </div>

              {/* Resumo do Termo */}
              <div className="border border-surface-200 rounded-lg p-3 max-h-60 overflow-y-auto bg-surface-50 text-xs text-surface-700 leading-relaxed space-y-2">
                <p className="font-semibold text-surface-800">Eu, {tclePaciente.nome_completo}, declaro que fui informado(a) de forma clara sobre o procedimento de Escleroterapia Ecoguiada com Espuma de Polidocanol:</p>

                <p><strong>I. DO PROCEDIMENTO</strong> — Injeção de Polidocanol em microespuma nas veias acometidas por varizes/insuficiência venosa crônica, guiada por ultrassom vascular (Doppler), em ambiente ambulatorial.</p>

                <p><strong>II. ALTERNATIVAS TERAPÊUTICAS</strong> — Tratamento conservador, cirurgia convencional, ablação térmica por laser ou radiofrequência.</p>

                <p><strong>III. RISCOS E COMPLICAÇÕES</strong> — Incluindo dor local, flebite, hiperpigmentação, matting, equimoses, reação alérgica, necrose cutânea, TVP, embolia pulmonar, distúrbios visuais transitórios, AVC (extremamente raro).</p>

                <p><strong>III-A. ALTERAÇÕES ESTÉTICAS</strong> — Hiperpigmentação (manchas escuras) possível e relativamente frequente, podendo ser permanente em alguns casos.</p>

                <p><strong>IV. INFORMAÇÕES PRESTADAS</strong> — Declaro que prestei informações verdadeiras sobre meu estado de saúde.</p>

                <p><strong>V. COMPROMISSOS PÓS-PROCEDIMENTO</strong> — Uso de meia elástica, deambulação precoce, evitar sol, retorno para acompanhamento.</p>

                <p><strong>VI. INTERCORRÊNCIAS</strong> — Em caso de evento adverso, procurar equipe médica ou urgência imediatamente.</p>

                <p><strong>VII. AUSÊNCIA DE GARANTIA</strong> — Sem garantia de cura completa, novas sessões podem ser necessárias.</p>

                <p><strong>VIII. REGISTRO DE IMAGENS</strong> — Autorizo registro fotográfico/vídeo para documentação clínica exclusivamente.</p>

                <p><strong>IX. REVOGAÇÃO</strong> — Posso revogar este consentimento antes do início do procedimento.</p>

                <p><strong>X. DECLARAÇÃO FINAL</strong> — Li, compreendi e consinto de forma livre, voluntária e esclarecida com a realização do procedimento.</p>

                <p className="text-[10px] text-surface-400 italic mt-2">
                  Fundamentação: Resolução CFM nº 2.232/2019 · CEM Arts. 22, 34, 59 · Lei 8.078/1990 · Lei 8.080/1990 · Lei 13.146/2015
                </p>
              </div>

              {/* Assinatura */}
              <div>
                <h3 className="text-xs font-bold text-surface-700 mb-2">ASSINATURA DO PACIENTE</h3>
                <p className="text-[10px] text-surface-400 mb-1">Desenhe a assinatura no campo abaixo com o dedo ou mouse:</p>
                <div className="border-2 border-dashed border-surface-300 rounded-lg bg-white relative">
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    penColor="#1a1a1a"
                    canvasProps={{
                      className: 'w-full h-32 rounded-lg',
                      style: { width: '100%', height: '128px' },
                    }}
                  />
                  <button
                    onClick={() => sigCanvasRef.current?.clear()}
                    className="absolute top-1 right-1 px-2 py-0.5 text-[10px] bg-surface-100 text-surface-500 rounded hover:bg-surface-200 transition-colors"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              {/* Metadados */}
              <div className="bg-surface-50 rounded-lg p-2 text-[10px] text-surface-400 flex flex-wrap gap-x-4 gap-y-0.5">
                <span>Data/Hora: {new Date().toLocaleString('pt-BR')}</span>
                <span>IP: {tcleIp || 'Capturando...'}</span>
                <span>Unidade: {selectedUnidade?.nome || ''}</span>
              </div>

              {/* Botões */}
              <div className="flex items-center gap-3 pt-2 border-t border-surface-100">
                <button
                  onClick={handleAssinarTcle}
                  disabled={tcleEnviando}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {tcleEnviando ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enviando TCLE...
                    </span>
                  ) : (
                    'Assinar e Enviar TCLE'
                  )}
                </button>
                <button
                  onClick={fecharTcleSemAssinar}
                  disabled={tcleEnviando}
                  className="px-4 py-3 bg-surface-100 text-surface-600 rounded-lg text-sm font-medium hover:bg-surface-200 disabled:opacity-50 transition-colors"
                >
                  Pular
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
