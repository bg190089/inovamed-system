// ============================================================
// PDF TCLE Service - Geração do Termo de Consentimento
// Escleroterapia Ecoguiada com Espuma
// ============================================================

import PDFDocument from 'pdfkit';

interface TcleDadosInput {
  // Paciente
  paciente_nome: string;
  paciente_cpf?: string;
  paciente_data_nascimento?: string;
  paciente_sexo?: string;
  paciente_endereco?: string;

  // Médico (do dia, via escala)
  medico_nome?: string;
  medico_crm?: string;

  // Profissional que triou (testemunha)
  triador_nome: string;
  triador_cpf?: string;

  // Unidade
  unidade_nome: string;
  unidade_cnes?: string;
  municipio_nome: string;

  // Empresa
  empresa_nome: string; // Inovamed ou M&J

  // Assinatura digital (base64 data URI)
  assinatura_paciente?: string;

  // Metadados jurídicos
  ip_address: string;
  data_hora: string;  // ISO string
  hash_integridade?: string;
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

function formatDateTimeBR(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

const BLUE = '#1e3a5f';
const DARK = '#1a1a1a';
const GRAY = '#555555';

/**
 * Gera PDF do TCLE e retorna como Buffer
 */
export async function gerarPDFTcle(dados: TcleDadosInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 45, right: 45 },
        info: {
          Title: `TCLE - ${dados.paciente_nome}`,
          Author: dados.empresa_nome,
          Creator: 'Inovamed - Sistema de Escleroterapia',
          Subject: 'Termo de Consentimento Livre e Esclarecido',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ========== CABEÇALHO ==========
      doc.fontSize(14).fillColor(BLUE).font('Helvetica-Bold');
      doc.text(dados.empresa_nome.toUpperCase(), { align: 'center' });
      doc.fontSize(8).fillColor(GRAY).font('Helvetica');
      doc.text(`${dados.unidade_nome} | CNES: ${dados.unidade_cnes || ''} | ${dados.municipio_nome}`, { align: 'center' });

      doc.moveDown(0.5);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(BLUE).lineWidth(1.5).stroke();
      doc.moveDown(0.6);

      // ========== TÍTULO ==========
      doc.fontSize(11).fillColor(DARK).font('Helvetica-Bold');
      doc.text('TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)', { align: 'center' });
      doc.fontSize(9).fillColor(GRAY).font('Helvetica');
      doc.text('Escleroterapia Ecoguiada com Espuma de Polidocanol', { align: 'center' });
      doc.moveDown(0.6);

      // ========== DADOS DO PACIENTE ==========
      const idade = dados.paciente_data_nascimento ? calcularIdade(dados.paciente_data_nascimento) : '';
      const cpfFormatado = dados.paciente_cpf ? maskCPF(dados.paciente_cpf) : 'Não informado';
      const nascFormatado = dados.paciente_data_nascimento ? formatDateBR(dados.paciente_data_nascimento) : '';
      const sexo = dados.paciente_sexo === 'F' ? 'Feminino' : dados.paciente_sexo === 'M' ? 'Masculino' : '';

      doc.fontSize(8).fillColor(DARK).font('Helvetica-Bold');
      doc.text('PACIENTE: ', { continued: true });
      doc.font('Helvetica').text(dados.paciente_nome);
      doc.font('Helvetica-Bold').text('CPF: ', { continued: true });
      doc.font('Helvetica').text(`${cpfFormatado}    `, { continued: true });
      doc.font('Helvetica-Bold').text('Nascimento: ', { continued: true });
      doc.font('Helvetica').text(`${nascFormatado} (${idade} anos)    `, { continued: true });
      doc.font('Helvetica-Bold').text('Sexo: ', { continued: true });
      doc.font('Helvetica').text(sexo);
      if (dados.paciente_endereco) {
        doc.font('Helvetica-Bold').text('Endereço: ', { continued: true });
        doc.font('Helvetica').text(dados.paciente_endereco);
      }
      doc.moveDown(0.5);

      // ========== MÉDICO RESPONSÁVEL ==========
      if (dados.medico_nome) {
        doc.font('Helvetica-Bold').text('MÉDICO(A) RESPONSÁVEL: ', { continued: true });
        doc.font('Helvetica').text(`Dr(a). ${dados.medico_nome}${dados.medico_crm ? ' — CRM/BA ' + dados.medico_crm : ''}`);
      } else {
        doc.font('Helvetica-Bold').text('MÉDICO(A) RESPONSÁVEL: ', { continued: true });
        doc.font('Helvetica').fillColor('#cc0000').text('(A ser preenchido posteriormente)');
        doc.fillColor(DARK);
      }
      doc.moveDown(0.4);

      // Linha separadora
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#cccccc').lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      // ========== CONTEÚDO DO TCLE ==========
      const fontSize = 7.5;
      const titleSize = 8.5;

      // PREÂMBULO
      doc.fontSize(fontSize).font('Helvetica').fillColor(DARK);
      doc.text(
        'Eu, acima identificado(a), declaro que fui informado(a) de forma clara, detalhada e compreensível ' +
        'pelo(a) médico(a) responsável e/ou sua equipe sobre os seguintes aspectos relativos ao procedimento de ' +
        'Escleroterapia Ecoguiada com Espuma de Polidocanol, ao qual serei submetido(a):',
        { align: 'justify', lineGap: 1.5 }
      );
      doc.moveDown(0.4);

      // I. PROCEDIMENTO
      writeSection(doc, titleSize, fontSize, pageWidth,
        'I. DO PROCEDIMENTO',
        'O procedimento de Escleroterapia Ecoguiada com Espuma de Polidocanol consiste na injeção de uma ' +
        'substância esclerosante (Polidocanol) em forma de microespuma diretamente nas veias acometidas por ' +
        'varizes e/ou insuficiência venosa crônica, com o auxílio de ultrassom vascular (Doppler), visando à ' +
        'oclusão e ao tratamento dessas veias. Trata-se de um procedimento minimamente invasivo, realizado em ' +
        'ambiente ambulatorial, sem necessidade de internação hospitalar.'
      );

      // II. ALTERNATIVAS TERAPÊUTICAS
      writeSection(doc, titleSize, fontSize, pageWidth,
        'II. ALTERNATIVAS TERAPÊUTICAS',
        'Fui informado(a) de que existem outras opções de tratamento disponíveis para minha condição, incluindo: ' +
        'tratamento clínico conservador (uso de meias elásticas e medicamentos venotônicos), cirurgia convencional ' +
        '(safenectomia), ablação térmica por laser ou radiofrequência. A escolha pelo presente procedimento foi ' +
        'baseada em avaliação clínica individualizada.'
      );

      // III. RISCOS E COMPLICAÇÕES
      writeSection(doc, titleSize, fontSize, pageWidth,
        'III. DOS RISCOS E COMPLICAÇÕES POSSÍVEIS',
        'Estou ciente de que, como todo procedimento médico, a escleroterapia com espuma pode apresentar ' +
        'complicações, incluindo, mas não se limitando a:\n' +
        '• Dor e desconforto local;\n' +
        '• Flebite/tromboflebite superficial (inflamação das veias tratadas);\n' +
        '• Hiperpigmentação cutânea (escurecimento da pele ao longo das veias tratadas);\n' +
        '• Matting (aparecimento de microvasos avermelhados);\n' +
        '• Equimoses (hematomas);\n' +
        '• Reação alérgica ao esclerosante;\n' +
        '• Necrose cutânea (em casos raros, por extravasamento);\n' +
        '• Trombose venosa profunda (TVP);\n' +
        '• Embolia pulmonar (rara);\n' +
        '• Distúrbios visuais transitórios, cefaleia ou sintomas neurológicos transitórios;\n' +
        '• Acidente vascular cerebral (AVC) — extremamente raro, porém descrito na literatura;\n' +
        '• Outras complicações raras ou imprevisíveis.'
      );

      // III-A. ALTERAÇÕES ESTÉTICAS
      writeSection(doc, titleSize, fontSize, pageWidth,
        'III-A. DAS ALTERAÇÕES ESTÉTICAS',
        'Fui informado(a) de que a hiperpigmentação (manchas escuras na pele) é uma complicação possível e ' +
        'relativamente frequente da escleroterapia com espuma. Essa alteração pode ser transitória ou, em ' +
        'alguns casos, permanente, e seu surgimento depende de fatores individuais, como tipo de pele, ' +
        'predisposição genética e cuidados pós-procedimento. Reconheço que o objetivo do tratamento é ' +
        'terapêutico e funcional, e não exclusivamente estético.'
      );

      // IV. INFORMAÇÕES
      writeSection(doc, titleSize, fontSize, pageWidth,
        'IV. DAS INFORMAÇÕES PRESTADAS PELO PACIENTE',
        'Declaro que prestei informações verdadeiras e completas sobre meu estado de saúde, uso de ' +
        'medicamentos, alergias, gestação ou suspeita de gestação, histórico de trombose, doenças ' +
        'autoimunes, coagulopatias e quaisquer outras condições relevantes. Estou ciente de que a omissão ' +
        'ou falsidade de informações pode comprometer a segurança do procedimento e limitar a responsabilidade ' +
        'da equipe médica.'
      );

      // V. COMPROMISSOS PÓS-PROCEDIMENTO
      writeSection(doc, titleSize, fontSize, pageWidth,
        'V. DOS COMPROMISSOS PÓS-PROCEDIMENTO',
        'Comprometo-me a seguir as orientações médicas pós-procedimento, incluindo:\n' +
        '• Uso de meia elástica compressiva pelo tempo indicado;\n' +
        '• Deambulação precoce (caminhar após o procedimento);\n' +
        '• Evitar exposição solar direta nas áreas tratadas;\n' +
        '• Retornar para consultas de acompanhamento e revisão;\n' +
        '• Comunicar imediatamente qualquer sintoma incomum (dor intensa, inchaço, falta de ar, alterações ' +
        'visuais, entre outros).'
      );

      // VI. CONDUTA EM INTERCORRÊNCIAS
      writeSection(doc, titleSize, fontSize, pageWidth,
        'VI. DA CONDUTA EM CASO DE INTERCORRÊNCIAS',
        'Fui orientado(a) de que, em caso de qualquer evento adverso ou complicação, devo procurar ' +
        'imediatamente a equipe médica responsável ou o serviço de urgência mais próximo. Autorizo a ' +
        'equipe médica a adotar as medidas terapêuticas que julgar necessárias em caso de complicação ' +
        'durante ou após o procedimento.'
      );

      // VII. AUSÊNCIA DE GARANTIA
      writeSection(doc, titleSize, fontSize, pageWidth,
        'VII. DA AUSÊNCIA DE GARANTIA DE RESULTADO',
        'Compreendo que a escleroterapia ecoguiada com espuma é um procedimento médico que apresenta ' +
        'variabilidade de resultados conforme as características individuais de cada paciente. Não há ' +
        'garantia de cura completa, e novas sessões poderão ser necessárias. A resposta terapêutica ' +
        'depende de fatores biológicos individuais.'
      );

      // VIII. AUTORIZAÇÃO DE REGISTRO
      writeSection(doc, titleSize, fontSize, pageWidth,
        'VIII. DA AUTORIZAÇÃO PARA REGISTRO DE IMAGENS',
        'Autorizo o registro de imagens (fotos e/ou vídeos) das áreas tratadas durante o procedimento, ' +
        'para fins exclusivos de documentação clínica e acompanhamento médico. Tais imagens não serão ' +
        'utilizadas para outros fins sem minha autorização expressa por escrito.'
      );

      // IX. REVOGAÇÃO
      writeSection(doc, titleSize, fontSize, pageWidth,
        'IX. DA REVOGAÇÃO DO CONSENTIMENTO',
        'Estou ciente de que posso revogar este consentimento a qualquer momento antes do início do ' +
        'procedimento, sem necessidade de justificativa e sem qualquer penalidade. Caso o procedimento ' +
        'já tenha sido iniciado, a revogação será analisada conforme a viabilidade clínica e os riscos ' +
        'envolvidos na interrupção.'
      );

      // X. DECLARAÇÃO FINAL
      writeSection(doc, titleSize, fontSize, pageWidth,
        'X. DECLARAÇÃO FINAL',
        'Declaro que li (ou me foi lido), compreendi integralmente o conteúdo deste Termo, que todas as ' +
        'minhas dúvidas foram esclarecidas pelo(a) médico(a) responsável, e que consinto, de forma livre, ' +
        'voluntária e esclarecida, com a realização do procedimento de Escleroterapia Ecoguiada com Espuma ' +
        'de Polidocanol.'
      );

      // Referências legais
      doc.moveDown(0.3);
      doc.fontSize(6).fillColor('#888888').font('Helvetica-Oblique');
      doc.text(
        'Fundamentação legal: Resolução CFM nº 2.232/2019; Código de Ética Médica (Arts. 22, 34, 59); ' +
        'Lei 8.078/1990 (CDC); Lei 8.080/1990 (SUS); Lei 13.146/2015 (Estatuto da Pessoa com Deficiência).',
        { align: 'center', lineGap: 1 }
      );

      // ========== ASSINATURAS ==========
      doc.moveDown(0.8);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(BLUE).lineWidth(1).stroke();
      doc.moveDown(0.5);

      // Data e local
      const dataFormatada = formatDateTimeBR(dados.data_hora);
      doc.fontSize(8).fillColor(DARK).font('Helvetica');
      doc.text(`${dados.municipio_nome}/BA, ${dataFormatada}`, { align: 'center' });
      doc.moveDown(0.8);

      // Assinatura do Paciente
      if (dados.assinatura_paciente && dados.assinatura_paciente.startsWith('data:image')) {
        try {
          const base64Data = dados.assinatura_paciente.split(',')[1];
          const imgBuffer = Buffer.from(base64Data, 'base64');
          const imgX = (doc.page.width - 200) / 2;
          doc.image(imgBuffer, imgX, doc.y, { width: 200, height: 50 });
          doc.moveDown(3.5);
        } catch {
          doc.moveDown(2);
          doc.moveTo(doc.page.margins.left + 100, doc.y)
            .lineTo(doc.page.width - doc.page.margins.right - 100, doc.y)
            .strokeColor('#333333').lineWidth(0.5).stroke();
          doc.moveDown(0.2);
        }
      } else {
        doc.moveDown(2);
        doc.moveTo(doc.page.margins.left + 100, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right - 100, doc.y)
          .strokeColor('#333333').lineWidth(0.5).stroke();
        doc.moveDown(0.2);
      }

      doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK);
      doc.text(dados.paciente_nome, { align: 'center' });
      doc.fontSize(7).font('Helvetica').fillColor(GRAY);
      doc.text(`CPF: ${cpfFormatado}`, { align: 'center' });
      doc.text('Paciente / Responsável Legal', { align: 'center' });
      doc.moveDown(0.8);

      // Médico Responsável
      if (dados.medico_nome) {
        doc.moveTo(doc.page.margins.left + 100, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right - 100, doc.y)
          .strokeColor('#333333').lineWidth(0.5).stroke();
        doc.moveDown(0.2);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK);
        doc.text(`Dr(a). ${dados.medico_nome}`, { align: 'center' });
        doc.fontSize(7).font('Helvetica').fillColor(GRAY);
        doc.text(`CRM/BA ${dados.medico_crm || '______'}`, { align: 'center' });
        doc.text('Médico(a) Responsável', { align: 'center' });
      } else {
        doc.moveTo(doc.page.margins.left + 100, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right - 100, doc.y)
          .strokeColor('#333333').lineWidth(0.5).stroke();
        doc.moveDown(0.2);
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#cc0000');
        doc.text('(Assinatura do Médico — a ser preenchida)', { align: 'center' });
        doc.fontSize(7).font('Helvetica').fillColor(GRAY);
        doc.text('Médico(a) Responsável', { align: 'center' });
      }
      doc.moveDown(0.8);

