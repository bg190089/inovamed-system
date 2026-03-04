// ============================================================
// API Route: POST /api/drive/backup-prontuario
// Gera PDF do prontuário e faz upload ao Supabase Storage
// Chamado de forma assíncrona após finalização do atendimento
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { gerarPDFProntuario } from '@/lib/services/pdfProntuarioService';

const BUCKET = 'prontuarios';

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

    // ---------- 4. Montar caminho do arquivo ----------
    // prontuarios/2026-03/Conceicao_do_Coite/NOME_PACIENTE_001_20260303.pdf
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

    const storagePath = `${anoMes}/${municipioClean}/${filename}`;

    // ---------- 5. Upload para Supabase Storage ----------
    // Usar service_role para bypass de RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    console.log(`[Backup] Upload: ${storagePath}`);
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[Backup] Erro no upload:', uploadError.message);
      return NextResponse.json(
        { success: false, error: `Upload falhou: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // ---------- 6. Gerar URL pública ----------
    const { data: publicUrlData } = adminClient.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl || '';

    // ---------- 7. Salvar URL no atendimento ----------
    const { error: updateError } = await supabase
      .from('atendimentos')
      .update({ drive_url: publicUrl })
      .eq('id', atendimentoId);

    if (updateError) {
      console.warn('[Backup] Falha ao salvar URL:', updateError.message);
    }

    console.log(`[Backup] Sucesso! ${storagePath}`);

    return NextResponse.json({
      success: true,
      drive_url: publicUrl,
      filename,
      path: storagePath,
    });
  } catch (error: any) {
    console.error('[Backup] Erro:', error.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno no backup' },
      { status: 500 }
    );
  }
}
