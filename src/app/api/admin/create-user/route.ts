import { createServiceClient, createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Verify caller is authenticated admin
    const authSupabase = createServerSupabase();
    const { data: { user: authUser } } = await authSupabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

    const { data: caller } = await authSupabase
      .from('profissionais').select('role').eq('user_id', authUser.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem criar usuarios' }, { status: 403 });
    }

    const { email, password, nome_completo, cns, cpf, cbo, crm, role } = await request.json();
    if (!email || !password || !nome_completo) {
      return NextResponse.json({ error: 'Email, senha e nome sao obrigatorios' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Create auth user via Admin API (does not affect caller's session)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

    const { data: empresas } = await supabase.from('empresas').select('id').limit(1);
    const empresaId = empresas?.[0]?.id;

    const { error: profError } = await supabase.from('profissionais').insert({
      user_id: authData.user.id,
      nome_completo: nome_completo.toUpperCase(),
      cns: cns || null, cpf: cpf || null, cbo: cbo || '225203',
      crm: crm || null, role: role || 'medico', empresa_id: empresaId,
    });
    if (profError) return NextResponse.json({ error: profError.message }, { status: 400 });

    return NextResponse.json({ success: true, user_id: authData.user.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
