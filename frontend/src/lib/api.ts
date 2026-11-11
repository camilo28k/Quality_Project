/** Cliente HTTP del navegador: siempre pasa por /api (BFF de Next). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[]
  ) {
    super(messages.join('. '));
  }
}

function toMessages(body: unknown, status: number): string[] {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.map(String);
  if (typeof message === 'string') return [message];
  return [status >= 500 ? 'Error del servidor. Intente de nuevo.' : 'No se pudo completar la operación'];
}

export async function apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
  });
  const data: unknown = await res.json().catch(() => null);
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth')) {
    // Sesión vencida: recarga completa para limpiar el estado del cliente (no es un componente).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  }
  if (!res.ok) throw new ApiError(res.status, toMessages(data, res.status));
  return data as T;
}

export const api = (path: string) => `/api/backend/${path}`;
