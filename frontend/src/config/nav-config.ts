import {
  IconCategory,
  IconHistory,
  IconLayoutDashboard,
  IconPackage,
  IconShoppingCartPlus,
  type Icon
} from '@tabler/icons-react';
import type { Role } from '@/lib/session-types';

export interface NavItem {
  title: string;
  url: string;
  icon: Icon;
  roles: Role[];
}

/**
 * Menú lateral filtrado por rol (adaptado del RBAC de nav-config de la plantilla).
 * Ocultar opciones es solo usabilidad: el backend valida permisos (SWR-SEC-003).
 */
export const navItems: NavItem[] = [
  { title: 'Panel', url: '/dashboard', icon: IconLayoutDashboard, roles: ['ADMIN', 'SELLER'] },
  { title: 'Nueva venta', url: '/dashboard/ventas/nueva', icon: IconShoppingCartPlus, roles: ['ADMIN', 'SELLER'] },
  { title: 'Ventas', url: '/dashboard/ventas', icon: IconHistory, roles: ['ADMIN', 'SELLER'] },
  { title: 'Productos', url: '/dashboard/productos', icon: IconPackage, roles: ['ADMIN', 'SELLER'] },
  { title: 'Categorías', url: '/dashboard/categorias', icon: IconCategory, roles: ['ADMIN'] }
];

export function navForRole(role: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}
