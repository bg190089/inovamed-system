import { SupabaseClient } from '@supabase/supabase-js';

export interface Triagem {
  id: string;
  paciente_id: string;
  unidade_id: string;
  profissional_id?: string;
  empresa_id?: string;
  alergia?: string;
  pressao_arterial?: string;
  hgt?: string;
  diabetes: boolean;
  hipertensao: boolean;
  doencas_cardiacas: boolean;
  doencas_hepaticas: boolean;
  doencas_renais: boolean;
  outras_doencas?: string;
  escleroterapia_anterior: boolean;
  escleroterapia_quando?: string;
  trombose_embolia: boolean;
  trombose_embolia_detalhe?: string;
  doencas_vasculares: boolean;
  doencas_vasculares_detalhe?: string;
  doppler_venoso: boolean;
  doppler_venoso_detalhe?: string;
  gravidez_amamentacao: boolean;
  observacao?: string;
  data_proxima_sessao?: string;
  agendamento_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  paciente?: any;
  unidade?: any;
  profissional?: any;
}

const FULL_SELECT = '*, paciente:pacientes(*), profissional:profissionais(*), unidade:unidades(*, municipio:municipios(*))';

export class TriagemService {
  constructor(private supabase: SupabaseClient) {}

  /** Get triagens for a unit (most recent first) */
  async getTriagensUnidade(unidadeId: string, limit = 50): Promise<Triagem[]> {
    const { data, error } = await this.supabase
      .from('triagens')
      .select(FULL_SELECT)
      .eq('unidade_id', unidadeId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  }

  /** Get latest triagem for a specific patient */
  async getUltimaTriagem(pacienteId: string): Promise<Triagem | null> {
    const { data, error } = await this.supabase
      .from('triagens')
      .select(FULL_SELECT)
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get all triagens for a patient (history) */
  async getHistoricoPaciente(pacienteId: string): Promise<Triagem[]> {
    const { data, error } = await this.supabase
      .from('triagens')
      .select(FULL_SELECT)
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  /** Create new triagem */
  async criar(triagem: Record<string, any>): Promise<Triagem> {
    const { data, error } = await this.supabase
      .from('triagens')
      .insert(triagem)
      .select(FULL_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Update triagem */
  async atualizar(id: string, updates: Record<string, any>): Promise<void> {
    const { error } = await this.supabase
      .from('triagens')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  /** Get triagem by ID */
  async getById(id: string): Promise<Triagem | null> {
    const { data, error } = await this.supabase
      .from('triagens')
      .select(FULL_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Get triagem by atendimento's paciente_id (for doctor view) */
  async getTriagemParaProntuario(pacienteId: string): Promise<Triagem | null> {
    // Get the most recent triagem for this patient
    return this.getUltimaTriagem(pacienteId);
  }
}
