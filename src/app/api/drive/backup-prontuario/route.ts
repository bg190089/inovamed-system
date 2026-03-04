// ============================================================
// API Route: POST /api/drive/backup-prontuario
// Gera PDF do prontuário e faz upload ao Google Drive
// Chamado de forma assíncrona após finalização do atendimento
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { gerarPDFProntuario } from '@/lib/services/pdfProntuarioService';
import {
  getGoogleDriveToken,
  ensureFolderPath,
  uploadFileToDrive,
} from '@/lib/services/googleDriveService';

// Relações carregadas no SELECT do atendimento
const ATENDIMENTO_SELECT = `
  *,
  paciente:pacientes(*),
  profissional:profissionais(id, nome_completo, crm, cbo, cns, cns_profissional, assinatura_digital),
  procedimento:procedimentos(id, codigo_sus, descricao, tipo),
  unidade:unidades(id, nome, cnes, municipio:municipios(id, nome))
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { atendimentoId } = body;

    if (!atendimentoId) {
      return NextResponse.json(
        { success: false, error: 'atendimentoId é obrigatório' },
        { status: 400 }
      );
    }

    // ---------- 1. Verificar credenciais Google ----------
    const token = await getGoogleDriveToken();
    if (!token) {
      // Sem credenciais → retorna silenciosamente (feature desabilitada)
      return NextResponse.json({
        success: false,
        error: 'Google Drive não configurado',
        skipped: true,
      });
    }

    // ---------- 2. Autenticação do usuário ----------
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // ---------- 3. Buscar atendimento completo ----------
    const { data: atendimento, error: atendError } = await supabase
      .from('atendimentos')
      .select(ATENDIMENTO_SELECT)
      .eq('id', atendimentoId)
      .single();

    if (atendError || !atendimento) {
      console.error('[DriveBackup] Atendimento não encontrado:', atendError?.message);
      return NextResponse.json(
        { success: false, error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }

    // ---------- 4. Gerar PDF ----------
    console.log(`[DriveBackup] Gerando PDF para atendimento ${atendimentoId}...`);
    const pdfBuffer = await gerarPDFProntuario(atendimento);

    // ---------- 5. Montar estrutura de pastas ----------
    // Inovamed > Prontuarios > 2026-03 > Conceicao do Coite
    const dataAtend = atendimento.data_atendimento || new Date().toISOString().slice(0, 10);
    const anoMes = dataAtend.slice(0, 7); // YYYY-MM
    const municipioNome = atendimento.unidade?.municipio?.nome || 'Sem_Municipio';
    // Remover acentos e caracteres especiais do nome do município
    const municipioClean = municipioNome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim();

    const folderPath = ['Inovamed', 'Prontuarios', anoMes, municipioClean];

    console.log(`[DriveBackup] Criando pastas: ${folderPath.join(' > ')}`);
    const folderId = await ensureFolderPath(token, folderPath);

    // ---------- 6. Nome do arquivo ----------
    const pacienteNome = (atendimento.paciente?.nome_completo || 'PACIENTE')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .trim();
    const ficha = String(atendimento.numero_ficha || '000').padStart(3, '0');
    const dataCompacta = dataAtend.replace(/-/g, '');
    const filename = `${pacienteNome}_${ficha}_${dataCompacta}.pdf`;

    // ---------- 7. Upload ----------
    console.log(`[DriveBackup] Upload: ${filename} → pasta ${municipioClean}`);
    const { fileId, webViewLink } = await uploadFileToDrive(
      token,
      folderId,
      filename,
      pdfBuffer
    );

    // ---------- 8. Salvar link no atendimento ----------
    const { error: updateError } = await supabase
      .from('atendimentos')
      .update({ drive_url: webViewLink })
      .eq('id', atendimentoId);

    if (updateError) {
      console.warn('[DriveBackup] Falha ao salvar drive_url:', updateError.message);
      // Não é crítico - o upload já foi feito
    }

    console.log(`[DriveBackup] Sucesso! File ID: ${fileId}`);

    return NextResponse.json({
      success: true,
      drive_url: webViewLink,
      file_id: fileId,
      filename,
    });
  } catch (error: any) {
    console.error('[DriveBackup] Erro:', error.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno no backup' },
      { status: 500 }
    );
  }
}
