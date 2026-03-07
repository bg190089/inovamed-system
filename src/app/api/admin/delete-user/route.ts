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
      return NextResponse.json({ error: 'Apenas administradores podem excluir usuarios' }, { status: 403 });
    }

    const { profissional_id, user_id } = await request.json();
    if (!profissional_id || !user_id) {
      return NextResponse.json({ error: 'IDs do profissional e usuario sao obrigatorios' }, { status: 400 });
    }

    // Cannot delete yourself
    if (user_id === authUser.id) {
      return NextResponse.json({ error: 'Voce nao pode excluir sua propria conta' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Check if the profissional has any atendimentos
    const { count: atendimentosCount } = await supabase
      .from('atendimentos')
      .select('id', { count: 'exact', head: true })
      .eq('profissional_id', profissional_id);

    if (atendimentosCount && atendimentosCount > 0) {
      return NextResponse.json({
        error: `Este profissional possui ${atendimentosCount} atendimento(s) registrado(s). Desative o cadastro em vez de excluir.`
      }, { status: 400 });
    }

    // Delete related records first (agendamentos, triagens assigned to this prof, etc.)
    // Delete from profissional_unidades first (FK constraint)
    const { error: puError } = await supabase
      .from('profissional_unidades')
      .delete()
      .eq('profissional_id', profissional_id);

    if (puError) {
      console.error('Error deleting profissional_unidades:', puError);
      return NextResponse.json({ error: `Erro ao limpar vínculos de unidades: ${puError.message}` }, { status: 400 });
    }

    // Delete from profissionais table
    const { error: profError } = await supabase
      .from('profissionais')
      .delete()
      .eq('id', profissional_id);

    if (profError) {
      console.error('Error deleting profissional:', profError);
      return NextResponse.json({ error: `Erro ao excluir profissional: ${profError.message}` }, { status: 400 });
    }

    // Delete the auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(user_id);
    if (authError) {
      console.error('Error deleting auth user:', authError);
      // Profissional already deleted, log the auth error but don't fail
      return NextResponse.json({
        success: true,
        warning: 'Profissional excluido, mas houve erro ao remover o login: ' + authError.message
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete user error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
