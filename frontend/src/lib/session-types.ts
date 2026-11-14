export type Role = 'ADMIN' | 'SELLER';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrador', SELLER: 'Vendedor' };
