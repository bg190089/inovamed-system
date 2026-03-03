'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { toast } from 'sonner';
import { formatCompetencia, getCompetenciaAtual, cn } from '@/lib/utils';
import { PageHeader, EmptyState } from '@/components/ui';
import type { ProdutividadeMedico, ProdutividadeMunicipio, BPARecord } from '@/types';

type TabType = 'bpa' | 'produtividade_medico' | 'produtividade_municipio';

export default function RelatoriosPage() {
  const { unidades } = useAuth();
  const supabase = useSupabase();

  const [tab, setTab] = useState<TabType>('bpa');
  const [competencia, setCompetencia] = useState(getCompetenciaAtual());
  const [bpaData, setBpaData] = useState<BPARecord[]>([]);
  const [prodMedico, setProdMedico] = useState<ProdutividadeMedico[]>([]);
  const [prodMunicipio, setProdMunicipio] = useState<ProdutividadeMunicipio[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUnidadeReport, setSelectedUnidadeReport] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setDateRange({ start, end });
  }, []);

  async function loadBPA() {
    if (!selectedUnidadeReport) { toast.error('Selecione a unidade'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('gerar_bpa_individual', { p_competencia: competencia, p_unidade_id: selectedUnidadeReport });
      if (error) throw error;
      setBpaData(data || []);
      if (data?.length === 0) toast.info('Nenhum registro encontrado para esta competencia');
    } catch (err: any) { toast.error(err.message || 'Erro ao gerar BPA'); }
    finally { setLoading(false); }
  }

  async function loadProdMedico() {
    if (!dateRange.start || !dateRange.end) { toast.error('Selecione o periodo'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('relatorio_produtividade_medico', { p_data_inicio: dateRange.start, p_data_fim: dateRange.end });
      if (error) throw error;
      setProdMedico(data || []);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  async function loadProdMunicipio() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('relatorio_produtividade_municipio', { p_competencia: competencia });
      if (error) throw error;
      setProdMunicipio(data || []);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  function exportToCSV(data: any[], filename: string) {
    if (!data.length) { toast.error('Nada para exportar'); return; }
    const headers = Object.keys(data[0]);
    const csv = [headers.join(';'), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success('Arquivo exportado');
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'bpa', label: 'BPA Individualizado' },
    { key: 'produtividade_medico', label: 'Produtividade Medica' },
    { key: 'produtividade_municipio', label: 'Produtividade por Municipio' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Relatorios" subtitle="Producao SUS, BPA-I e produtividade" />

      <div className="flex gap-1 p-1 bg-surface-100 rounded-xl mb-6 max-w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', tab === t.key ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500 hover:text-surface-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bpa' && (
        <div className="card">
          <div className="p-5 border-b border-surface-100">
            <div className="flex flex-wrap gap-3 items-end">
              <div><label className="input-label">Competencia</label><input type="month" value={`${competencia.slice(0,4)}-${competencia.slice(4)}`} onChange={(e) => setCompetencia(e.target.value.replace('-', ''))} className="input-field" /></div>
              <div><label className="input-label">Unidade</label>
                <select value={selectedUnidadeReport} onChange={(e) => setSelectedUnidadeReport(e.target.value)} className="input-field min-w-[200px]">
                  <option value="">Selecione...</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{(u as any).municipio?.nome || u.nome} (CNES: {u.cnes})</option>)}
                </select>
              </div>
              <button onClick={loadBPA} disabled={loading} className="btn-primary text-sm">{loading ? 'Gerando...' : 'Gerar BPA'}</button>
              {bpaData.length > 0 && (
                <button onClick={() => {
                  const uni = unidades.find(u => u.id === selectedUnidadeReport);
                  exportToCSV(bpaData, `BPA_${(uni as any)?.municipio?.nome || 'Municipio'}_${competencia}.csv`);
                }} className="btn-secondary text-sm">Exportar CSV</button>
              )}
            </div>
          </div>
          {bpaData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="table-header">
                  {['CNES','CNS Prof','CBO','Data','Folha','Seq','Procedimento','Paciente','CPF','CNS','Sexo','Nasc','CID','Qtd'].map(h => (
                    <th key={h} className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {bpaData.map((row, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-3 py-2 font-mono">{row.cnes}</td>
                      <td className="px-3 py-2 font-mono">{row.cns_profissional}</td>
                      <td className="px-3 py-2 font-mono">{row.cbo}</td>
                      <td className="px-3 py-2 font-mono">{row.data_atendimento}</td>
                      <td className="px-3 py-2">{row.numero_folha}</td>
                      <td className="px-3 py-2">{row.numero_sequencial}</td>
                      <td className="px-3 py-2 font-mono">{row.procedimento}</td>
                      <td className="px-3 py-2 max-w-[150px] truncate">{row.paciente_nome}</td>
                      <td className="px-3 py-2 font-mono">{row.paciente_cpf}</td>
                      <td className="px-3 py-2 font-mono">{row.paciente_cns}</td>
                      <td className="px-3 py-2">{row.paciente_sexo}</td>
                      <td className="px-3 py-2 font-mono">{row.paciente_nascimento}</td>
                      <td className="px-3 py-2">{row.cid}</td>
                      <td className="px-3 py-2 text-center">{row.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-surface-100 text-sm text-surface-500">
                Total: <strong className="text-surface-800">{bpaData.length}</strong> registros • Competencia: <strong className="text-surface-800">{formatCompetencia(competencia)}</strong>
              </div>
            </div>
          ) : (
            !loading && <EmptyState icon="📄" title="Selecione a competencia e unidade para gerar o BPA-I" />
          )}
        </div>
      )}

      {tab === 'produtividade_medico' && (
        <div className="card">
          <div className="p-5 border-b border-surface-100">
            <div className="flex flex-wrap gap-3 items-end">
              <div><label className="input-label">Data Inicio</label><input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="input-field" /></div>
              <div><label className="input-label">Data Fim</label><input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="input-field" /></div>
              <button onClick={loadProdMedico} disabled={loading} className="btn-primary text-sm">{loading ? 'Carregando...' : 'Gerar Relatorio'}</button>
              {prodMedico.length > 0 && <button onClick={() => exportToCSV(prodMedico, `Produtividade_Medica_${dateRange.start}_${dateRange.end}.csv`)} className="btn-secondary text-sm">Exportar CSV</button>}
            </div>
          </div>
          {prodMedico.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="table-header">
                  <th className="px-5 py-3 text-left">Profissional</th><th className="px-5 py-3 text-left">CRM</th>
                  <th className="px-5 py-3 text-center">Total</th><th className="px-5 py-3 text-center">Unilateral</th>
                  <th className="px-5 py-3 text-center">Bilateral</th><th className="px-5 py-3 text-center">Media/Dia</th>
                </tr></thead>
                <tbody>
                  {prodMedico.map((row, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-5 py-3 font-medium text-surface-800">{row.profissional_nome}</td>
                      <td className="px-5 py-3 text-surface-500">{row.profissional_crm}</td>
                      <td className="px-5 py-3 text-center font-bold text-brand-700">{row.total_atendimentos}</td>
                      <td className="px-5 py-3 text-center">{row.total_unilateral}</td>
                      <td className="px-5 py-3 text-center">{row.total_bilateral}</td>
                      <td className="px-5 py-3 text-center font-semibold">{row.media_diaria}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-50 font-semibold">
                    <td className="px-5 py-3" colSpan={2}>TOTAL</td>
                    <td className="px-5 py-3 text-center">{prodMedico.reduce((s, r) => s + r.total_atendimentos, 0)}</td>
                    <td className="px-5 py-3 text-center">{prodMedico.reduce((s, r) => s + r.total_unilateral, 0)}</td>
                    <td className="px-5 py-3 text-center">{prodMedico.reduce((s, r) => s + r.total_bilateral, 0)}</td>
                    <td className="px-5 py-3 text-center">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'produtividade_municipio' && (
        <div className="card">
          <div className="p-5 border-b border-surface-100">
            <div className="flex gap-3 items-end">
              <div><label className="input-label">Competencia</label><input type="month" value={`${competencia.slice(0,4)}-${competencia.slice(4)}`} onChange={(e) => setCompetencia(e.target.value.replace('-', ''))} className="input-field" /></div>
              <button onClick={loadProdMunicipio} disabled={loading} className="btn-primary text-sm">{loading ? 'Carregando...' : 'Gerar Relatorio'}</button>
              {prodMunicipio.length > 0 && <button onClick={() => exportToCSV(prodMunicipio, `Produtividade_Municipio_${competencia}.csv`)} className="btn-secondary text-sm">Exportar CSV</button>}
            </div>
          </div>
          {prodMunicipio.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="table-header">
                  <th className="px-5 py-3 text-left">Municipio</th><th className="px-5 py-3 text-left">CNES</th>
                  <th className="px-5 py-3 text-center">Total</th><th className="px-5 py-3 text-center">Unilateral</th>
                  <th className="px-5 py-3 text-center">Bilateral</th><th className="px-5 py-3 text-center">Profissionais</th>
                  <th className="px-5 py-3 text-center">Dias</th>
                </tr></thead>
                <tbody>
                  {prodMunicipio.map((row, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-5 py-3 font-medium text-surface-800">{row.municipio_nome}</td>
                      <td className="px-5 py-3 font-mono text-surface-500">{row.cnes}</td>
                      <td className="px-5 py-3 text-center font-bold text-brand-700">{row.total_atendimentos}</td>
                      <td className="px-5 py-3 text-center">{row.total_unilateral}</td>
                      <td className="px-5 py-3 text-center">{row.total_bilateral}</td>
                      <td className="px-5 py-3 text-center">{row.total_profissionais}</td>
                      <td className="px-5 py-3 text-center">{row.dias_atendimento}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-50 font-semibold">
                    <td className="px-5 py-3" colSpan={2}>TOTAL GERAL</td>
                    <td className="px-5 py-3 text-center">{prodMunicipio.reduce((s, r) => s + r.total_atendimentos, 0)}</td>
                    <td className="px-5 py-3 text-center">{prodMunicipio.reduce((s, r) => s + r.total_unilateral, 0)}</td>
                    <td className="px-5 py-3 text-center">{prodMunicipio.reduce((s, r) => s + r.total_bilateral, 0)}</td>
                    <td className="px-5 py-3 text-center">—</td>
                    <td className="px-5 py-3 text-center">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
