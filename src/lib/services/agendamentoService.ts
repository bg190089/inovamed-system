import { SupabaseClient } from '@supabase/supabase-js';
import type { Agendamento, Paciente, Procedimento, Profissional } from '@/types';

const FULL_SELECT = '*, paciente:pacientes(*), profissional:profissionais(*), procedimento:procedimentos(*), unidade:unidades(*, municipio:municipios(*))';

export class AgendamentoService {
  constructor(private supabase: SupabaseClient) {}

  async getAgendamentosDia(data: string, unidadeId: string): Promise<Agendamento[]> {
    // Try RPC first, fallback to direct query
    try {
      const { data: agendamentos, error } = await this.supabase
        .from('agendamentos')
        .select(FULL_SELECT)
        .eq('data_agendamento', data)
        .eq('unidade_id', unidadeId)
        .order('horario_inicio', { ascending: true });
      if (error) throw error;
      return agendamentos || [];
    } catch {
      return [];
    }
  }

  async getAgendamentosSemana(dataInicio: string, dataFim: string, unidadeId: string): Promise<Agendamento[]> {
    const { data, error } = await this.supabase
      .from('agendamentos')
      .select(FULL_SELECT)
      .eq('unidade_id', unidadeId)
      .gte('data_agendamento', dataInicio)
      .lte('data_agendamento', dataFim)
      .order('data_agendamento', { ascending: true })
      .order('horario_inicio', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  async createAgendamento(agendamento: Record<string, any>): Promise<Agendamento> {
    const { data, error } = await this.supabase.from('agendamentos').insert(agendamento).select(FULL_SELECT).single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateAgendamentoStatus(id: string, status: string): Promise<void> {
    const { error } = await this.supabase.from('agendamentos').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async updateAgendamento(id: string, updates: Record<string, any>): Promise<void> {
    const { error } = await this.supabase.from('agendamentos').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async cancelAgendamento(id: string): Promise<void> {
    const { error } = await this.supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async getAgendamentosPaciente(pacienteId: string): Promise<Agendamento[]> {
    const { data, error } = await this.supabase
      .from('agendamentos')
      .select(FULL_SELECT)
      .eq('paciente_id', pacienteId)
      .order('data_agendamento', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data || [];
  }

  async getProcedimentos(): Promise<Procedimento[]> {
    const { data } = await this.supabase.from('procedimentos').select('*').eq('ativo', true);
    return data || [];
  }

  async getMedicos(): Promise<Profissional[]> {
    const { data } = await this.supabase.from('profissionais').select('*').eq('role', 'medico').eq('ativo', true);
    return data || [];
  }
}
