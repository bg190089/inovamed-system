'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSupabase } from '@/hooks/useSupabase';
import { DashboardService } from '@/lib/services';
import type { DashboardStats } from '@/lib/services';
import { PageHeader, StatCard } from '@/components/ui';
import { formatDate, getCompetenciaAtual, formatCompetencia } from '@/lib/utils';

export default function DashboardPage() {
  const { user, selectedEmpresa, selectedUnidade } = useAuth();
  const supabase = useSupabase();
  const service = useMemo(() => new DashboardService(supabase), [supabase]);

  const [stats, setStats] = useState<DashboardStats>({
    totalHoje: 0, totalMes: 0, aguardando: 0, finalizados: 0,
    emAtendimento: 0, unilateral: 0, bilateral: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedUnidade) {
      setLoading(true);
      service.getStats(selectedUnidade.id, user?.role === 'medico' ? user.id : undefined).then(setStats).finally(() => setLoading(false));
    }
  }, [selectedUnidade, service]);

  const comp = getCompetenciaAtual();

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle={`Visao geral dos atendimentos — ${formatDate(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy")}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Atendimentos Hoje" value={stats.totalHoje} loading={loading}
          icon={<span className="text-xl">📋</span>} color="bg-blue-50" badge="Hoje" />
        <StatCard label="Aguardando" value={stats.aguardando} loading={loading}
          icon={<span className="text-xl">⏳</span>} color="bg-amber-50" badge="Agora" />
        <StatCard label="Finalizados Hoje" value={stats.finalizados} loading={loading}
          icon={<span className="text-xl">✅</span>} color="bg-emerald-50" badge="Hoje" />
        <StatCard label={`Producao ${formatCompetencia(comp)}`} value={stats.totalMes} loading={loading}
          icon={<span className="text-xl">📊</span>} color="bg-purple-50" badge={formatCompetencia(comp)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-display font-semibold text-surface-800 mb-4">Procedimentos no Mes</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-surface-600">Unilateral (03.09.07.001-5)</span>
                <span className="font-semibold text-surface-800">{stats.unilateral}</span>
              </div>
              <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all duration-500"
                  style={{ width: `${stats.totalMes ? (stats.unilateral / stats.totalMes) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-surface-600">Bilateral (03.09.07.002-3)</span>
                <span className="font-semibold text-surface-800">{stats.bilateral}</span>
              </div>
              <div className="h-3 bg-surface-100 rounded-full overflow-hidden">
                <div className="h-full bg-medical-500 rounded-full transition-all duration-500"
                  style={{ width: `${stats.totalMes ? (stats.bilateral / stats.totalMes) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-surface-100 flex justify-between">
            <span className="text-sm text-surface-500">Total producao</span>
            <span className="font-display font-bold text-lg text-surface-900">{stats.totalMes}</span>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display font-semibold text-surface-800 mb-4">Informacoes da Sessao</h3>
          <div className="space-y-3">
            {[
              ['Profissional', user?.nome_completo],
              ['CRM', user?.crm || '—'],
              ['Empresa', selectedEmpresa?.tipo === 'inovamed' ? 'Inovamed' : 'M&J Saude'],
              ['Unidade', (selectedUnidade as any)?.municipio?.nome || '—'],
              ['CNES', selectedUnidade?.cnes || '—'],
            ].map(([label, value], i) => (
              <div key={i} className={`flex justify-between py-2 ${i < 4 ? 'border-b border-surface-50' : ''}`}>
                <span className="text-sm text-surface-500">{label}</span>
                <span className="text-sm font-medium text-surface-800">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
