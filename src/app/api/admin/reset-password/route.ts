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
      return NextResponse.json({ error: 'Apenas administradores podem resetar senhas' }, { status: 403 });
    }

    const { user_id, password } = await request.json();
    if (!user_id || !password) {
      return NextResponse.json({ error: 'user_id e password sao obrigatorios' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Update user password via Admin API
    const { error } = await supabase.auth.admin.updateUserById(user_id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
