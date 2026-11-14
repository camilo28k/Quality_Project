import * as bcrypt from 'bcrypt';

/** SWR-AUTH-005: hash adaptativo (bcrypt). El costo se puede subir sin migrar hashes existentes. */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
