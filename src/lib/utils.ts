import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// CPF mask: 000.000.000-00
export function maskCPF(value: string): string {
  const nums = value.replace(/\D/g, '').slice(0, 11);
  return nums
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// CNS mask: 000 0000 0000 0000
export function maskCNS(value: string): string {
  const nums = value.replace(/\D/g, '').slice(0, 15);
  return nums
    .replace(/(\d{3})(\d)/, '$1 $2')
    .replace(/(\d{4})(\d)/, '$1 $2')
    .replace(/(\d{4})(\d)/, '$1 $2');
}

// CEP mask: 00000-000
export function maskCEP(value: string): string {
  const nums = value.replace(/\D/g, '').slice(0, 8);
  return nums.replace(/(\d{5})(\d)/, '$1-$2');
}

// Phone mask: (00) 00000-0000
export function maskPhone(value: string): string {
  const nums = value.replace(/\D/g, '').slice(0, 11);
  if (nums.length <= 10) {
    return nums
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return nums
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

// Unmask (remove non-digits)
export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}

// Validate CPF
export function validateCPF(cpf: string): boolean {
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

// Format date
export function formatDate(date: string | Date, fmt: string = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: ptBR });
}

// Calculate age
export function calcularIdade(dataNascimento: string): number {
  return differenceInYears(new Date(), parseISO(dataNascimento));
}

// Format competencia
export function formatCompetencia(comp: string): string {
  if (!comp || comp.length !== 6) return comp;
  const year = comp.substring(0, 4);
  const month = comp.substring(4, 6);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(month) - 1]}/${year}`;
}

// Current competencia
export function getCompetenciaAtual(): string {
  return format(new Date(), 'yyyyMM');
}

// Generate BPA filename
export function generateBPAFilename(municipio: string, competencia: string): string {
  const nome = municipio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  return `BPA_${nome}_${competencia}.xlsx`;
}

// Status colors
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    aguardando: 'bg-amber-100 text-amber-800',
    em_atendimento: 'bg-blue-100 text-blue-800',
    finalizado: 'bg-emerald-100 text-emerald-800',
    cancelado: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    aguardando: 'Aguardando',
    em_atendimento: 'Em Atendimento',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
  };
  return labels[status] || status;
}
