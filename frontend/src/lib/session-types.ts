export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SELLER';

export interface SessionCompany {
  id: string;
  tradeName: string;
  onboardingCompleted: boolean;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
  mustChangePassword: boolean;
  company: SessionCompany | null;
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super administrador',
  ADMIN: 'Administrador',
  SELLER: 'Vendedor'
};

/**
 * Pantalla obligatoria pendiente (SWR-ONB-001). El backend la exige con 428;
 * aquí solo se lleva al usuario a la pantalla correcta.
 */
export function pendingPath(user: SessionUser): string | null {
  if (user.mustChangePassword) return '/cambiar-contrasena';
  if (user.role === 'SUPER_ADMIN' || !user.company || user.company.onboardingCompleted) return null;
  return user.role === 'ADMIN' ? '/configuracion-inicial' : '/empresa-pendiente';
}
