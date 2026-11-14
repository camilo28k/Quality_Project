import { BCRYPT_COST, hashPassword, verifyPassword } from './password.util';

describe('password.util (SWR-AUTH-005)', () => {
  it('no almacena la contraseña en texto plano y usa bcrypt con el costo definido', async () => {
    const hash = await hashPassword('MiClave123!');
    expect(hash).not.toContain('MiClave123!');
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
  });

  it('dos hashes de la misma contraseña son distintos (sal aleatoria)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('igual'),
      hashPassword('igual'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifica la contraseña correcta y rechaza una distinta', async () => {
    const hash = await hashPassword('MiClave123!');
    await expect(verifyPassword('MiClave123!', hash)).resolves.toBe(true);
    await expect(verifyPassword('miclave123!', hash)).resolves.toBe(false);
  });
});
