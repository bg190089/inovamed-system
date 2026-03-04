import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Configure Gmail transporter with OAuth2 (credentials from environment variables)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.GMAIL_USER || '',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },
});

export async function POST(request: NextRequest) {
  try {
    const { email, password, nome_completo } = await request.json();

    if (!email || !password || !nome_completo) {
      return NextResponse.json(
        { error: 'Email, senha e nome sao obrigatorios' },
        { status: 400 }
      );
    }

    // HTML email template
    const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 40px 30px; }
    .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
    .credentials-box { background: #f9f9f9; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .credential-row { margin-bottom: 15px; }
    .credential-label { font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .credential-value { font-family: 'Courier New', monospace; font-size: 14px; background: white; padding: 10px; border-radius: 4px; word-break: break-all; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 12px; border-radius: 4px; font-size: 13px; margin: 20px 0; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; margin-top: 20px; font-weight: 600; }
    .footer { background: #f9f9f9; padding: 20px 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Bem-vindo ao Inovamed</h1>
      <p>Sistema de Escleroterapia</p>
    </div>

    <div class="content">
      <div class="greeting">
        <p>Olá <strong>${nome_completo}</strong>,</p>
        <p>Sua conta foi criada com sucesso no sistema Inovamed. Abaixo estão seus dados de acesso:</p>
      </div>

      <div class="credentials-box">
        <div class="credential-row">
          <div class="credential-label">E-mail de Acesso</div>
          <div class="credential-value">${email}</div>
        </div>
        <div class="credential-row">
          <div class="credential-label">Senha Temporaria</div>
          <div class="credential-value">${password}</div>
        </div>
      </div>

      <div class="warning">
        <strong>Importante:</strong> Por favor, altere sua senha na primeira vez que acessar o sistema. Esta senha é temporaria e foi gerada apenas para seu primeiro acesso.
      </div>

      <a href="https://inovamed-system.vercel.app/login" class="button">Acessar o Sistema</a>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #666;">
        <p style="margin: 0 0 10px 0;"><strong>Duvidas?</strong> Nao hesite em contatar o suporte.</p>
        <p style="margin: 0;">O Inovamed foi desenvolvido com foco em seguranca e conformidade com a LGPD.</p>
      </div>
    </div>

    <div class="footer">
      <p style="margin: 0;">Inovamed &copy; ${new Date().getFullYear()} &mdash; Todos os direitos reservados</p>
      <p style="margin: 5px 0 0 0;"><a href="#">Politica de Privacidade</a> | <a href="#">Termos de Uso</a></p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email
    await transporter.sendMail({
      from: process.env.GMAIL_USER || 'noreply@inovamed.com.br',
      to: email,
      subject: 'Bem-vindo ao Inovamed - Seus dados de acesso',
      html: htmlContent,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Email sending error:', err);
    return NextResponse.json(
      { error: err.message || 'Erro ao enviar email' },
      { status: 500 }
    );
  }
}
