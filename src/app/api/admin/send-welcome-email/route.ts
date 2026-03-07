import { NextRequest, NextResponse } from 'next/server';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Inovamed <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inovamed-system.vercel.app';

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

    const firstName = nome_completo.split(' ')[0];
    const currentYear = new Date().getFullYear();

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao Inovamed</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f0f4f8;color:#1a202c;line-height:1.7;-webkit-font-smoothing:antialiased;">

  <div style="max-width:620px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0e7490 0%,#0891b2 50%,#06b6d4 100%);padding:40px 40px 35px;text-align:center;">
        <div style="width:70px;height:70px;background:rgba(255,255,255,0.2);border-radius:50%;display:inline-block;line-height:70px;margin-bottom:16px;">
          <span style="font-size:32px;">🩺</span>
        </div>
        <h1 style="color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;margin:0 0 6px 0;">Inovamed</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;font-weight:400;margin:0;">Sistema de Escleroterapia</p>
      </div>
      <!-- Body -->
      <div style="padding:36px 40px 40px;">
        <p style="font-size:18px;font-weight:600;color:#1a202c;margin:0 0 12px 0;">Olá, ${firstName}! 👋</p>
        <p style="font-size:15px;color:#4a5568;margin:0 0 28px 0;">
          Sua conta no <strong>Inovamed</strong> foi criada com sucesso.
          Abaixo estão suas credenciais de acesso ao sistema.
        </p>

        <!-- Credentials Box -->
        <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px 28px;margin-bottom:24px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#718096;margin-bottom:4px;">Seu e-mail de acesso</div>
          <div style="font-size:16px;font-weight:600;color:#1a202c;margin-bottom:16px;word-break:break-all;">${email}</div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#718096;margin-bottom:4px;">Sua senha provisória</div>
          <div style="font-size:16px;font-weight:600;color:#1a202c;">
            <span style="font-family:'Courier New',monospace;background:#edf2f7;padding:8px 14px;border-radius:8px;display:inline-block;font-size:15px;letter-spacing:1px;color:#2d3748;">${password}</span>
          </div>
        </div>

        <!-- Warning -->
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px;">
          <p style="font-size:14px;color:#92400e;font-weight:500;margin:0;">
            🔒 Por segurança, você deverá <strong>alterar sua senha</strong>
            no primeiro acesso ao sistema. A senha provisória acima será
            válida apenas para o login inicial.
          </p>
        </div>
        <!-- Steps -->
        <div style="margin:28px 0;">
          <p style="font-size:15px;font-weight:600;color:#1a202c;margin:0 0 16px 0;">Como acessar:</p>
          <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
            <span style="width:28px;height:28px;background:#e0f2fe;color:#0e7490;border-radius:50%;display:inline-block;text-align:center;line-height:28px;font-size:13px;font-weight:700;flex-shrink:0;">1</span>
            <span style="font-size:14px;color:#4a5568;padding-top:3px;">Clique no botão abaixo para abrir o sistema</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
            <span style="width:28px;height:28px;background:#e0f2fe;color:#0e7490;border-radius:50%;display:inline-block;text-align:center;line-height:28px;font-size:13px;font-weight:700;flex-shrink:0;">2</span>
            <span style="font-size:14px;color:#4a5568;padding-top:3px;">Faça login com o e-mail e a senha provisória acima</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
            <span style="width:28px;height:28px;background:#e0f2fe;color:#0e7490;border-radius:50%;display:inline-block;text-align:center;line-height:28px;font-size:13px;font-weight:700;flex-shrink:0;">3</span>
            <span style="font-size:14px;color:#4a5568;padding-top:3px;">Crie uma nova senha segura quando solicitado</span>
          </div>
        </div>

        <!-- CTA Button -->
        <div style="text-align:center;margin:32px 0;">
          <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#0e7490,#0891b2);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.3px;">
            Acessar o Inovamed &rarr;
          </a>
        </div>

        <div style="height:1px;background:#e2e8f0;margin:28px 0;"></div>

        <p style="font-size:13px;color:#718096;text-align:center;margin:0;">
          Precisa de ajuda? Entre em contato com o administrador do sistema.
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#f7fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
        <p style="font-size:12px;color:#a0aec0;line-height:1.6;margin:0;">
          <span style="font-weight:600;color:#718096;">Inovamed</span> &mdash; Sistema de Escleroterapia<br>
          &copy; ${currentYear} Inovamed. Todos os direitos reservados.<br>
          Este é um e-mail automático, por favor não responda diretamente.
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: 'Bem-vindo ao Inovamed \u2013 Suas Credenciais de Acesso',
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
