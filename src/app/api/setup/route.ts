import { createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, nome_completo, cns, crm, setup_key } = body;

    // Use environment variable for setup key
    const validKey = process.env.SETUP_SECRET_KEY;
    if (!validKey || setup_key !== validKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check if admin already exists
    const { count } = await supabase
      .from('profissionais').select('*', { count: 'exact', head: true }).eq('role', 'admin');
    if (count && count > 0) {
      return NextResponse.json({ error: 'Admin ja existe. Endpoint desabilitado.' }, { status: 403 });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

    const { data: empresa } = await supabase
      .from('empresas').select('id').eq('tipo', 'inovamed').single();

    const { error: profError } = await supabase.from('profissionais').insert({
      user_id: authData.user.id,
      nome_completo: nome_completo.toUpperCase(),
      cns: cns || null, crm: crm || null, cbo: '225203',
      role: 'admin', empresa_id: empresa?.id,
    });
    if (profError) return NextResponse.json({ error: profError.message }, { status: 400 });

    return NextResponse.json({
      success: true,
      message: 'Admin criado com sucesso. Faca login com as credenciais informadas.',
      user_id: authData.user.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
