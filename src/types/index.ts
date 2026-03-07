// ============================================================
// TYPES - Sistema Inovamed Escleroterapia
// ============================================================

export type UserRole = 'admin' | 'gestor' | 'medico' | 'recepcionista' | 'master';
export type SexoType = 'M' | 'F';
export type ProcedimentoTipo = 'unilateral' | 'bilateral';
export type AtendimentoStatus = 'aguardando_triagem' | 'aguardando' | 'em_atendimento' | 'finalizado' | 'cancelado';
export type AgendamentoStatus = 'agendado' | 'confirmado' | 'cancelado' | 'realizado' | 'faltou';
export type EmpresaTipo = 'inovamed' | 'mj';

export interface Empresa {
  id: string;
  tipo: EmpresaTipo;
  razao_social: string;
  cnpj: string;
}

export interface Municipio {
  id: string;
  nome: string;
  codigo_ibge: string;
  uf: string;
}

export interface Unidade {
  id: string;
  municipio_id: string;
  nome: string;
  cnes: string;
  endereco?: string;
  ativo: boolean;
  municipio?: Municipio;
}

export interface Profissional {
  id: string;
  user_id?: string;
  email?: string;
  nome_completo: string;
  cns?: string;
  cns_profissional?: string;
  cpf?: string;
  cbo: string;
  crm?: string;
  role: UserRole;
  empresa_id?: string;
  ativo: boolean;
  assinatura_digital?: string;
  tipo_assinatura?: string;
  empresa?: Empresa;
  unidades?: Unidade[];
  deve_trocar_senha?: boolean;
  municipio_id?: string;
}

export interface SessaoAnterior {
  numero: number;
  data: string;
  medico_nome: string;
}

export interface Paciente {
  id: string;
  nome_completo: string;
  sexo: SexoType;
  data_nascimento: string;
  cpf?: string;
  cns?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf: string;
  telefone?: string;
  email?: string;
  sessoes_anteriores?: SessaoAnterior[];
  created_at: string;
}

export interface Procedimento {
  id: string;
  codigo_sus: string;
  descricao: string;
  tipo: ProcedimentoTipo;
  cid_principal: string;
}

export interface Atendimento {
  id: string;
  numero_ficha: number;
  empresa_id: string;
  unidade_id: string;
  profissional_id: string;
  paciente_id: string;
  procedimento_id: string;
  competencia: string;
  cnes_unidade?: string;
  cns_profissional?: string;
  cbo_profissional?: string;
  data_atendimento: string;
  anamnese?: string;
  doppler?: string;
  descricao_procedimento?: string;
  observacoes?: string;
  cid: string;
  carater_atendimento: string;
  status: AtendimentoStatus;
  hora_chegada: string;
  hora_inicio_atendimento?: string;
  hora_fim_atendimento?: string;
  assinatura_paciente?: string;
  assinatura_at?: string;
  termo_aceito: boolean;
  reabertura_count?: number;
  ultima_reabertura?: string;
  assinatura_medico?: string;
  receita?: string;
  triagem_id?: string;
  drive_url?: string;
  created_at: string;
  // Relations
  paciente?: Paciente;
  profissional?: Profissional;
  unidade?: Unidade;
  procedimento?: Procedimento;
  empresa?: Empresa;
}

export interface FilaAtendimento {
  id: string;
  atendimento_id: string;
  unidade_id: string;
  posicao: number;
  data_fila: string;
  chamado: boolean;
  atendimento?: Atendimento;
}

export interface Agendamento {
  id: string;
  empresa_id: string;
  unidade_id: string;
  paciente_id: string;
  profissional_id: string;
  procedimento_id: string;
  data_agendamento: string;
  horario_inicio: string;
  horario_fim?: string;
  observacoes?: string;
  numero_sessao?: number;
  status: AgendamentoStatus;
  created_at: string;
  updated_at?: string;
  // Relations
  paciente?: Paciente;
  profissional?: Profissional;
  procedimento?: Procedimento;
  unidade?: Unidade;
  empresa?: Empresa;
}

export interface SessionContext {
  user: Profissional;
  empresa: Empresa;
  unidade: Unidade;
}

// Form types
export interface PacienteForm {
  nome_completo: string;
  sexo: SexoType;
  data_nascimento: string;
  cpf: string;
  cns?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  telefone?: string;
}

export interface AtendimentoForm {
  empresa_id: string;
  unidade_id: string;
  profissional_id: string;
  paciente_id: string;
  procedimento_id: string;
  data_atendimento: string;
}

export interface ProntuarioForm {
  anamnese: string;
  doppler: string;
  descricao_procedimento: string;
  observacoes?: string;
}

// Report types
export interface ProdutividadeMedico {
  profissional_nome: string;
  profissional_crm: string;
  total_atendimentos: number;
  total_unilateral: number;
  total_bilateral: number;
  media_diaria: number;
}

export interface ProdutividadeMunicipio {
  municipio_nome: string;
  cnes: string;
  total_atendimentos: number;
  total_unilateral: number;
  total_bilateral: number;
  total_profissionais: number;
  dias_atendimento: number;
}

export interface BPARecord {
  cnes: string;
  competencia: string;
  cns_profissional: string;
  cbo: string;
  data_atendimento: string;
  numero_folha: string;
  numero_sequencial: string;
  procedimento: string;
  paciente_nome: string;
  paciente_cpf: string;
  paciente_cns: string;
  paciente_sexo: string;
  paciente_municipio: string;
  paciente_nascimento: string;
  cid: string;
  carater: string;
  quantidade: string;
}
