import { NotFoundException } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';
import { assertSameCompany, resolveTenant } from './tenant';

/**
 * Caja blanca de resolveTenant (SWR-TEN-002).
 * Caminos: (1) SUPER_ADMIN sin cabecera, (2) con cabecera inválida, (3) con cabecera válida,
 * (4) usuario de empresa (la cabecera se ignora), (5) usuario sin empresa.
 */
describe('resolveTenant', () => {
  const CO = '6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
  const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('camino 1: el SUPER_ADMIN debe indicar la empresa', () => {
    expect(
      resolveTenant({ role: 'SUPER_ADMIN', companyId: null }, undefined),
    ).toEqual({
      ok: false,
      reason: 'HEADER_REQUIRED',
    });
  });

  it('camino 2: rechaza una cabecera que no es un UUID', () => {
    expect(
      resolveTenant({ role: 'SUPER_ADMIN', companyId: null }, "1' OR 1=1"),
    ).toEqual({
      ok: false,
      reason: 'HEADER_INVALID',
    });
  });

  it('camino 3: el SUPER_ADMIN actúa en la empresa de la cabecera', () => {
    expect(resolveTenant({ role: 'SUPER_ADMIN', companyId: null }, CO)).toEqual(
      {
        ok: true,
        companyId: CO,
        viaHeader: true,
      },
    );
  });

  it('camino 4: un ADMIN o SELLER no puede cambiar de empresa con la cabecera', () => {
    for (const role of ['ADMIN', 'SELLER'] as const) {
      expect(resolveTenant({ role, companyId: CO }, OTHER)).toEqual({
        ok: true,
        companyId: CO,
        viaHeader: false,
      });
    }
  });

  it('camino 5: una cuenta de empresa sin empresa no opera', () => {
    expect(
      resolveTenant({ role: 'ADMIN', companyId: null }, undefined),
    ).toEqual({
      ok: false,
      reason: 'NO_COMPANY',
    });
  });
});

describe('assertSameCompany', () => {
  const logger = { warn: jest.fn() };
  const meta = { entity: 'Product', id: 'p1', userId: 'u1' };
  beforeEach(() => logger.warn.mockClear());

  it('devuelve la entidad de la misma empresa sin registrar nada', () => {
    const p = { id: 'p1', companyId: 'co1' };
    expect(
      assertSameCompany(p, 'co1', logger as unknown as AppLogger, meta, 'x'),
    ).toBe(p);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('inexistente → 404 sin registrar intento entre empresas', () => {
    expect(() =>
      assertSameCompany(
        null,
        'co1',
        logger as unknown as AppLogger,
        meta,
        'No encontrado',
      ),
    ).toThrow(NotFoundException);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('de otra empresa → el mismo 404 (no revela que existe) y AUTHZ_DENIED CROSS_TENANT', () => {
    expect(() =>
      assertSameCompany(
        { id: 'p1', companyId: 'co2' },
        'co1',
        logger as unknown as AppLogger,
        meta,
        'No encontrado',
      ),
    ).toThrow(new NotFoundException('No encontrado'));
    expect(logger.warn).toHaveBeenCalledWith(
      'Tenancy',
      'AUTHZ_DENIED',
      expect.any(String),
      expect.objectContaining({ reason: 'CROSS_TENANT', companyId: 'co1' }),
    );
  });
});
