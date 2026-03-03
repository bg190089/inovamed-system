import { SupabaseClient } from '@supabase/supabase-js';
import type { Paciente } from '@/types';

export class PacienteService {
  constructor(private supabase: SupabaseClient) {}

  async buscar(termo: string): Promise<Paciente[]> {
    if (termo.length < 3) return [];
    const clean = termo.replace(/\D/g, '');
    const { data, error } = await this.supabase.rpc('buscar_paciente', {
      termo: clean.length > 0 && /^\d+$/.test(clean) ? clean : termo,
    });
    if (error) { console.error('Erro na busca:', error); return []; }
    return data || [];
  }

  async getByCPF(cpf: string): Promise<Paciente | null> {
    const { data } = await this.supabase.from('pacientes').select('*').eq('cpf', cpf).maybeSingle();
    return data;
  }

  async criar(paciente: Partial<Paciente>): Promise<Paciente> {
    const { data, error } = await this.supabase.from('pacientes').insert(paciente).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  async atualizar(id: string, updates: Partial<Paciente>): Promise<void> {
    const { error } = await this.supabase.from('pacientes').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  }
}
