import { vi } from 'vitest';

type Handler = (init: RequestInit | undefined) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

/**
 * Reemplaza fetch por respuestas controladas, indexadas por "MÉTODO ruta".
 * Las pruebas de frontend no dependen del backend ni de la base de datos.
 */
export function mockFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Ruta no simulada: ${key}`);
    const { status = 200, body } = await handler(init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const jsonBody = (init: RequestInit | undefined) => JSON.parse(String(init?.body));
