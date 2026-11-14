import { canAccess } from './roles.guard';

/**
 * Caja blanca de canAccess (SWR-AUTH-004).
 * Caminos: (1) sin roles requeridos, (2) sin usuario/rol, (3) rol incluido, (4) rol no incluido.
 */
describe('canAccess (SWR-AUTH-004)', () => {
  it('camino 1a: ruta sin roles requeridos permite el acceso', () => {
    expect(canAccess(undefined, 'SELLER')).toBe(true);
  });

  it('camino 1b: lista de roles vacía se trata como sin restricción', () => {
    expect(canAccess([], 'SELLER')).toBe(true);
  });

  it('camino 2: ruta con rol requerido y sin usuario autenticado se rechaza', () => {
    expect(canAccess(['ADMIN'], undefined)).toBe(false);
  });

  it('camino 3: administrador accede a función administrativa', () => {
    expect(canAccess(['ADMIN'], 'ADMIN')).toBe(true);
  });

  it('camino 4: vendedor no accede a función administrativa (TC-SEC-001)', () => {
    expect(canAccess(['ADMIN'], 'SELLER')).toBe(false);
  });
});
