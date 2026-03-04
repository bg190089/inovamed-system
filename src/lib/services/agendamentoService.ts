import { SupabaseClient } from '@supabase/supabase-js';
import type { Agendamento, Paciente, Procedimento, Profissional } from '@/types';

const FULL_SELECT = '*, paciente:pacientes(*), profissional:profissionais(*), procedimento:procedimentos(*), unidade:unidades(*, municipio:municipios(*))';

// Mapeamento dos nomes informais da escala → nomes formais no banco
const ESCALA_NOME_MAP: Record<string, string> = {
  'Lucas Portela': 'LUCAS PORTELA TAVARES',
  'Vitoria Castro': 'VITORIA CASTRO MARCOS',
  'Lais Muhana': 'LAIS CARVALHO MUHANA ALVES',
  'Aline Mangabeira': 'ALINE FERNANDES MANGABEIRA',
  'Mariana Pires': 'MARIANA SANTOS PIRES',
  'Victor Porto': 'VICTOR PORTO SALES',
  'Gustavo Santos': 'GUSTAVO SILVA DOS SANTOS',
  'Brenda Leite': 'BRENDA DE LIMA LEITE',
  'Roberto Margotti': 'ROBERTO FREIRE MARGOTTI',
};

// Mapeamento dos nomes de cidades da escala → nomes de municípios no banco
const ESCALA_CIDADE_MAP: Record<string, string> = {
  'COITÉ': 'Conceição do Coité',
  'SANTO ESTEVÃO': 'Santo Estevão',
  'CONCEIÇÃO DA FEIRA': 'Conceição da Feira',
  'SERRA PRETA': 'Serra Preta',
  'SERRINHA': 'Serrinha',
  'BARROCAS': 'Barrocas',
};

export interface EscalaDoDia {
  medico_nome_escala: string;
  medico_nome_formal: string;
  cidade_escala: string;
  municipio_nome: string;
  profissional_id?: string;
}

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

  /**
   * Consulta a escala médica para uma data e município específicos.
   * Retorna qual(is) médico(s) está(ão) escalado(s) na unidade naquele dia.
   */
  async getEscalaDoDia(data: string, municipioNome: string): Promise<EscalaDoDia[]> {
    try {
      const [year, month, day] = data.split('-');
      const competencia = `${year}-${month}`;
      const dayNum = parseInt(day, 10);

      const { data: escala, error } = await this.supabase
        .from('escalas_medicas')
        .select('schedule')
        .eq('competencia', competencia)
        .single();

      if (error || !escala) return [];

      const schedule = escala.schedule as Record<string, Array<{ c: string; m: string }>>;
      const dayEntries = schedule[String(dayNum)] || [];

      if (dayEntries.length === 0) return [];

      // Filtrar pela cidade/município
      const cidadeEscala = Object.entries(ESCALA_CIDADE_MAP)
        .find(([_, dbNome]) => dbNome.toLowerCase() === municipioNome.toLowerCase())?.[0];

      const filtered = cidadeEscala
        ? dayEntries.filter(e => e.c === cidadeEscala)
        : dayEntries.filter(e => {
            const mapped = ESCALA_CIDADE_MAP[e.c];
            return mapped && mapped.toLowerCase() === municipioNome.toLowerCase();
          });

      if (filtered.length === 0) return [];

      // Buscar IDs dos profissionais pelo nome formal
      const medicos = await this.getMedicos();

      return filtered.map(entry => {
        const nomeFormal = ESCALA_NOME_MAP[entry.m] || entry.m.toUpperCase();
        const prof = medicos.find(p => p.nome_completo === nomeFormal);

        return {
          medico_nome_escala: entry.m,
          medico_nome_formal: nomeFormal,
          cidade_escala: entry.c,
          municipio_nome: ESCALA_CIDADE_MAP[entry.c] || entry.c,
          profissional_id: prof?.id,
        };
      });
    } catch (err) {
      console.error('Erro ao consultar escala:', err);
      return [];
    }
  }
}
