import { z } from 'zod';

function isValidCPF(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, '');
  if (nums.length !== 11) return false;
  if (/^(\d)\1+$/.test(nums)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(nums[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(nums[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(nums[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(nums[10]);
}

export const pacienteSchema = z.object({
  nome_completo: z.string().min(5, 'Nome deve ter pelo menos 5 caracteres').max(200).transform((v) => v.toUpperCase().trim()),
  sexo: z.enum(['M', 'F'], { required_error: 'Selecione o sexo' }),
  data_nascimento: z.string().min(1, 'Data de nascimento obrigatoria').refine((v) => { const d = new Date(v); return d < new Date() && d > new Date('1900-01-01'); }, 'Data invalida'),
  cpf: z.string().min(1, 'CPF obrigatorio').refine((v) => isValidCPF(v), 'CPF invalido'),
  cns: z.string().optional().default(''),
  cep: z.string().optional().default(''),
  logradouro: z.string().optional().default(''),
  numero: z.string().optional().default(''),
  complemento: z.string().optional().default(''),
  bairro: z.string().optional().default(''),
  cidade: z.string().optional().default(''),
  uf: z.string().optional().default(''),
  telefone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  nome_mae: z.string().optional().default(''),
});

export const profissionalSchema = z.object({
  email: z.string().email('E-mail invalido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  nome_completo: z.string().min(3, 'Nome obrigatorio').transform((v) => v.toUpperCase().trim()),
  cns: z.string().optional().default(''),
  cpf: z.string().optional().default(''),
  cbo: z.string().min(1, 'CBO obrigatorio').default('225203'),
  crm: z.string().optional().default(''),
  role: z.enum(['admin', 'gestor', 'medico', 'recepcionista']).default('medico'),
  municipio_id: z.string().optional().default(''),
});

export const unidadeSchema = z.object({
  municipio_id: z.string().uuid('Selecione um municipio'),
  nome: z.string().min(3, 'Nome da unidade obrigatorio'),
  cnes: z.string().min(1, 'CNES obrigatorio'),
  endereco: z.string().optional().default(''),
});

export const municipioSchema = z.object({
  nome: z.string().min(2, 'Nome do municipio obrigatorio'),
  codigo_ibge: z.string().min(7, 'Codigo IBGE invalido').max(7),
  uf: z.string().length(2, 'UF deve ter 2 caracteres'),
});
