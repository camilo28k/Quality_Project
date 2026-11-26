import { pendingStep } from './pending-steps.guard';

/**
 * Caja blanca de pendingStep (SWR-ONB-001).
 * Caminos: (1) contraseña temporal, (2) SUPER_ADMIN, (3) empresa configurada,
 * (4) ADMIN con asistente pendiente, (5) vendedor con empresa sin configurar.
 */
describe('pendingStep', () => {
  it('camino 1: la contraseña temporal va primero, aunque falte el asistente', () => {
    expect(
      pendingStep({
        role: 'ADMIN',
        mustChangePassword: true,
        onboardingCompleted: false,
      }),
    ).toBe('PASSWORD_CHANGE');
  });

  it('camino 2: el SUPER_ADMIN no tiene asistente', () => {
    expect(
      pendingStep({
        role: 'SUPER_ADMIN',
        mustChangePassword: false,
        onboardingCompleted: false,
      }),
    ).toBeNull();
  });

  it('camino 3: sin pasos pendientes', () => {
    expect(
      pendingStep({
        role: 'SELLER',
        mustChangePassword: false,
        onboardingCompleted: true,
      }),
    ).toBeNull();
  });

  it('camino 4: el ADMIN debe completar la configuración inicial', () => {
    expect(
      pendingStep({
        role: 'ADMIN',
        mustChangePassword: false,
        onboardingCompleted: false,
      }),
    ).toBe('ONBOARDING');
  });

  it('camino 5: el vendedor espera a que el ADMIN configure la empresa', () => {
    expect(
      pendingStep({
        role: 'SELLER',
        mustChangePassword: false,
        onboardingCompleted: false,
      }),
    ).toBe('COMPANY_SETUP');
  });
});
