import { bogotaTimestamp, buildEntry, redact } from './app-logger.service';

describe('AppLogger helpers (guía §18)', () => {
  it('genera timestamp con desfase de Colombia -05:00', () => {
    expect(bogotaTimestamp(new Date('2026-11-06T00:30:12.000Z'))).toBe(
      '2026-11-05T19:30:12.000-05:00',
    );
  });

  it('oculta campos sensibles sin importar mayúsculas', () => {
    expect(redact({ password: 'x', Token: 'y', userId: 'u1' })).toEqual({
      password: '[REDACTED]',
      Token: '[REDACTED]',
      userId: 'u1',
    });
  });

  it('arma la entrada con los campos mínimos y omite metadata vacía', () => {
    const entry = buildEntry(
      'INFO',
      'Ctx',
      'EVT',
      'msg',
      {},
      new Date('2026-01-01T05:00:00.000Z'),
    );
    expect(entry).toEqual({
      timestamp: '2026-01-01T00:00:00.000-05:00',
      level: 'INFO',
      context: 'Ctx',
      event: 'EVT',
      message: 'msg',
    });
  });
});
