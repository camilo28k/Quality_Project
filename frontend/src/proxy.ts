import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'tiendapp_session';
const PROTECTED = ['/dashboard', '/cambiar-contrasena', '/configuracion-inicial', '/empresa-pendiente'];

/**
 * Protección de rutas (guía §5): sin cookie de sesión no se entra al dashboard.
 * La validez real del token la confirma el backend en cada solicitud.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  const protectedPath = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (protectedPath && !hasSession) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (pathname === '/login' && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/cambiar-contrasena', '/configuracion-inicial', '/empresa-pendiente']
};
