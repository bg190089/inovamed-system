import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Route -> allowed roles mapping
const ROUTE_ROLES: Record<string, string[]> = {
  '/admin': ['admin'],
  '/relatorios': ['admin', 'gestor'],
  '/dashboard': ['admin', 'gestor', 'medico', 'recepcionista'],
  '/recepcao': ['admin', 'gestor', 'recepcionista'],
  '/consultorio': ['admin', 'gestor', 'medico'],
  '/agendamento': ['admin', 'gestor', 'recepcionista', 'medico'],
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const publicPaths = ['/login', '/assinatura', '/api/setup'];
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  if (user && !isPublic) {
    const pathname = request.nextUrl.pathname;
    const matchedRoute = Object.keys(ROUTE_ROLES).find(route => pathname.startsWith(route));

    if (matchedRoute) {
      const { data: prof } = await supabase
        .from('profissionais').select('role').eq('user_id', user.id).single();

      if (prof && !ROUTE_ROLES[matchedRoute].includes(prof.role)) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
