import { NextRequest, NextResponse } from 'next/server';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Inovamed <noreply@inovamed.com.br>';

export async function POST(request: NextRequest) {
  try {
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const { email, password, nome_completo } = await request.json();

    if (!email || !password || !nome_completo) {
      return NextResponse.json({ error: 'Email, password, and nome_completo are required' }, { status: 400 });
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
          .credentials { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #1e40af; font-family: monospace; }
          .button { display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px; }
          .warning { background-color: #fef3c7; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 4px solid #f59e0b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Bem-vindo ao Inovamed</h1>
          </div>
          <div class="content">
            <p>Olá <strong>${nome_completo}</strong>,</p>

            <p>Sua conta foi criada com sucesso no sistema Inovamed. Abaixo estão suas credenciais de acesso:</p>

            <div class="credentials">
              <p><strong>E-mail:</strong> ${email}</p>
              <p><strong>Senha provisória:</strong> ${password}</p>
            </div>

            <div class="warning">
              <strong>⚠️ Importante:</strong> Você deverá alterar sua senha na primeira vez que acessar o sistema. Por segurança, não compartilhe sua senha com ninguém.
            </div>

            <p>Clique no botão abaixo para acessar o sistema:</p>

            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://inovamed-system.vercel.app'}/login" class="button">Acessar Sistema</a>

            <p style="margin-top: 30px; font-size: 14px;">
              Se você tiver dúvidas ou problemas ao acessar, entre em contato com o administrador do sistema.
            </p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Inovamed. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: 'Bem-vindo ao Inovamed - Credenciais de Acesso',
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Resend API error:', error);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json({ success: true, message_id: result.id });
  } catch (err: any) {
    console.error('Send welcome email error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
