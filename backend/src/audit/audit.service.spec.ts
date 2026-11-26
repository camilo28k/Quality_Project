import { auditSnapshot, changedFields } from './audit.service';

/** SWR-AUD-001 */
describe('auditoría', () => {
  it('la foto nunca incluye contraseñas ni hashes', () => {
    expect(
      auditSnapshot({
        name: 'Ana',
        passwordHash: 'h',
        temporaryPassword: 't',
        nested: { password: 'p', ok: 1 },
      }),
    ).toEqual({
      name: 'Ana',
      nested: { ok: 1 },
    });
  });

  it('changedFields deja solo lo que cambió e ignora updatedAt', () => {
    expect(
      changedFields(
        { name: 'A', price: 10, updatedAt: 1 },
        { name: 'A', price: 12, updatedAt: 2 },
      ),
    ).toEqual({ before: { price: 10 }, after: { price: 12 } });
  });
});
