'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { AtendimentoService, TriagemService } from '@/lib/services';
import type { Triagem } from '@/lib/services/triagemService';
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

const DEFAULT_DOPPLER_TEMPLATES = [
  'Doppler venoso de membros inferiores sem sinais de trombose venosa profunda. Veias profundas pervias com fluxo fasico e compressiveis. Sem refluxo em veias safenas.',
  'Insuficiencia segmentar em veia safena magna bilateralmente, com refluxo identificado ao Doppler. Veias profundas pervias, sem sinais de TVP. Presenca de veias varicosas tributarias em ambos os membros inferiores.',
];


export default function ConsultorioPage() {
  const { user, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const service = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const triagemService = useMemo(() => new TriagemService(supabase), [supabase]);
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
  const [prontuario, setProntuario] = useState({ doppler: '', anamnese: '', descricao_procedimento: '', observacoes: '', receita: '' });
  const [triagemData, setTriagemData] = useState<Triagem | null>(null);
  const [showTriagem, setShowTriagem] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<string[]>(DEFAULT_TEMPLATES);
  const [dopplerTemplates, setDopplerTemplates] = useState<string[]>(DEFAULT_DOPPLER_TEMPLATES)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
    const [activeTab, setActiveTab] = useState<'procedimento' | 'observacao' | 'receita'>('procedimento')
  const [editingTemplate, setEditingTemplate] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newTemplate, setNewTemplate] = useState('');
  const [editingDopplerTemplate, setEditingDopplerTemplate] = useState('')
  const [editingDopplerIndex, setEditingDopplerIndex] = useState(-1)
  const [newDopplerTemplate, setNewDopplerTemplate] = useState('')

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
      receita: atend.receita || '',
    });
    const hist = await service.getHistoricoPaciente(atend.paciente_id);
    setHistorico(hist);
    // Load session count (including sessoes_anteriores from pacientes table)
    const sessoes = await service.contarSessoes12Meses(atend.paciente_id);
    let totalSessoes = sessoes;
    // Add sessoes_anteriores count if available
    if (atend.paciente?.sessoes_anteriores && Array.isArray(atend.paciente.sessoes_anteriores)) {
      totalSessoes += atend.paciente.sessoes_anteriores.length;
    }
    setSessoesPaciente(totalSessoes);
    // Load triagem data
    try {
      const triagem = await triagemService.getUltimaTriagem(atend.paciente_id);
      setTriagemData(triagem);
      setShowTriagem(!!triagem);
    } catch { setTriagemData(null); }
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
            receita: atend.receita || '',
          });
          const hist = await service.getHistoricoPaciente(atend.paciente_id);
          setHistorico(hist);
          const sessoes = await service.contarSessoes12Meses(atend.paciente_id);
          let totalSessoes = sessoes;
          // Add sessoes_anteriores count if available
          if (atend.paciente?.sessoes_anteriores && Array.isArray(atend.paciente.sessoes_anteriores)) {
            totalSessoes += atend.paciente.sessoes_anteriores.length;
          }
          setSessoesPaciente(totalSessoes);
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
      // If finalizing, include doctor signature
      let prontuarioData: Record<string, any> = { ...prontuario };
      if (finalizar && user) {
        const { data: profData } = await supabase
          .from('profissionais')
          .select('assinatura_digital')
          .eq('id', user.id)
          .single();
        if (profData?.assinatura_digital) {
          prontuarioData.assinatura_medico = profData.assinatura_digital;
        }
      }
      await service.salvarProntuario(atendimentoAtual.id, prontuarioData, finalizar);
      if (finalizar) {
        // Backup assíncrono no Google Drive (fire-and-forget)
        fetch('/api/drive/backup-prontuario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ atendimentoId: atendimentoAtual.id }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) {
              toast.success('Backup do prontuário salvo no Google Drive');
            }
          })
          .catch(() => {});
        toast.success('Atendimento finalizado com sucesso');
        setAtendimentoAtual(null);
        setProntuario({ doppler: '', anamnese: '', descricao_procedimento: '', observacoes: '', receita: '' });
        setHistorico([]);
        setShowHistorico(false);
        setTriagemData(null);
        setShowTriagem(false);
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
function addDopplerTemplate() {
    if (!newDopplerTemplate.trim()) {
      toast.error('Template nao pode estar vazio');
      return;
    }
    setDopplerTemplates([...dopplerTemplates, newDopplerTemplate]);
    setNewDopplerTemplate('');
    toast.success('Template adicionado');
  }

  function updateDopplerTemplate() {
    if (editingIndex === null) return;
    if (!editingDopplerTemplate.trim()) {
      toast.error('Template nao pode estar vazio');
      return;
    }
    const updated = [...dopplerTemplates];
    updated[editingIndex] = editingDopplerTemplate;
    setDopplerTemplates(updated);
    setEditingDopplerIndex(-1);
    setEditingDopplerTemplate('');
    toast.success('Template atualizado');
  }

  function deleteDopplerTemplate(index: number) {
    setDopplerTemplates(dopplerTemplates.filter((_, i) => i !== index));
    toast.success('Template removido');
  }

  // Helper: get doctor signature + info from multiple sources
  function getDoctorInfo(atend: Atendimento) {
    // 1) Try profissional relation (already loaded via FULL_SELECT)
    const prof = atend.profissional as any;
    const assinatura = atend.assinatura_medico || prof?.assinatura_digital || '';
    const rawNome = prof?.nome_completo || user?.nome_completo || 'Medico';
    // Strip DR./DRA. prefix since we add "Dr(a)." in the templates
    const nome = rawNome.replace(/^(DR\.?|DRA\.?)\s*/i, '').trim() || rawNome;
    const cbo = prof?.cbo || atend.cbo_profissional || '';
    const cns = prof?.cns || atend.cns_profissional || '';
    return { assinatura, nome, cbo, cns };
  }

  // Common print styles
  const printStyles = `
    @page { size: A4; margin: 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
    body { padding: 0; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
    .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 16pt; color: #1e40af; margin-bottom: 2px; }
    .header p { font-size: 9pt; color: #555; }
    .section { margin-bottom: 14px; }
    .section-title { font-size: 10pt; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 6px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .field { font-size: 10pt; }
    .field b { color: #333; }
    .content { font-size: 10.5pt; white-space: pre-wrap; background: #f8f9fa; padding: 8px 10px; border-radius: 4px; border: 1px solid #e5e7eb; min-height: 30px; }
    .signature-area { margin-top: 30px; text-align: center; border-top: 1px solid #ddd; padding-top: 16px; }
    .signature-area img { max-height: 70px; margin-bottom: 4px; }
    .signature-area .name { font-size: 11pt; font-weight: 700; }
    .signature-area .info { font-size: 9pt; color: #555; }
    .footer { margin-top: 20px; text-align: center; font-size: 8pt; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;

  function signatureHTML(doc: { assinatura: string; nome: string; cbo: string; cns: string; dataAtend: string; horaFim: string }) {
    return `<div class="signature-area">
      ${doc.assinatura ? `<img src="${doc.assinatura}" alt="Assinatura do Profissional">` : '<div style="height:50px;border-bottom:1px solid #333;width:250px;margin:0 auto;"></div>'}
      <div class="name">Dr(a). ${doc.nome}</div>
      <div class="info">${doc.cbo ? 'CBO: ' + doc.cbo : ''}${doc.cns ? ' | CNS: ' + doc.cns : ''}</div>
      <div class="info">Data: ${doc.dataAtend} ${doc.horaFim ? '| ' + doc.horaFim : ''}</div>
    </div>`;
  }

  // Generate PDF of the prontuario
  async function gerarPDFProntuario(atend: Atendimento) {
    const doc = getDoctorInfo(atend);
    // If profissional relation didn't have assinatura, try RPC as fallback
    if (!doc.assinatura) {
      try {
        const { data: rpcData } = await supabase.rpc('get_assinatura_profissional', {
          p_profissional_id: atend.profissional_id || user?.id,
        });
        if (rpcData?.[0]?.assinatura_digital) doc.assinatura = rpcData[0].assinatura_digital;
        if (rpcData?.[0]?.nome_completo) doc.nome = rpcData[0].nome_completo.replace(/^(DR\.?|DRA\.?)\s*/i, '').trim();
        if (rpcData?.[0]?.cbo) doc.cbo = rpcData[0].cbo;
        if (rpcData?.[0]?.cns) doc.cns = rpcData[0].cns;
      } catch { /* ignore */ }
    }

    const unidadeNome = (selectedUnidade as any)?.municipio?.nome || '';
    const cnesUnidade = (selectedUnidade as any)?.cnes || '';
    const pacNome = atend.paciente?.nome_completo || '';
    const pacCPF = maskCPF(atend.paciente?.cpf || '');
    const pacNasc = formatDate(atend.paciente?.data_nascimento || '', 'dd/MM/yyyy');
    const pacIdade = calcularIdade(atend.paciente?.data_nascimento || '');
    const pacSexo = atend.paciente?.sexo === 'F' ? 'Feminino' : 'Masculino';
    const dataAtend = formatDate(atend.data_atendimento, 'dd/MM/yyyy');
    const horaInicio = atend.hora_inicio_atendimento ? new Date(atend.hora_inicio_atendimento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const horaFim = atend.hora_fim_atendimento ? new Date(atend.hora_fim_atendimento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Bloqueio de popup. Habilite popups para gerar PDF.'); return; }

    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Prontuario - ${pacNome}</title>
    <style>${printStyles}</style></head><body>
    <div class="header">
      <h1>Inovamed - Sistema de Escleroterapia</h1>
      <p>${unidadeNome}${cnesUnidade ? ' | CNES: ' + cnesUnidade : ''}</p>
      <p>Prontuario de Atendimento</p>
    </div>

    <div class="section">
      <div class="section-title">Dados do Paciente</div>
      <div class="grid2">
        <div class="field"><b>Nome:</b> ${pacNome}</div>
        <div class="field"><b>CPF:</b> ${pacCPF}</div>
        <div class="field"><b>Nascimento:</b> ${pacNasc} (${pacIdade} anos)</div>
        <div class="field"><b>Sexo:</b> ${pacSexo}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Dados do Atendimento</div>
      <div class="grid2">
        <div class="field"><b>Data:</b> ${dataAtend}</div>
        <div class="field"><b>Horario:</b> ${horaInicio}${horaFim ? ' - ' + horaFim : ''}</div>
        <div class="field"><b>Procedimento:</b> ${atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}</div>
        <div class="field"><b>Profissional:</b> Dr(a). ${doc.nome}</div>
      </div>
    </div>

    ${(atend.doppler || prontuario.doppler) ? `<div class="section"><div class="section-title">Doppler Vascular</div><div class="content">${atend.doppler || prontuario.doppler}</div></div>` : ''}
    ${(atend.anamnese || prontuario.anamnese) ? `<div class="section"><div class="section-title">Anamnese</div><div class="content">${atend.anamnese || prontuario.anamnese}</div></div>` : ''}
    ${(atend.descricao_procedimento || prontuario.descricao_procedimento) ? `<div class="section"><div class="section-title">Descricao do Procedimento</div><div class="content">${atend.descricao_procedimento || prontuario.descricao_procedimento}</div></div>` : ''}
    ${(atend.observacoes || prontuario.observacoes) ? `<div class="section"><div class="section-title">Observacoes</div><div class="content">${atend.observacoes || prontuario.observacoes}</div></div>` : ''}

    ${signatureHTML({ ...doc, dataAtend, horaFim })}

    <div class="footer">
      Documento gerado pelo sistema Inovamed em ${new Date().toLocaleString('pt-BR')} | Este documento e parte do prontuario eletronico do paciente.
    </div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  // Generate Receita (Prescription) PDF
  function gerarReceitaPDF(atend: Atendimento, receitaTexto?: string) {
    const doc = getDoctorInfo(atend);
    const unidadeNome = (selectedUnidade as any)?.municipio?.nome || '';
    const cnesUnidade = (selectedUnidade as any)?.cnes || '';
    const pacNome = atend.paciente?.nome_completo || '';
    const dataAtend = formatDate(atend.data_atendimento, 'dd/MM/yyyy');
    const texto = receitaTexto || atend.receita || prontuario.receita || '';

    if (!texto.trim()) {
      toast.error('Preencha o campo Receita antes de gerar.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Bloqueio de popup. Habilite popups para gerar receita.'); return; }

    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receita - ${pacNome}</title>
    <style>${printStyles}
      .receita-body { min-height: 400px; font-size: 12pt; line-height: 1.8; white-space: pre-wrap; padding: 16px 0; }
    </style></head><body>
    <div class="header">
      <h1>Inovamed - Sistema de Escleroterapia</h1>
      <p>${unidadeNome}${cnesUnidade ? ' | CNES: ' + cnesUnidade : ''}</p>
      <p style="font-size:12pt;font-weight:700;margin-top:8px;color:#1e40af;">RECEITUARIO</p>
    </div>

    <div class="section">
      <div class="grid2">
        <div class="field"><b>Paciente:</b> ${pacNome}</div>
        <div class="field"><b>Data:</b> ${dataAtend}</div>
      </div>
    </div>

    <div class="receita-body">${texto}</div>

    ${signatureHTML({ ...doc, dataAtend, horaFim: '' })}

    <div class="footer">
      Documento gerado pelo sistema Inovamed em ${new Date().toLocaleString('pt-BR')}
    </div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto pt-16 lg:pt-0">
      <PageHeader
        title="Consultorio"
        subtitle={`Dr(a). ${(user?.nome_completo || '').replace(/^(DR\.?|DRA\.?)\s*/i, '').split(' ').filter(Boolean).slice(0, 2).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')} • ${(selectedUnidade as any)?.municipio?.nome || '—'} • ${formatDate(new Date(), 'dd/MM/yyyy')}`}
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
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => gerarPDFProntuario(atend)}
                                className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2.5 py-1.5 rounded-md hover:bg-purple-100 transition-colors"
                              >
                                PDF
                              </button>
                              {atend.receita && (
                                <button
                                  onClick={() => gerarReceitaPDF(atend)}
                                  className="text-[11px] font-semibold text-pink-700 bg-pink-50 px-2.5 py-1.5 rounded-md hover:bg-pink-100 transition-colors"
                                >
                                  Receita
                                </button>
                              )}
                              <button
                                onClick={() => reabrirAtendimento(atend)}
                                className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-md hover:bg-amber-100 transition-colors"
                              >
                                Reabrir
                              </button>
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

              {/* Triagem Resumo Compacto */}
                {triagemData && (
                  <div className="card mb-4">
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-surface-700">Triagem</h4>
                        <button
                          onClick={() => setShowTriagem(!showTriagem)}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          {showTriagem ? 'Ocultar detalhes' : 'Ver triagem completa'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        {triagemData.pressao_arterial && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                            PA: {triagemData.pressao_arterial}
                          </span>
                        )}
                        {triagemData.hgt && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                            HGT: {triagemData.hgt} mg/dL
                          </span>
                        )}
                        {triagemData.alergia && triagemData.alergia.trim() !== '' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            Alergia: {triagemData.alergia}
                          </span>
                        )}
                        {triagemData.diabetes && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Diabetes</span>}
                        {triagemData.hipertensao && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">Hipertensao</span>}
                        {triagemData.tabagista && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Tabagista</span>}
                        {triagemData.trombose_embolia && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">TVP/Embolia</span>}
                        {triagemData.doencas_vasculares && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-pink-100 text-pink-700">D. Vasculares</span>}
                        {triagemData.doencas_cardiacas && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">D. Cardiacas</span>}
                        {triagemData.gravidez_amamentacao && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-pink-100 text-pink-600">Gravidez/Amamentacao</span>}
                        {triagemData.escleroterapia_anterior && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">Esclerot. Anterior</span>}
                        {triagemData.doppler_venoso && <span className="px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Doppler Venoso</span>}
                      </div>
                      {showTriagem && (
                        <div className="mt-3 pt-3 border-t border-surface-100 space-y-2 text-sm text-surface-600">
                          {triagemData.outras_doencas && <p><span className="font-medium text-surface-700">Outras doencas:</span> {triagemData.outras_doencas}</p>}
                          {triagemData.doencas_hepaticas && <p><span className="font-medium text-surface-700">D. Hepaticas:</span> Sim</p>}
                          {triagemData.doencas_renais && <p><span className="font-medium text-surface-700">D. Renais:</span> Sim</p>}
                          {triagemData.trombose_embolia_detalhe && <p><span className="font-medium text-surface-700">TVP/Embolia detalhe:</span> {triagemData.trombose_embolia_detalhe}</p>}
                          {triagemData.doencas_vasculares_detalhe && <p><span className="font-medium text-surface-700">D. Vasculares detalhe:</span> {triagemData.doencas_vasculares_detalhe}</p>}
                          {triagemData.doppler_venoso_detalhe && <p><span className="font-medium text-surface-700">Doppler venoso detalhe:</span> {triagemData.doppler_venoso_detalhe}</p>}
                          {triagemData.escleroterapia_quando && <p><span className="font-medium text-surface-700">Escleroterapia quando:</span> {triagemData.escleroterapia_quando}</p>}
                          {triagemData.observacao && <p><span className="font-medium text-surface-700">Obs triagem:</span> {triagemData.observacao}</p>}
                        </div>
                      )}
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
                  <div className="px-5 py-4 border-b border-surface-100 bg-blue-50/50">
                    <h4 className="font-semibold text-surface-800 mb-4">Gerenciar Templates</h4>
                    
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Templates Doppler</p>
                    <div className="space-y-2 mb-3">
                      {dopplerTemplates.map((t, i) => (
                        <div key={'d'+i} className="bg-white rounded-lg border border-surface-200 p-3">
                          {editingDopplerIndex === i ? (
                            <div className="space-y-2">
                              <textarea value={editingDopplerTemplate} onChange={e => setEditingDopplerTemplate(e.target.value)} rows={2} className="w-full px-2 py-1.5 border rounded text-sm" />
                              <div className="flex gap-2">
                                <button onClick={() => updateDopplerTemplate(i)} className="text-xs px-2 py-1 bg-brand-600 text-white rounded">Salvar</button>
                                <button onClick={() => setEditingDopplerIndex(-1)} className="text-xs px-2 py-1 bg-surface-200 rounded">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-surface-600 flex-1 line-clamp-2">{t}</p>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => { setEditingDopplerIndex(i); setEditingDopplerTemplate(t); }} className="text-xs text-brand-600 hover:underline">Editar</button>
                                <button onClick={() => deleteDopplerTemplate(i)} className="text-xs text-red-500 hover:underline">Excluir</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mb-5">
                      <textarea value={newDopplerTemplate} onChange={e => setNewDopplerTemplate(e.target.value)} placeholder="Novo template de doppler..." rows={2} className="w-full px-2 py-1.5 border rounded text-sm mb-1" />
                      <button onClick={() => addDopplerTemplate()} className="w-full py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Adicionar Template Doppler</button>
                    </div>

                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Templates Procedimento</p>
                    <div className="space-y-2 mb-3">
                      {templates.map((t, i) => (
                        <div key={'p'+i} className="bg-white rounded-lg border border-surface-200 p-3">
                          {editingIndex === i ? (
                            <div className="space-y-2">
                              <textarea value={editingTemplate} onChange={e => setEditingTemplate(e.target.value)} rows={2} className="w-full px-2 py-1.5 border rounded text-sm" />
                              <div className="flex gap-2">
                                <button onClick={() => updateTemplate(i)} className="text-xs px-2 py-1 bg-brand-600 text-white rounded">Salvar</button>
                                <button onClick={() => setEditingIndex(-1)} className="text-xs px-2 py-1 bg-surface-200 rounded">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-surface-600 flex-1 line-clamp-2">{t}</p>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => { setEditingIndex(i); setEditingTemplate(t); }} className="text-xs text-brand-600 hover:underline">Editar</button>
                                <button onClick={() => deleteTemplate(i)} className="text-xs text-red-500 hover:underline">Excluir</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <textarea value={newTemplate} onChange={e => setNewTemplate(e.target.value)} placeholder="Novo template de procedimento..." rows={2} className="w-full px-2 py-1.5 border rounded text-sm mb-1" />
                      <button onClick={() => addTemplate()} className="w-full py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Adicionar Template Procedimento</button>
                    </div>
                  </div>
                )}

                <div className="px-5 pt-3 pb-0">
                  <div className="flex gap-1 border-b border-surface-200">
                    {[
                      { key: 'procedimento', label: 'Procedimento' },
                      { key: 'observacao', label: 'Observacao' },
                      { key: 'receita', label: 'Receita' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                          activeTab === tab.key
                            ? 'text-brand-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-600'
                            : 'text-surface-500 hover:text-surface-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-5">
                  {activeTab === 'procedimento' && (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-surface-700 mb-1.5">Doppler Vascular</label>
                        <textarea
                          value={(prontuario as any).doppler}
                          onChange={e => setProntuario(p => ({ ...p, doppler: e.target.value }))}
                          placeholder="Achados do Doppler vascular..."
                          rows={4}
                          className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-y"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {dopplerTemplates.map((t, i) => (
                            <button
                              key={i}
                              onClick={() => setProntuario(p => ({ ...p, doppler: t }))}
                              className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                            >
                              Doppler {i + 1}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-surface-700 mb-1.5">Descricao do Procedimento</label>
                        <textarea
                          value={(prontuario as any).descricao_procedimento}
                          onChange={e => setProntuario(p => ({ ...p, descricao_procedimento: e.target.value }))}
                          placeholder="Descreva o procedimento realizado..."
                          rows={4}
                          className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-y"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {templates.map((t, i) => (
                            <button
                              key={i}
                              onClick={() => setProntuario(p => ({ ...p, descricao_procedimento: t }))}
                              className="text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                            >
                              Procedimento {i + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'observacao' && (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1.5">Observacoes</label>
                      <textarea
                        value={(prontuario as any).observacoes}
                        onChange={e => setProntuario(p => ({ ...p, observacoes: e.target.value }))}
                        placeholder="Observacoes adicionais..."
                        rows={6}
                        className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-y"
                      />
                    </div>
                  )}

                  {activeTab === 'receita' && (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1.5">Receita</label>
                      <textarea
                        value={(prontuario as any).receita}
                        onChange={e => setProntuario(p => ({ ...p, receita: e.target.value }))}
                        placeholder="Prescricao medica..."
                        rows={6}
                        className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-y"
                      />
                    </div>
                  )}
                </div>
                <div className="px-5 py-4 border-t border-surface-100 flex justify-between gap-2">
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => salvarProntuario(false)} disabled={saving} className="btn-secondary text-sm">
                      Salvar Rascunho
                    </button>
                    <button
                      onClick={() => gerarPDFProntuario(atendimentoAtual)}
                      className="text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg hover:bg-purple-100 transition-colors"
                    >
                      Gerar PDF
                    </button>
                    <button
                      onClick={() => gerarReceitaPDF(atendimentoAtual)}
                      className="text-sm font-medium text-pink-700 bg-pink-50 border border-pink-200 px-3 py-2 rounded-lg hover:bg-pink-100 transition-colors"
                    >
                      Gerar Receita
                    </button>
                  </div>
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
