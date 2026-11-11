import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { backendUrl, SESSION_COOKIE } from '@/lib/session';

/**
 * Reenvía las llamadas del navegador al backend NestJS agregando el token
 * desde la cookie httpOnly. El frontend nunca habla con la base de datos.
 */
const ALLOWED = /^(categories|products|sales)(\/[\w-]+)*$/;

async function forward(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (!ALLOWED.test(path)) {
    return NextResponse.json({ message: 'Ruta no permitida' }, { status: 404 });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sesión no válida' }, { status: 401 });

  const search = new URL(request.url).search;
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  try {
    const res = await fetch(backendUrl(`/${path}${search}`), {
      method: request.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(hasBody ? { 'content-type': 'application/json' } : {})
      },
      body: hasBody ? await request.text() : undefined,
      cache: 'no-store'
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
    });
  } catch {
    return NextResponse.json({ message: 'No se pudo conectar con el servidor' }, { status: 503 });
  }
}

export { forward as GET, forward as POST, forward as PATCH };
