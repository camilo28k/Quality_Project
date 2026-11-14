import 'server-only';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'tiendapp_session';
export const SESSION_MAX_AGE = 60 * 60 * 8; // igual a JWT_EXPIRES_IN del backend

export function backendUrl(path: string): string {
  return `${process.env.BACKEND_URL ?? 'http://localhost:4000'}${path}`;
}

import type { SessionUser } from './session-types';

export type { Role, SessionUser } from './session-types';

/** Usuario actual consultando /auth/me con el token de la cookie httpOnly. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(backendUrl('/auth/me'), {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}
