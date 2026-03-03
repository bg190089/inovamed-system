import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { formatISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DailyEmailRequest {
  unidade_id: string;
  data?: string; // ISO date string, defaults to today
  email_to?: string; // email address, defaults to current user email
}

interface AtendimentoStats {
  total: number;
  aguardando: number;
  em_atendimento: number;
  finalizado: number;
  cancelado: number;
}

interface ProcedimentoBreakdown {
  unilateral: number;
  bilateral: number;
}

interface ProfissionalCount {
  nome_completo: string;
  total: number;
  unilateral: number;
  bilateral: number;
}

// Helper function to format Brazilian date
function formatBrazilianDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
  return `${dayName}, ${day}/${month}/${year}`;
}

// Helper function to generate HTML email template
function generateEmailHTML(
  unidadeName: string,
  reportDate: string,
  stats: AtendimentoStats,
  procedimentos: ProcedimentoBreakdown,
  profissionais: ProfissionalCount[]
): string {
  const statusPercentages = {
    aguardando: stats.total > 0 ? Math.round((stats.aguardando / stats.total) * 100) : 0,
    em_atendimento: stats.total > 0 ? Math.round((stats.em_atendimento / stats.total) * 100) : 0,
    finalizado: stats.total > 0 ? Math.round((stats.finalizado / stats.total) * 100) : 0,
    cancelado: stats.total > 0 ? Math.round((stats.cancelado / stats.total) * 100) : 0,
  };

  const profissionaisHTML = profissionais
    .map(
      (prof) => `
    <tr style="border-bottom: 1px solid #e0e0e0;">
      <td style="padding: 12px; text-align: left; font-size: 14px;">${prof.nome_completo}</td>
      <td style="padding: 12px; text-align: center; font-size: 14px;">${prof.total}</td>
      <td style="padding: 12px; text-align: center; font-size: 14px;">${prof.unilateral}</td>
      <td style="padding: 12px; text-align: center; font-size: 14px;">${prof.bilateral}</td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório Diário - INOVAMED</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
        sans-serif;
      background-color: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    .container {
      max-width: 900px;
      margin: 20px auto;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      font-size: 28px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .header p {
      font-size: 14px;
      opacity: 0.95;
      margin-bottom: 4px;
    }
    .header .date {
      font-size: 12px;
      opacity: 0.85;
      margin-top: 8px;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      font-size: 18px;
      color: #0066cc;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 2px solid #0066cc;
      font-weight: 600;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .stat-card {
      background-color: #f9f9f9;
      border-left: 4px solid #0066cc;
      padding: 16px;
      border-radius: 4px;
    }
    .stat-card.success {
      border-left-color: #28a745;
    }
    .stat-card.warning {
      border-left-color: #ffc107;
    }
    .stat-card.info {
      border-left-color: #17a2b8;
    }
    .stat-card.danger {
      border-left-color: #dc3545;
    }
    .stat-card-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .stat-card-value {
      font-size: 32px;
      font-weight: 700;
      color: #0066cc;
    }
    .stat-card.success .stat-card-value {
      color: #28a745;
    }
    .stat-card.warning .stat-card-value {
      color: #ffc107;
    }
    .stat-card.info .stat-card-value {
      color: #17a2b8;
    }
    .stat-card.danger .stat-card-value {
      color: #dc3545;
    }
    .stat-card-percent {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
    .two-column {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    @media (max-width: 600px) {
      .two-column {
        grid-template-columns: 1fr;
      }
    }
    .breakdown-item {
      display: flex;
      justify-content: space-between;
      padding: 12px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;
    }
    .breakdown-item:last-child {
      border-bottom: none;
    }
    .breakdown-label {
      color: #666;
      font-weight: 500;
    }
    .breakdown-value {
      color: #0066cc;
      font-weight: 600;
      font-size: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th {
      background-color: #f9f9f9;
      color: #0066cc;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #0066cc;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #e0e0e0;
    }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #999;
    }
    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Relatório Diário</h1>
      <p>INOVAMED - Serviços Médicos</p>
      <p style="margin-top: 16px; font-size: 16px;"><strong>${unidadeName}</strong></p>
      <div class="date">${reportDate}</div>
    </div>

    <div class="content">
      ${
        stats.total === 0
          ? `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>Nenhum atendimento registrado para este dia.</p>
        </div>
      `
          : `
        <!-- Overview Section -->
        <div class="section">
          <h2>Resumo do Dia</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card-label">Total de Atendimentos</div>
              <div class="stat-card-value">${stats.total}</div>
            </div>
            <div class="stat-card success">
              <div class="stat-card-label">Finalizados</div>
              <div class="stat-card-value">${stats.finalizado}</div>
              <div class="stat-card-percent">${statusPercentages.finalizado}% do total</div>
            </div>
            <div class="stat-card warning">
              <div class="stat-card-label">Em Atendimento</div>
              <div class="stat-card-value">${stats.em_atendimento}</div>
              <div class="stat-card-percent">${statusPercentages.em_atendimento}% do total</div>
            </div>
            <div class="stat-card info">
              <div class="stat-card-label">Aguardando</div>
              <div class="stat-card-value">${stats.aguardando}</div>
              <div class="stat-card-percent">${statusPercentages.aguardando}% do total</div>
            </div>
          </div>
        </div>

        <!-- Breakdown Section -->
        <div class="section">
          <h2>Procedimentos por Tipo</h2>
          <div class="two-column">
            <div>
              <div class="breakdown-item">
                <span class="breakdown-label">Unilateral</span>
                <span class="breakdown-value">${procedimentos.unilateral}</span>
              </div>
            </div>
            <div>
              <div class="breakdown-item">
                <span class="breakdown-label">Bilateral</span>
                <span class="breakdown-value">${procedimentos.bilateral}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Professionals Section -->
        ${
          profissionais.length > 0
            ? `
          <div class="section">
            <h2>Profissionais que Atenderam</h2>
            <table>
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Total</th>
                  <th>Unilateral</th>
                  <th>Bilateral</th>
                </tr>
              </thead>
              <tbody>
                ${profissionaisHTML}
              </tbody>
            </table>
          </div>
        `
            : ''
        }
      `
      }
    </div>

    <div class="footer">
      <p>Relatório gerado automaticamente pelo sistema INOVAMED</p>
      <p style="margin-top: 8px; font-size: 11px;">
        Este é um email automático. Não responda direto para este endereço.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

// Main POST handler
export async function POST(request: NextRequest) {
  try {
    const body: DailyEmailRequest = await request.json();
    const { unidade_id, data, email_to } = body;

    if (!unidade_id) {
      return NextResponse.json({ error: 'unidade_id é obrigatório' }, { status: 400 });
    }

    // Get authenticated user
    const supabase = createServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Determine report date (default to today)
    const reportDate = data ? new Date(data) : new Date();
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get unidade information
    const { data: unidadeData, error: unidadeError } = await supabase
      .from('unidades')
      .select('nome')
      .eq('id', unidade_id)
      .single();

    if (unidadeError || !unidadeData) {
      return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 });
    }

    // Get total atendimentos by status
    const { data: statusData, error: statusError } = await supabase
      .from('atendimentos')
      .select('status')
      .eq('unidade_id', unidade_id)
      .gte('data_atendimento', reportDate.toISOString().split('T')[0])
      .lt('data_atendimento', nextDay.toISOString().split('T')[0]);

    if (statusError) throw statusError;

    const stats: AtendimentoStats = {
      total: statusData?.length || 0,
      aguardando: statusData?.filter((a) => a.status === 'aguardando').length || 0,
      em_atendimento: statusData?.filter((a) => a.status === 'em_atendimento').length || 0,
      finalizado: statusData?.filter((a) => a.status === 'finalizado').length || 0,
      cancelado: statusData?.filter((a) => a.status === 'cancelado').length || 0,
    };

    // Get procedure breakdown
    const { data: procData, error: procError } = await supabase
      .from('atendimentos')
      .select('procedimentos(tipo)')
      .eq('unidade_id', unidade_id)
      .gte('data_atendimento', reportDate.toISOString().split('T')[0])
      .lt('data_atendimento', nextDay.toISOString().split('T')[0]);

    if (procError) throw procError;

    const procedimentos: ProcedimentoBreakdown = {
      unilateral: procData?.filter((a: any) => a.procedimentos?.tipo === 'unilateral').length || 0,
      bilateral: procData?.filter((a: any) => a.procedimentos?.tipo === 'bilateral').length || 0,
    };

    // Get professionals who worked that day with their counts
    const { data: profData, error: profError } = await supabase
      .from('atendimentos')
      .select('profissionais(nome_completo), procedimentos(tipo)')
      .eq('unidade_id', unidade_id)
      .gte('data_atendimento', reportDate.toISOString().split('T')[0])
      .lt('data_atendimento', nextDay.toISOString().split('T')[0]);

    if (profError) throw profError;

    // Process professionals data
    const profMap = new Map<string, { total: number; unilateral: number; bilateral: number }>();
    profData?.forEach((att: any) => {
      if (att.profissionais?.nome_completo) {
        const nome = att.profissionais.nome_completo;
        if (!profMap.has(nome)) {
          profMap.set(nome, { total: 0, unilateral: 0, bilateral: 0 });
        }
        const prof = profMap.get(nome)!;
        prof.total++;
        if (att.procedimentos?.tipo === 'unilateral') prof.unilateral++;
        if (att.procedimentos?.tipo === 'bilateral') prof.bilateral++;
      }
    });

    const profissionais: ProfissionalCount[] = Array.from(profMap.entries())
      .map(([nome_completo, counts]) => ({
        nome_completo,
        ...counts,
      }))
      .sort((a, b) => b.total - a.total);

    // Get email recipient
    let recipientEmail = email_to;
    if (!recipientEmail) {
      // Try to get from current user
      const { data: profissionalData } = await supabase
        .from('profissionais')
        .select('id')
        .eq('user_id', authData.user.id)
        .single();

      recipientEmail = authData.user.email || process.env.ADMIN_EMAIL;
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'Não foi possível determinar o email do destinatário' },
        { status: 400 }
      );
    }

    // Generate HTML email
    const formattedDate = formatBrazilianDate(reportDate);
    const emailHTML = generateEmailHTML(
      unidadeData.nome,
      formattedDate,
      stats,
      procedimentos,
      profissionais
    );

    // Send email via Resend API
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY não configurada' },
        { status: 500 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@inovamed.com';

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipientEmail,
        subject: `Relatório Diário - ${unidadeData.nome} - ${formattedDate.split(', ')[1]}`,
        html: emailHTML,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Resend API error:', errorData);
      return NextResponse.json(
        { error: 'Erro ao enviar email', details: errorData },
        { status: 500 }
      );
    }

    const resendData = await emailResponse.json();

    return NextResponse.json({
      success: true,
      message: 'Relatório enviado com sucesso',
      email_id: resendData.id,
      to: recipientEmail,
      stats,
      procedimentos,
      profissionais_count: profissionais.length,
    });
  } catch (err: any) {
    console.error('Daily email report error:', err);
    return NextResponse.json(
      { error: err.message || 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
