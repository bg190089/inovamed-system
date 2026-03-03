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

const TEMPLATES = [
  'Realizada escleroterapia com glicose hipertonica 75% em veias varicosas reticulares e telangiectasias nos membros inferiores bilateralmente. Aplicacao sem intercorrencias. Curativo compressivo aplicado. Orientacoes pos-procedimento fornecidas.',
  'Escleroterapia com espuma de polidocanol 1% guiada por Doppler em veia safena magna. Procedimento transcorreu sem complicacoes. Bandagem elastica aplicada. Paciente orientado quanto ao uso de meia elastica.',
];

export default function ConsultorioPage() {
  const { user, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const service = useMemo(() => new AtendimentoService(supabase), [supabase]);
  const { state: confirmState, confirm, close: closeConfirm } = useConfirmDialog();

  const [filaDoMedico, setFilaDoMedico] = useState<Atendimento[]>([]);
  const [atendimentoAtual, setAtendimentoAtual] = useState<Atendimento | null>(null);
  const [historico, setHistorico] = useState<Atendimento[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prontuario, setProntuario] = useState({ doppler: '', anamnese: '', descricao_procedimento: '', observacoes: '' });

  const loadFila = useCallback(async () => {
    if (!user || !selectedUnidade) return;
    try {
      const data = await service.getFilaDoDia(selectedUnidade.id, user.id);
      setFilaDoMedico(data);
    } catch (err) { console.error(err); }
  }, [user, selectedUnidade, service]);

  useEffect(() => {
    if (user && selectedUnidade) {
      loadFila();
      const channel = supabase
        .channel('consultorio-rt')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'atendimentos',
          filter: `unidade_id=eq.${selectedUnidade.id}`,
        }, () => loadFila())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user, selectedUnidade, loadFila, supabase]);

  async function iniciarAtendimento(atend: Atendimento) {
    await service.atualizarStatus(atend.id, 'em_atendimento', { hora_inicio_atendimento: new Date().toISOString() });
    setAtendimentoAtual({ ...atend, status: 'em_atendimento' as any });
    setProntuario({
      doppler: atend.doppler || '', anamnese: atend.anamnese || '',
      descricao_procedimento: atend.descricao_procedimento || '', observacoes: atend.observacoes || '',
    });
    const hist = await service.getHistoricoPaciente(atend.paciente_id);
    setHistorico(hist);
    loadFila();
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
      } else {
        toast.success('Prontuario salvo');
      }
      loadFila();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Consultorio"
        subtitle={`Dr(a). ${user?.nome_completo?.split(' ')[0]} • ${(selectedUnidade as any)?.municipio?.nome || '—'} • ${formatDate(new Date(), 'dd/MM/yyyy')}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Queue */}
        <div className="lg:col-span-1">
          <div className="card sticky top-6">
            <div className="px-4 py-3 border-b border-surface-100">
              <h2 className="font-display font-semibold text-surface-800 text-sm">Minha Fila ({filaDoMedico.length})</h2>
            </div>
            {filaDoMedico.length === 0 ? (
              <div className="p-8 text-center"><p className="text-surface-400 text-sm">Nenhum paciente aguardando</p></div>
            ) : (
              <div className="divide-y divide-surface-50">
                {filaDoMedico.map((atend) => (
                  <button key={atend.id} onClick={() => iniciarAtendimento(atend)}
                    className={cn('w-full text-left px-4 py-3 hover:bg-surface-50 transition-colors', atendimentoAtual?.id === atend.id && 'bg-brand-50 border-l-4 border-brand-500')}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-surface-800 truncate">{atend.paciente?.nome_completo}</p>
                      <span className={`badge text-[10px] ${getStatusColor(atend.status)}`}>{getStatusLabel(atend.status)}</span>
                    </div>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {atend.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'} • {calcularIdade(atend.paciente?.data_nascimento || '')}a • {atend.paciente?.sexo === 'F' ? 'Fem' : 'Masc'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Prontuario */}
        <div className="lg:col-span-2">
          {!atendimentoAtual ? (
            <div className="card"><EmptyState icon="📋" title="Selecione um paciente da fila" description="Clique em um paciente para iniciar o atendimento" /></div>
          ) : (
            <div className="space-y-4">
              {/* Patient Header */}
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-surface-900 text-lg">{atendimentoAtual.paciente?.nome_completo}</h3>
                    <p className="text-sm text-surface-500 mt-0.5">
                      {calcularIdade(atendimentoAtual.paciente?.data_nascimento || '')} anos • {atendimentoAtual.paciente?.sexo === 'F' ? 'Feminino' : 'Masculino'} • CPF: {maskCPF(atendimentoAtual.paciente?.cpf || '')} • Nasc: {formatDate(atendimentoAtual.paciente?.data_nascimento || '', 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <button onClick={() => setShowHistorico(!showHistorico)} className={cn('btn-secondary text-xs', showHistorico && 'bg-brand-50 border-brand-300')}>
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
                          <span className="text-xs font-semibold text-surface-600">{formatDate(h.data_atendimento, 'dd/MM/yyyy')} • {(h.unidade as any)?.municipio?.nome}</span>
                          <span className="badge bg-surface-200 text-surface-600 text-[10px]">{h.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'}</span>
                        </div>
                        {h.doppler && <p className="text-xs text-surface-600"><strong>Doppler:</strong> {h.doppler}</p>}
                        {h.anamnese && <p className="text-xs text-surface-600 mt-1"><strong>Anamnese:</strong> {h.anamnese}</p>}
                        {h.descricao_procedimento && <p className="text-xs text-surface-600 mt-1"><strong>Procedimento:</strong> {h.descricao_procedimento}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form */}
              <div className="card">
                <div className="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
                  <h3 className="font-display font-semibold text-surface-800">Prontuario</h3>
                </div>
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
                        className="input-field resize-y" style={{ minHeight: `${field.rows * 28}px` }}
                        placeholder={field.placeholder}
                      />
                      {field.templates && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          {TEMPLATES.map((t, i) => (
                            <button key={i} onClick={() => setProntuario({ ...prontuario, descricao_procedimento: t })}
                              className="text-[10px] text-brand-600 bg-brand-50 px-2 py-1 rounded-md hover:bg-brand-100 transition-colors">
                              Template {i + 1}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 border-t border-surface-100 flex justify-between">
                  <button onClick={() => salvarProntuario(false)} disabled={saving} className="btn-secondary text-sm">Salvar Rascunho</button>
                  <button onClick={() => salvarProntuario(true)} disabled={saving} className="btn-success text-sm">
                    {saving ? 'Salvando...' : 'Finalizar Atendimento'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={confirmState.open} title={confirmState.title} description={confirmState.description}
        variant={confirmState.variant} confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />
    </div>
  );
}
