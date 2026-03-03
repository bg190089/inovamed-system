import { SupabaseClient } from '@supabase/supabase-js';
import { getCompetenciaAtual } from '@/lib/utils';

export interface DashboardStats {
  totalHoje: number; totalMes: number; aguardando: number; finalizados: number;
  emAtendimento: number; unilateral: number; bilateral: number;
}

export class DashboardService {
  constructor(private supabase: SupabaseClient) {}

  async getStats(unidadeId: string): Promise<DashboardStats> {
    const today = new Date().toISOString().split('T')[0];
    const comp = getCompetenciaAtual();
    const [hoje, mes, ag, fin, em, tipos] = await Promise.all([
      this.supabase.from('atendimentos').select('*', { count: 'exact', head: true }).eq('data_atendimento', today).eq('unidade_id', unidadeId),
      this.supabase.from('atendimentos').select('*', { count: 'exact', head: true }).eq('competencia', comp).eq('unidade_id', unidadeId),
      this.supabase.from('atendimentos').select('*', { count: 'exact', head: true }).eq('data_atendimento', today).eq('status', 'aguardando').eq('unidade_id', unidadeId),
      this.supabase.from('atendimentos').select('*', { count: 'exact', head: true }).eq('data_atendimento', today).eq('status', 'finalizado').eq('unidade_id', unidadeId),
      this.supabase.from('atendimentos').select('*', { count: 'exact', head: true }).eq('data_atendimento', today).eq('status', 'em_atendimento').eq('unidade_id', unidadeId),
      this.supabase.from('atendimentos').select('procedimento:procedimentos(tipo)').eq('competencia', comp).eq('unidade_id', unidadeId).eq('status', 'finalizado'),
    ]);
    const t = tipos.data || [];
    return {
      totalHoje: hoje.count || 0, totalMes: mes.count || 0,
      aguardando: ag.count || 0, finalizados: fin.count || 0, emAtendimento: em.count || 0,
      unilateral: t.filter((a: any) => a.procedimento?.tipo === 'unilateral').length,
      bilateral: t.filter((a: any) => a.procedimento?.tipo === 'bilateral').length,
    };
  }
}
