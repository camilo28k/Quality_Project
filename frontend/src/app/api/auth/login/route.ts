import { NextResponse } from 'next/server';
import { backendUrl, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

/**
 * Inicia sesión contra el backend y guarda el token en una cookie httpOnly.
 * El token nunca queda disponible para el JavaScript del navegador.
 */
export async function POST(request: Request) {
  const body = await request.text();
  let res: Response;
  try {
    res = await fetch(backendUrl('/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });
  } catch {
    return NextResponse.json(
      { message: 'No se pudo conectar con el servidor' },
      { status: 503 }
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const response = NextResponse.json({ user: data.user });
  response.cookies.set(SESSION_COOKIE, data.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE
  });
  return response;
}
