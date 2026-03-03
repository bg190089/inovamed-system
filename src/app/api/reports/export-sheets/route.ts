import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface ExportSheetsRequest {
  competencia: string; // AAAAMM format
  unidade_id: string;
  spreadsheet_id?: string;
}

// Helper function to get Google Sheets API token via service account
async function getGoogleSheetsAuth(serviceAccountEmail: string, privateKey: string) {
  try {
    // Create JWT for service account authentication
    const now = Math.floor(Date.now() / 1000);
    const expirationTime = now + 3600; // 1 hour

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const claimsSet = {
      iss: serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: expirationTime,
      iat: now,
    };

    // Base64 encoding helper
    const base64Encode = (obj: any) => {
      return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const encodedHeader = base64Encode(header);
    const encodedClaims = base64Encode(claimsSet);

    // Sign with private key
    const crypto = require('crypto');
    const sign = crypto.createSign('SHA256');
    sign.update(`${encodedHeader}.${encodedClaims}`);
    const signature = sign.sign(privateKey, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const jwt = `${encodedHeader}.${encodedClaims}.${signature}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Google Sheets API token');
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  } catch (err) {
    console.error('Google authentication error:', err);
    throw err;
  }
}

// Helper function to convert data array to sheet values format
function convertToSheetValues(data: any[], headers: string[]): any[][] {
  const rows: any[][] = [headers];

  for (const item of data) {
    const row: any[] = [];
    for (const header of headers) {
      // Handle nested object access (e.g., "pacientes.nome_completo")
      const value = header.split('.').reduce((obj: any, key: string) => obj?.[key], item);
      row.push(value || '');
    }
    rows.push(row);
  }

  return rows;
}

// Main POST handler
export async function POST(request: NextRequest) {
  try {
    const body: ExportSheetsRequest = await request.json();
    const { competencia, unidade_id, spreadsheet_id } = body;

    if (!competencia || !unidade_id) {
      return NextResponse.json(
        { error: 'competencia e unidade_id são obrigatórios' },
        { status: 400 }
      );
    }

    // Validate competencia format (AAAAMM)
    if (!/^\d{6}$/.test(competencia)) {
      return NextResponse.json(
        { error: 'Formato de competencia inválido. Use AAAAMM' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = createServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Get BPA data via RPC function
    const { data: bpaData, error: bpaError } = await supabase.rpc('gerar_bpa_individual', {
      p_competencia: competencia,
      p_unidade_id: unidade_id,
    });

    if (bpaError) throw bpaError;

    if (!bpaData || bpaData.length === 0) {
      return NextResponse.json(
        { error: 'Sem dados BPA-I para esta competência e unidade', data: [] },
        { status: 404 }
      );
    }

    // Get unidade name for sheet tab naming
    const { data: unidadeData, error: unidadeError } = await supabase
      .from('unidades')
      .select('nome')
      .eq('id', unidade_id)
      .single();

    if (unidadeError) {
      throw unidadeError;
    }

    // Check if Google Sheets credentials are configured
    const GOOGLE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY;
    const SPREADSHEET_ID = spreadsheet_id || process.env.GOOGLE_SPREADSHEET_ID;

    // If Google credentials aren't configured, return data as JSON
    if (!GOOGLE_EMAIL || !GOOGLE_KEY) {
      console.warn('Google Sheets credentials not configured. Returning data for manual export.');
      return NextResponse.json(
        {
          success: true,
          message:
            'Google Sheets não configurado. Retornando dados para exportação manual.',
          data: bpaData,
          total_records: bpaData.length,
          sheet_name: `BPA_${competencia}_${unidadeData.nome.substring(0, 20)}`,
          headers: [
            'cnes',
            'competencia',
            'cns_profissional',
            'cbo',
            'data_atendimento',
            'numero_folha',
            'numero_sequencial',
            'procedimento',
            'paciente_nome',
            'paciente_cpf',
            'paciente_cns',
            'paciente_sexo',
            'paciente_municipio',
            'paciente_nascimento',
            'cid',
            'carater',
            'quantidade',
          ],
        },
        { status: 200 }
      );
    }

    // Proceed with Google Sheets integration
    if (!SPREADSHEET_ID) {
      return NextResponse.json(
        {
          error: 'GOOGLE_SPREADSHEET_ID não configurado',
          data: bpaData,
          message: 'Spreadsheet ID é necessário para exportação automática',
        },
        { status: 400 }
      );
    }

    // Get Google Sheets API token
    const accessToken = await getGoogleSheetsAuth(GOOGLE_EMAIL, GOOGLE_KEY);

    // Prepare sheet tab name
    const sheetTabName = `BPA_${competencia}_${unidadeData.nome.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Prepare data for sheet
    const headers = [
      'cnes',
      'competencia',
      'cns_profissional',
      'cbo',
      'data_atendimento',
      'numero_folha',
      'numero_sequencial',
      'procedimento',
      'paciente_nome',
      'paciente_cpf',
      'paciente_cns',
      'paciente_sexo',
      'paciente_municipio',
      'paciente_nascimento',
      'cid',
      'carater',
      'quantidade',
    ];

    const sheetValues = convertToSheetValues(bpaData, headers);

    // Step 1: Create a new sheet tab
    const createSheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetTabName,
                },
              },
            },
          ],
        }),
      }
    );

    if (!createSheetResponse.ok) {
      const errorData = await createSheetResponse.json();
      // If sheet already exists, get its ID
      if (errorData.error?.message?.includes('already exists')) {
        // Continue to overwrite the existing sheet
      } else {
        throw new Error(`Failed to create sheet: ${JSON.stringify(errorData)}`);
      }
    }

    const createSheetData = await createSheetResponse.json();
    const sheetId = createSheetData.replies?.[0]?.addSheet?.properties?.sheetId || 0;

    // Step 2: Write data to the sheet
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetTabName)}!A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          values: sheetValues,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(`Failed to write data to sheet: ${JSON.stringify(errorData)}`);
    }

    const updateData = await updateResponse.json();

    // Step 3: Format the sheet (optional - add borders, headers, etc.)
    const formatResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheetId,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        }),
      }
    );

    if (!formatResponse.ok) {
      console.warn('Failed to format sheet, but data was written successfully');
    }

    return NextResponse.json({
      success: true,
      message: 'Dados exportados para Google Sheets com sucesso',
      spreadsheet_id: SPREADSHEET_ID,
      sheet_name: sheetTabName,
      total_records: bpaData.length,
      rows_written: sheetValues.length,
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
    });
  } catch (err: any) {
    console.error('Export sheets error:', err);
    return NextResponse.json(
      { error: err.message || 'Erro ao exportar para Google Sheets' },
      { status: 500 }
    );
  }
}
