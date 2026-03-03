import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/export-sheets - Export production data to Google Sheets
// This uses Google Sheets API - requires service account credentials
export async function POST(request: NextRequest) {
  try {
    const { competencia, unidade_id, municipio_nome } = await request.json();
    const supabase = createServerSupabase();

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Get BPA data
    const { data: bpaData, error } = await supabase.rpc('gerar_bpa_individual', {
      p_competencia: competencia,
      p_unidade_id: unidade_id,
    });

    if (error) throw error;
    if (!bpaData?.length) {
      return NextResponse.json({ error: 'Sem dados para exportar' }, { status: 404 });
    }

    // Google Sheets integration
    const GOOGLE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY;
    const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

    if (!GOOGLE_EMAIL || !GOOGLE_KEY || !SPREADSHEET_ID) {
      return NextResponse.json({
        error: 'Google Sheets não configurado. Configure as variáveis de ambiente.',
        data: bpaData,
        message: 'Dados gerados com sucesso. Configure o Google Sheets para exportar automaticamente.'
      }, { status: 200 });
    }

    // TODO: Implement Google Sheets API write
    // For now, return the data for manual export
    // When implementing, use googleapis npm package:
    // const { google } = require('googleapis');
    // const auth = new google.auth.JWT(GOOGLE_EMAIL, null, GOOGLE_KEY, ['https://www.googleapis.com/auth/spreadsheets']);
    // const sheets = google.sheets({ version: 'v4', auth });
    // Create sheet tab with municipio name + date
    // Write headers and data

    return NextResponse.json({
      success: true,
      total: bpaData.length,
      data: bpaData,
      sheet_name: `${municipio_nome}_${competencia}`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
