import { SupabaseClient } from '@supabase/supabase-js';
import type { Atendimento, Procedimento, Profissional } from '@/types';

const FULL_SELECT = '*, paciente:pacientes(*), profissional:profissionais(*), procedimento:procedimentos(*), unidade:unidades(*, municipio:municipios(*))';

// Lighter select for list views (polling) - no unidade join since already known from context
const LIST_SELECT = '*, paciente:pacientes(id, nome, cpf, data_nascimento, sexo, cns), profissional:profissionais(id, nome), procedimento:procedimentos(id, nome, tipo, codigo_sus)';

export class AtendimentoService {
  constructor(private supabase: SupabaseClient) {}

  async getFilaDoDia(unidadeId: string, profissionalId?: string): Promise<Atendimento[]> {
    const today = new Date().toISOString().split('T')[0];
    let query = this.supabase.from('atendimentos').select(LIST_SELECT)
      .eq('unidade_id', unidadeId).eq('data_atendimento', today)
      .order('hora_chegada', { ascending: true });
    if (profissionalId) {
      query = query.eq('profissional_id', profissionalId).in('status', ['aguardando', 'em_atendimento']);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async criar(atendimento: Record<string, any>): Promise<Atendimento> {
    const { data, error } = await this.supabase.from('atendimentos').insert(atendimento).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async atualizarStatus(id: string, status: string, extras: Record<string, any> = {}): Promise<void> {
    const { error } = await this.supabase.from('atendimentos').update({ status, ...extras }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async salvarProntuario(id: string, prontuario: Record<string, any>, finalizar = false): Promise<void> {
    const data: Record<string, any> = { ...prontuario };
    if (finalizar) { data.status = 'finalizado'; data.hora_fim_atendimento = new Date().toISOString(); }
    const { error } = await this.supabase.from('atendimentos').update(data).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async getHistoricoPaciente(pacienteId: string, limit = 10): Promise<Atendimento[]> {
    const { data } = await this.supabase.from('atendimentos')
      .select('*, procedimento:procedimentos(*), unidade:unidades(*, municipio:municipios(*))')
      .eq('paciente_id', pacienteId).eq('status', 'finalizado')
      .order('data_atendimento', { ascending: false }).limit(limit);
    return data || [];
  }

  async getProcedimentos(): Promise<Procedimento[]> {
    const { data } = await this.supabase.from('procedimentos').select('*').eq('ativo', true);
    return data || [];
  }

  async getMedicos(): Promise<Profissional[]> {
    const { data } = await this.supabase.from('profissionais').select('*').in('role', ['medico', 'master']).eq('ativo', true).not('crm', 'is', null);
    return data || [];
  }

  async getFinalizadosPorData(unidadeId: string, profissionalId: string, data: string): Promise<Atendimento[]> {
    const { data: records, error } = await this.supabase
      .from('atendimentos')
      .select(FULL_SELECT)
      .eq('unidade_id', unidadeId)
      .eq('profissional_id', profissionalId)
      .eq('data_atendimento', data)
      .eq('status', 'finalizado')
      .order('hora_fim_atendimento', { ascending: false });
    if (error) throw new Error(error.message);
    return records || [];
  }

  async reabrirAtendimento(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('atendimentos')
      .update({
        status: 'em_atendimento',
        hora_fim_atendimento: null,
        // reabertura_count is incremented via RPC below
        ultima_reabertura: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
    // Try to increment reabertura_count via RPC
    try {
      await this.supabase.rpc('incrementar_reabertura', { p_atendimento_id: id });
    } catch {
      // RPC may not exist yet — ignore
    }
  }

  async contarSessoes12Meses(pacienteId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('contar_sessoes_12_meses', { p_paciente_id: pacienteId });
    if (error) return 0;
    return data || 0;
  }
}
