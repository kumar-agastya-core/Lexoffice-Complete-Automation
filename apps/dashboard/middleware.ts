import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/onboarding', '/api/onboarding', '/_next', '/favicon.ico'];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p),
  );
  if (isPublic) return NextResponse.next();

  // ── Supabase auth (when configured) ──────────────────────────────────────
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { updateSession } = await import('./app/lib/supabase/middleware.js');
    const { response, user } = await updateSession(request);
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // ── Fallback: DASHBOARD_SECRET cookie check ───────────────────────────────
  const secret = process.env.DASHBOARD_SECRET;
  const sessionCookie = request.cookies.get('lx_session')?.value;

  if (!secret || sessionCookie !== secret) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
