// ============================================================
// PDF Prontuário Service - Geração server-side com PDFKit
// ============================================================

import PDFDocument from 'pdfkit';

interface ProntuarioData {
  anamnese?: string;
  doppler?: string;
  descricao_procedimento?: string;
  observacoes?: string;
  receita?: string;
}

interface PacienteData {
  nome_completo: string;
  cpf?: string;
  data_nascimento?: string;
  sexo?: string;
}

interface AtendimentoCompleto {
  id: string;
  numero_ficha?: number;
  data_atendimento: string;
  hora_inicio_atendimento?: string;
  hora_fim_atendimento?: string;
  anamnese?: string;
  doppler?: string;
  descricao_procedimento?: string;
  observacoes?: string;
  receita?: string;
  assinatura_medico?: string;
  paciente?: PacienteData;
  profissional?: {
    nome_completo: string;
    crm?: string;
    cbo?: string;
    cns?: string;
    assinatura_digital?: string;
  };
  procedimento?: {
    tipo?: string;
    descricao?: string;
    codigo_sus?: string;
  };
  unidade?: {
    nome: string;
    cnes?: string;
    municipio?: { nome: string };
  };
}

function maskCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function calcularIdade(dataNascimento: string): number {
  const nasc = new Date(dataNascimento + 'T00:00:00');
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

function formatTimeBR(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const BLUE = '#1e40af';
const DARK = '#1a1a1a';
const GRAY = '#555555';
const LIGHT_BG = '#f8f9fa';

/**
 * Gera PDF do prontuário completo e retorna como Buffer
 */
export async function gerarPDFProntuario(
  atendimento: AtendimentoCompleto,
  prontuarioExtra?: ProntuarioData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `Prontuário - ${atendimento.paciente?.nome_completo || 'Paciente'}`,
          Author: 'Inovamed - Sistema de Escleroterapia',
          Creator: 'Inovamed',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ========== CABEÇALHO ==========
      doc.fontSize(16).fillColor(BLUE).font('Helvetica-Bold');
      doc.text('INOVAMED', { align: 'center' });
      doc.fontSize(10).fillColor(GRAY).font('Helvetica');
      doc.text('Sistema de Escleroterapia', { align: 'center' });

      const unidadeNome = atendimento.unidade?.nome || '';
      const cnes = atendimento.unidade?.cnes || '';
      const municipio = atendimento.unidade?.municipio?.nome || '';
      if (unidadeNome) {
        doc.text(`${unidadeNome}${cnes ? ' | CNES: ' + cnes : ''}${municipio ? ' | ' + municipio : ''}`, { align: 'center' });
      }

      // Linha separadora
      doc.moveDown(0.5);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(BLUE).lineWidth(2).stroke();
      doc.moveDown(0.8);

      // ========== TÍTULO ==========
      doc.fontSize(13).fillColor(DARK).font('Helvetica-Bold');
      doc.text('PRONTUÁRIO DE ATENDIMENTO', { align: 'center' });
      doc.moveDown(0.8);

      // ========== DADOS DO PACIENTE ==========
      drawSectionTitle(doc, 'DADOS DO PACIENTE');

      const pac = atendimento.paciente;
      if (pac) {
        const idade = pac.data_nascimento ? calcularIdade(pac.data_nascimento) : '';
        const sexo = pac.sexo === 'F' ? 'Feminino' : pac.sexo === 'M' ? 'Masculino' : '';

        drawField(doc, 'Nome', pac.nome_completo);
        drawFieldRow(doc, pageWidth,
          ['CPF', pac.cpf ? maskCPF(pac.cpf) : 'Não informado'],
          ['Nascimento', pac.data_nascimento ? `${formatDateBR(pac.data_nascimento)} (${idade} anos)` : '']
        );
        drawField(doc, 'Sexo', sexo);
      }
      doc.moveDown(0.5);

      // ========== DADOS DO ATENDIMENTO ==========
      drawSectionTitle(doc, 'DADOS DO ATENDIMENTO');

      const horaInicio = formatTimeBR(atendimento.hora_inicio_atendimento);
      const horaFim = formatTimeBR(atendimento.hora_fim_atendimento);
      const horario = horaInicio ? `${horaInicio}${horaFim ? ' - ' + horaFim : ''}` : '';

      drawFieldRow(doc, pageWidth,
        ['Data', formatDateBR(atendimento.data_atendimento)],
        ['Horário', horario]
      );
      drawFieldRow(doc, pageWidth,
        ['Procedimento', atendimento.procedimento?.tipo === 'bilateral' ? 'Bilateral' : 'Unilateral'],
        ['Ficha Nº', String(atendimento.numero_ficha || '')]
      );

      const profNome = atendimento.profissional?.nome_completo || '';
      const profCRM = atendimento.profissional?.crm || '';
      drawField(doc, 'Profissional', `Dr(a). ${profNome}${profCRM ? ' - CRM: ' + profCRM : ''}`);
      doc.moveDown(0.5);

      // ========== CAMPOS CLÍNICOS ==========
      const anamnese = atendimento.anamnese || prontuarioExtra?.anamnese;
      const doppler = atendimento.doppler || prontuarioExtra?.doppler;
      const descProc = atendimento.descricao_procedimento || prontuarioExtra?.descricao_procedimento;
      const obs = atendimento.observacoes || prontuarioExtra?.observacoes;
      const receita = atendimento.receita || prontuarioExtra?.receita;

      if (doppler) {
        drawSectionTitle(doc, 'DOPPLER VASCULAR');
        drawContentBlock(doc, doppler);
      }

      if (anamnese) {
        drawSectionTitle(doc, 'ANAMNESE');
        drawContentBlock(doc, anamnese);
      }

      if (descProc) {
        drawSectionTitle(doc, 'DESCRIÇÃO DO PROCEDIMENTO');
        drawContentBlock(doc, descProc);
      }

      if (obs) {
        drawSectionTitle(doc, 'OBSERVAÇÕES');
        drawContentBlock(doc, obs);
      }

      if (receita) {
        drawSectionTitle(doc, 'RECEITA MÉDICA');
        drawContentBlock(doc, receita);
      }

      // ========== ASSINATURA DO MÉDICO ==========
      doc.moveDown(1.5);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#dddddd').lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      const assinatura = atendimento.assinatura_medico || atendimento.profissional?.assinatura_digital;
      if (assinatura && assinatura.startsWith('data:image')) {
        try {
          const base64Data = assinatura.split(',')[1];
          const imgBuffer = Buffer.from(base64Data, 'base64');
          const imgX = (doc.page.width - 150) / 2;
          doc.image(imgBuffer, imgX, doc.y, { width: 150, height: 60 });
          doc.moveDown(4);
        } catch {
          // Se falhar ao processar imagem, continua sem ela
        }
      }

      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold');
      doc.text(`Dr(a). ${profNome}`, { align: 'center' });
      doc.fontSize(8).fillColor(GRAY).font('Helvetica');
      if (atendimento.profissional?.cbo) {
        doc.text(`CBO: ${atendimento.profissional.cbo}`, { align: 'center' });
      }
      if (atendimento.profissional?.cns) {
        doc.text(`CNS: ${atendimento.profissional.cns}`, { align: 'center' });
      }
      if (profCRM) {
        doc.text(`CRM: ${profCRM}`, { align: 'center' });
      }

      // ========== RODAPÉ ==========
      doc.moveDown(2);
      doc.fontSize(7).fillColor('#999999').font('Helvetica');
      doc.text(
        `Documento gerado pelo sistema Inovamed em ${new Date().toLocaleString('pt-BR')}. Este documento é parte do prontuário eletrônico do paciente.`,
        { align: 'center' }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ========== Funções auxiliares de desenho ==========

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(10).fillColor(BLUE).font('Helvetica-Bold');
  doc.text(title);
  doc.moveTo(doc.x, doc.y)
    .lineTo(doc.x + 200, doc.y)
    .strokeColor('#dddddd').lineWidth(0.5).stroke();
  doc.moveDown(0.3);
}

function drawField(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
  doc.text(`${label}: `, { continued: true });
  doc.font('Helvetica').fillColor(DARK);
  doc.text(value || '-');
}

function drawFieldRow(
  doc: PDFKit.PDFDocument,
  pageWidth: number,
  field1: [string, string],
  field2: [string, string]
) {
  const y = doc.y;
  const halfWidth = pageWidth / 2;

  doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
  doc.text(`${field1[0]}: `, doc.page.margins.left, y, { continued: true, width: halfWidth });
  doc.font('Helvetica').fillColor(DARK);
  doc.text(field1[1] || '-', { width: halfWidth });

  doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
  doc.text(`${field2[0]}: `, doc.page.margins.left + halfWidth, y, { continued: true, width: halfWidth });
  doc.font('Helvetica').fillColor(DARK);
  doc.text(field2[1] || '-', { width: halfWidth });

  doc.x = doc.page.margins.left;
}

function drawContentBlock(doc: PDFKit.PDFDocument, content: string) {
  doc.fontSize(9).fillColor(DARK).font('Helvetica');
  doc.text(content, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  });
  doc.moveDown(0.5);
}
