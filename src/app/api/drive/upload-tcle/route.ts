// ============================================================
// API Route: POST /api/drive/upload-tcle
// Gera PDF do TCLE assinado e faz upload ao Google Drive
// Chamado após assinatura do paciente na triagem
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { gerarPDFTcle } from '@/lib/services/pdfTcleService';
import {
  getGoogleDriveToken,
  ensureFolderPath,
  uploadFileToDrive,
} from '@/lib/services/googleDriveService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      paciente_nome,
      paciente_cpf,
      paciente_data_nascimento,
      paciente_sexo,
      paciente_endereco,
      medico_nome,
      medico_crm,
      triador_nome,
      triador_cpf,
      unidade_nome,
      unidade_cnes,
      municipio_nome,
      empresa_nome,
      assinatura_paciente,
      ip_address,
    } = body;

    if (!paciente_nome || !triador_nome) {
      return NextResponse.json(
        { success: false, error: 'Dados do paciente e triador são obrigatórios' },
        { status: 400 }
      );
    }

    // ---------- 1. Autenticação ----------
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // ---------- 2. Data/hora e hash ----------
    const dataHora = new Date().toISOString();

    // Hash de integridade: SHA-256 dos dados principais
    const encoder = new TextEncoder();
    const hashData = encoder.encode(
      `${paciente_nome}|${paciente_cpf || ''}|${triador_nome}|${dataHora}|${ip_address || ''}`
    );
    const hashBuffer = await crypto.subtle.digest('SHA-256', hashData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // ---------- 3. Gerar PDF ----------
    console.log(`[TCLE] Gerando PDF para paciente ${paciente_nome}...`);
    const pdfBuffer = await gerarPDFTcle({
      paciente_nome,
      paciente_cpf,
      paciente_data_nascimento,
      paciente_sexo,
      paciente_endereco,
      medico_nome,
      medico_crm,
      triador_nome,
      triador_cpf,
      unidade_nome: unidade_nome || '',
      unidade_cnes,
      municipio_nome: municipio_nome || '',
      empresa_nome: empresa_nome || 'INOVAMED',
      assinatura_paciente,
      ip_address: ip_address || 'Não capturado',
      data_hora: dataHora,
      hash_integridade: hashHex,
    });

    // ---------- 4. Google Drive ----------
    const token = await getGoogleDriveToken();
    if (!token) {
      console.warn('[TCLE] Google Drive não configurado. Upload ignorado.');
      return NextResponse.json({
        success: false,
        error: 'Google Drive não configurado.',
      }, { status: 503 });
    }

    // ---------- 5. Nomes de pasta e arquivo ----------
    // Estrutura: TCLEs > 2026-03 > Conceicao_do_Coite > NOME_PACIENTE_20260304.pdf
    const anoMes = dataHora.slice(0, 7); // YYYY-MM
    const municipioClean = (municipio_nome || 'Sem_Municipio')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, '_')
      .trim();

    const pacienteClean = paciente_nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .trim();

    const dataCompacta = dataHora.slice(0, 10).replace(/-/g, '');
    const filename = `TCLE_${pacienteClean}_${dataCompacta}.pdf`;

    // ---------- 6. Criar pastas ----------
    console.log(`[TCLE] Criando pastas: TCLEs > ${anoMes} > ${municipioClean}`);
    const folderId = await ensureFolderPath(token, ['TCLEs', anoMes, municipioClean]);

    // ---------- 7. Upload ----------
    console.log(`[TCLE] Upload: ${filename}`);
    const { webViewLink } = await uploadFileToDrive(
      token,
      folderId,
      filename,
      pdfBuffer
    );

    console.log(`[TCLE] Sucesso! ${filename} → ${webViewLink}`);

    return NextResponse.json({
      success: true,
      drive_url: webViewLink,
      filename,
      hash: hashHex,
      data_hora: dataHora,
    });
  } catch (error: any) {
    console.error('[TCLE] Erro:', error.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno no upload do TCLE' },
      { status: 500 }
    );
  }
}