      // Testemunha (Triador)
      doc.moveTo(doc.page.margins.left + 100, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right - 100, doc.y)
        .strokeColor('#333333').lineWidth(0.5).stroke();
      doc.moveDown(0.2);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK);
      doc.text(dados.triador_nome, { align: 'center' });
      doc.fontSize(7).font('Helvetica').fillColor(GRAY);
      if (dados.triador_cpf) {
        doc.text(`CPF: ${maskCPF(dados.triador_cpf)}`, { align: 'center' });
      }
      doc.text('Testemunha / Profissional Responsável pela Triagem', { align: 'center' });

      // ========== RODAPÉ JURÍDICO ==========
      doc.moveDown(0.8);
      doc.moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#dddddd').lineWidth(0.3).stroke();
      doc.moveDown(0.3);

      doc.fontSize(6).fillColor('#999999').font('Helvetica');
      doc.text(
        `Documento gerado eletronicamente pelo sistema Inovamed em ${dataFormatada}. ` +
        `IP de origem: ${dados.ip_address}. ` +
        (dados.hash_integridade ? `Hash de integridade: ${dados.hash_integridade}. ` : '') +
        'Este documento possui validade jurídica nos termos do art. 10 da MP 2.200-2/2001.',
        { align: 'center', lineGap: 1 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ========== Função auxiliar ==========
function writeSection(
  doc: PDFKit.PDFDocument,
  titleSize: number,
  textSize: number,
  pageWidth: number,
  title: string,
  content: string
) {
  doc.fontSize(titleSize).font('Helvetica-Bold').fillColor(BLUE);
  doc.text(title);
  doc.moveDown(0.15);
  doc.fontSize(textSize).font('Helvetica').fillColor(DARK);
  doc.text(content, { align: 'justify', lineGap: 1.5, width: pageWidth });
  doc.moveDown(0.35);
}
