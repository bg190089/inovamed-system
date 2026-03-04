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
  profissional:profissionais(id, nome_completo, crm, cbo, cns, assinatura_digital),
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

    // ---------- 1. Autenticação do usuário ----------
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // ---------- 2. Buscar atendimento completo ----------
    const { data: atendimento, error: atendError } = await supabase
      .from('atendimentos')
      .select(ATENDIMENTO_SELECT)
      .eq('id', atendimentoId)
      .single();

    if (atendError || !atendimento) {
      console.error('[Backup] Atendimento não encontrado:', atendError?.message);
      return NextResponse.json(
        { success: false, error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }

    // ---------- 3. Gerar PDF ----------
    console.log(`[Backup] Gerando PDF para atendimento ${atendimentoId}...`);
    const pdfBuffer = await gerarPDFProntuario(atendimento);

    // ---------- 4. Obter token Google Drive ----------
    const token = await getGoogleDriveToken();
    if (!token) {
      console.warn('[Backup] Google Drive não configurado. Backup ignorado.');
      return NextResponse.json({
        success: false,
        error: 'Google Drive não configurado. Verifique as variáveis de ambiente.',
      }, { status: 503 });
    }

    // ---------- 5. Montar nomes de pasta e arquivo ----------
    // Estrutura: Prontuarios > 2026-03 > Conceicao_do_Coite > NOME_PACIENTE_001_20260303.pdf
    const dataAtend = atendimento.data_atendimento || new Date().toISOString().slice(0, 10);
    const anoMes = dataAtend.slice(0, 7); // YYYY-MM
    const municipioNome = atendimento.unidade?.municipio?.nome || 'Sem_Municipio';
    const municipioClean = municipioNome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, '_')
      .trim();

    const pacienteNome = (atendimento.paciente?.nome_completo || 'PACIENTE')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .trim();
    const ficha = String(atendimento.numero_ficha || '000').padStart(3, '0');
    const dataCompacta = dataAtend.replace(/-/g, '');
    const filename = `${pacienteNome}_${ficha}_${dataCompacta}.pdf`;

    // ---------- 6. Criar estrutura de pastas no Drive ----------
    console.log(`[Backup] Criando pastas: Prontuarios > ${anoMes} > ${municipioClean}`);
    const folderId = await ensureFolderPath(token, ['Prontuarios', anoMes, municipioClean]);

    // ---------- 7. Upload do PDF ----------
    console.log(`[Backup] Upload: ${filename}`);
    const { webViewLink } = await uploadFileToDrive(
      token,
      folderId,
      filename,
      pdfBuffer
    );

    // ---------- 8. Salvar URL no atendimento ----------
    const { error: updateError } = await supabase
      .from('atendimentos')
      .update({ drive_url: webViewLink })
      .eq('id', atendimentoId);

    if (updateError) {
      console.warn('[Backup] Falha ao salvar URL:', updateError.message);
    }

    console.log(`[Backup] Sucesso! ${filename} → ${webViewLink}`);

    return NextResponse.json({
      success: true,
      drive_url: webViewLink,
      filename,
    });
  } catch (error: any) {
    console.error('[Backup] Erro:', error.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno no backup' },
      { status: 500 }
    );
  }
}
