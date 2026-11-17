import { UserStatusCache } from './user-status-cache';

describe('UserStatusCache (FAL-01)', () => {
  const active = { id: 'u1', role: 'ADMIN' as const, active: true };

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
});
