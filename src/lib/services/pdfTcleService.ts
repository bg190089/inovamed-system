// ============================================================
// PDF TCLE Service - Geração do Termo de Consentimento
// Escleroterapia Ecoguiada com Espuma — 1 PÁGINA
// ============================================================

import PDFDocument from 'pdfkit';

interface TcleDadosInput {
  paciente_nome: string;
  paciente_cpf?: string;
  paciente_data_nascimento?: string;
  paciente_sexo?: string;
  paciente_endereco?: string;
  medico_nome?: string;
  medico_crm?: string;
  triador_nome: string;
  triador_cpf?: string;
  unidade_nome: string;
  unidade_cnes?: string;
  municipio_nome: string;
  empresa_nome: string;
  assinatura_paciente?: string;
  ip_address: string;
  data_hora: string;
  hash_integridade?: string;
}

function maskCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function calcIdade(dn: string): number {
  const n = new Date(dn + 'T00:00:00'), h = new Date();
  let i = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) i--;
  return i;
}

function fmtDT(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtDate(ds: string): string {
  if (!ds) return '';
  return new Date(ds + 'T00:00:00').toLocaleDateString('pt-BR');
}

const BLUE = '#1e3a5f';
const DARK = '#1a1a1a';
const GRAY = '#555';

export async function gerarPDFTcle(dados: TcleDadosInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 25, left: 40, right: 40 },
        info: {
          Title: `TCLE - ${dados.paciente_nome}`,
          Author: dados.empresa_nome,
          Creator: 'Inovamed',
          Subject: 'TCLE - Escleroterapia',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pw = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const idade = dados.paciente_data_nascimento ? calcIdade(dados.paciente_data_nascimento) : '';
      const cpfFmt = dados.paciente_cpf ? maskCPF(dados.paciente_cpf) : 'N/I';
      const nascFmt = dados.paciente_data_nascimento ? fmtDate(dados.paciente_data_nascimento) : '';
      const sexo = dados.paciente_sexo === 'F' ? 'Fem' : dados.paciente_sexo === 'M' ? 'Masc' : '';
      const dataFmt = fmtDT(dados.data_hora);

      // ===== CABEÇALHO (compacto) =====
      doc.fontSize(12).fillColor(BLUE).font('Helvetica-Bold');
      doc.text(dados.empresa_nome.toUpperCase(), { align: 'center' });
      doc.fontSize(7).fillColor(GRAY).font('Helvetica');
      doc.text(`${dados.unidade_nome} | CNES: ${dados.unidade_cnes || ''} | ${dados.municipio_nome}`, { align: 'center' });
      doc.moveDown(0.2);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(BLUE).lineWidth(1).stroke();
      doc.moveDown(0.3);

      // ===== TÍTULO =====
      doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold');
      doc.text('TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)', { align: 'center' });
      doc.fontSize(7).fillColor(GRAY).font('Helvetica');
      doc.text('Escleroterapia Ecoguiada com Espuma de Polidocanol', { align: 'center' });
      doc.moveDown(0.3);

      // ===== DADOS PACIENTE + MÉDICO (1 linha cada) =====
      const fs = 7;
      doc.fontSize(fs).fillColor(DARK);
      doc.font('Helvetica-Bold').text('Paciente: ', { continued: true });
      doc.font('Helvetica').text(`${dados.paciente_nome}  |  CPF: ${cpfFmt}  |  Nasc: ${nascFmt} (${idade}a)  |  ${sexo}`, { continued: false });

      doc.font('Helvetica-Bold').text('Médico(a): ', { continued: true });
      if (dados.medico_nome) {
        doc.font('Helvetica').text(`Dr(a). ${dados.medico_nome}${dados.medico_crm ? '  —  CRM/BA ' + dados.medico_crm : ''}`);
      } else {
        doc.font('Helvetica').fillColor('#cc0000').text('(A ser preenchido posteriormente)');
        doc.fillColor(DARK);
      }
      doc.moveDown(0.2);

      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#ccc').lineWidth(0.3).stroke();
      doc.moveDown(0.2);

      // ===== PREÂMBULO =====
      const tf = 6.5;   // corpo do texto
      const th = 7;      // título das seções
      const lg = 0.8;    // lineGap
      const sg = 0.15;   // espaço entre seções

      doc.fontSize(tf).font('Helvetica').fillColor(DARK);
      doc.text(
        'Eu, acima identificado(a), declaro que fui informado(a) de forma clara e compreensível pelo(a) médico(a) ' +
        'responsável e/ou equipe sobre os seguintes aspectos do procedimento de Escleroterapia Ecoguiada com Espuma de Polidocanol:',
        { align: 'justify', lineGap: lg }
      );
      doc.moveDown(sg);

      // I
      sec(doc, th, tf, pw, lg, sg,
        'I. DO PROCEDIMENTO',
        'Consiste na injeção de Polidocanol em microespuma nas veias acometidas por varizes e/ou insuficiência venosa crônica, ' +
        'guiada por ultrassom vascular (Doppler), visando à oclusão dessas veias. Procedimento minimamente invasivo, ambulatorial, sem internação.'
      );

      // II
      sec(doc, th, tf, pw, lg, sg,
        'II. ALTERNATIVAS TERAPÊUTICAS',
        'Existem outras opções: tratamento conservador (meias elásticas, venotônicos), cirurgia convencional (safenectomia), ' +
        'ablação térmica por laser ou radiofrequência. A escolha foi baseada em avaliação clínica individualizada.'
      );

      // III
      sec(doc, th, tf, pw, lg, sg,
        'III. RISCOS E COMPLICAÇÕES',
        'Incluem: dor local, flebite/tromboflebite superficial, hiperpigmentação cutânea, matting, equimoses, reação alérgica, ' +
        'necrose cutânea (rara), trombose venosa profunda (TVP), embolia pulmonar (rara), distúrbios visuais transitórios, ' +
        'cefaleia, AVC (extremamente raro) e outras complicações raras ou imprevisíveis.'
      );

      // III-A
      sec(doc, th, tf, pw, lg, sg,
        'III-A. ALTERAÇÕES ESTÉTICAS',
        'A hiperpigmentação (manchas escuras) é complicação possível e relativamente frequente, podendo ser transitória ou permanente, ' +
        'dependendo de fatores individuais (tipo de pele, genética, cuidados pós-procedimento). O objetivo é terapêutico/funcional, não exclusivamente estético.'
      );

      // IV
      sec(doc, th, tf, pw, lg, sg,
        'IV. INFORMAÇÕES DO PACIENTE',
        'Declaro ter prestado informações verdadeiras e completas sobre meu estado de saúde, medicamentos, alergias, gestação, ' +
        'histórico de trombose, doenças autoimunes e coagulopatias. A omissão pode comprometer a segurança e limitar a responsabilidade médica.'
      );

      // V
      sec(doc, th, tf, pw, lg, sg,
        'V. COMPROMISSOS PÓS-PROCEDIMENTO',
        'Comprometo-me a: usar meia elástica compressiva pelo tempo indicado; deambulação precoce; evitar exposição solar nas áreas tratadas; ' +
        'retornar para acompanhamento; comunicar imediatamente sintomas incomuns (dor intensa, inchaço, falta de ar, alterações visuais).'
      );

      // VI
      sec(doc, th, tf, pw, lg, sg,
        'VI. INTERCORRÊNCIAS',
        'Em caso de evento adverso, devo procurar imediatamente a equipe médica ou urgência mais próxima. Autorizo a equipe a adotar ' +
        'medidas terapêuticas necessárias durante ou após o procedimento.'
      );

      // VII
      sec(doc, th, tf, pw, lg, sg,
        'VII. AUSÊNCIA DE GARANTIA',
        'A escleroterapia apresenta variabilidade de resultados conforme características individuais. Não há garantia de cura completa ' +
        'e novas sessões poderão ser necessárias.'
      );

      // VIII
      sec(doc, th, tf, pw, lg, sg,
        'VIII. REGISTRO DE IMAGENS',
        'Autorizo registro de imagens (fotos/vídeos) das áreas tratadas para documentação clínica exclusivamente. ' +
        'Não serão utilizadas para outros fins sem autorização expressa por escrito.'
      );

      // IX
      sec(doc, th, tf, pw, lg, sg,
        'IX. REVOGAÇÃO',
        'Posso revogar este consentimento a qualquer momento antes do início do procedimento, sem justificativa e sem penalidade.'
      );

      // X
      sec(doc, th, tf, pw, lg, sg,
        'X. DECLARAÇÃO FINAL',
        'Declaro que li (ou me foi lido), compreendi integralmente este Termo, que minhas dúvidas foram esclarecidas, ' +
        'e que consinto de forma livre, voluntária e esclarecida com a realização do procedimento.'
      );

      // Referências legais
      doc.moveDown(0.1);
      doc.fontSize(5.5).fillColor('#999').font('Helvetica-Oblique');
      doc.text(
        'Fundamentação: Res. CFM nº 2.232/2019; CEM Arts. 22, 34, 59; Lei 8.078/1990 (CDC); Lei 8.080/1990 (SUS); Lei 13.146/2015.',
        { align: 'center' }
      );

      // ===== ASSINATURA (só paciente) =====
      doc.moveDown(0.3);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor(BLUE).lineWidth(0.8).stroke();
      doc.moveDown(0.2);

      doc.fontSize(7).fillColor(DARK).font('Helvetica');
      doc.text(`${dados.municipio_nome}/BA, ${dataFmt}`, { align: 'center' });
      doc.moveDown(0.3);

      // Imagem da assinatura do paciente
      if (dados.assinatura_paciente && dados.assinatura_paciente.startsWith('data:image')) {
        try {
          const b64 = dados.assinatura_paciente.split(',')[1];
          const buf = Buffer.from(b64, 'base64');
          const imgX = (doc.page.width - 180) / 2;
          doc.image(buf, imgX, doc.y, { width: 180, height: 40 });
          doc.moveDown(2.8);
        } catch {
          doc.moveDown(1.5);
          doc.moveTo(doc.page.margins.left + 120, doc.y).lineTo(doc.page.width - doc.page.margins.right - 120, doc.y)
            .strokeColor('#333').lineWidth(0.5).stroke();
          doc.moveDown(0.1);
        }
      } else {
        doc.moveDown(1.5);
        doc.moveTo(doc.page.margins.left + 120, doc.y).lineTo(doc.page.width - doc.page.margins.right - 120, doc.y)
          .strokeColor('#333').lineWidth(0.5).stroke();
        doc.moveDown(0.1);
      }

      doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK);
      doc.text(dados.paciente_nome, { align: 'center' });
      doc.fontSize(6).font('Helvetica').fillColor(GRAY);
      doc.text(`CPF: ${cpfFmt}  —  Paciente / Responsável Legal`, { align: 'center' });

      // ===== RODAPÉ JURÍDICO =====
      doc.moveDown(0.3);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#ddd').lineWidth(0.3).stroke();
      doc.moveDown(0.15);

      doc.fontSize(5).fillColor('#aaa').font('Helvetica');
      doc.text(
        `Gerado por Inovamed em ${dataFmt} | IP: ${dados.ip_address}` +
        (dados.hash_integridade ? ` | Hash: ${dados.hash_integridade.slice(0, 16)}...` : '') +
        ' | Validade: art. 10, MP 2.200-2/2001',
        { align: 'center' }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function sec(
  doc: PDFKit.PDFDocument, th: number, tf: number, pw: number, lg: number, sg: number,
  title: string, content: string
) {
  doc.fontSize(th).font('Helvetica-Bold').fillColor(BLUE).text(title);
  doc.moveDown(0.05);
  doc.fontSize(tf).font('Helvetica').fillColor(DARK).text(content, { align: 'justify', lineGap: lg, width: pw });
  doc.moveDown(sg);
}
