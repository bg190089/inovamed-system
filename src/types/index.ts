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
  deve_trocar_senha?: boolean;
  municipio_id?: string;
  empresa?: Empresa;
  unidades?: Unidade[];
}
