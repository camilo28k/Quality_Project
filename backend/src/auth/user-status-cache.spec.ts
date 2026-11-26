import { UserStatusCache } from './user-status-cache';

describe('UserStatusCache (FAL-01)', () => {
  const active = {
    id: 'u1',
    role: 'ADMIN' as const,
    active: true,
    companyId: 'co1',
    companyActive: true,
  };

  it('consulta la BD una sola vez dentro del tiempo de vida', async () => {
    let now = 0;
    const cache = new UserStatusCache(30_000, () => now);
    const load = jest.fn().mockResolvedValue(active);

    await cache.get('u1', load);
    now = 29_999;
    await expect(cache.get('u1', load)).resolves.toEqual(active);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('vuelve a consultar cuando vence (frontera: exactamente ttl)', async () => {
    let now = 0;
    const cache = new UserStatusCache(30_000, () => now);
    const load = jest.fn().mockResolvedValue(active);

    await cache.get('u1', load);
    now = 30_000;
    await cache.get('u1', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('no guarda cuentas inactivas ni inexistentes', async () => {
    const cache = new UserStatusCache(30_000, () => 0);
    const load = jest
      .fn()
      .mockResolvedValueOnce({ ...active, active: false })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(active);

    await expect(cache.get('u1', load)).resolves.toMatchObject({
      active: false,
    });
    await expect(cache.get('u1', load)).resolves.toBeNull();
    await expect(cache.get('u1', load)).resolves.toEqual(active);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('SWR-TEN-003: una cuenta de empresa desactivada no se guarda en caché', async () => {
    const cache = new UserStatusCache(30_000, () => 0);
    const load = jest
      .fn()
      .mockResolvedValueOnce({ ...active, companyActive: false })
      .mockResolvedValueOnce(active);
    await cache.get('u1', load);
    await cache.get('u1', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidate e invalidateCompany obligan a volver a consultar la BD', async () => {
    const cache = new UserStatusCache(30_000, () => 0);
    const load = jest.fn().mockResolvedValue(active);
    const other = jest
      .fn()
      .mockResolvedValue({ ...active, id: 'u2', companyId: 'co2' });
    await cache.get('u1', load);
    await cache.get('u2', other);

    cache.invalidateCompany('co1');
    await cache.get('u1', load);
    await cache.get('u2', other);
    expect(load).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(1);

    cache.invalidate('u2');
    await cache.get('u2', other);
    expect(other).toHaveBeenCalledTimes(2);
  });
});
