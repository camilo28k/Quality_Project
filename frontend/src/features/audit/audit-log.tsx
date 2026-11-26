'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL, type Role } from '@/lib/session-types';
import { useApiData } from '@/lib/use-api-data';
import { useState } from 'react';

export interface AuditItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  role: Role;
  userName: string | null;
  createdAt: string;
}
interface Page {
  items: AuditItem[];
  nextCursor: string | null;
}

export const ACTION_LABEL: Record<string, string> = {
  COMPANY_CREATED: 'Empresa creada',
  COMPANY_UPDATED: 'Datos de la empresa editados',
  COMPANY_ACTIVATED: 'Empresa activada',
  COMPANY_DEACTIVATED: 'Empresa desactivada',
  COMPANY_ONBOARDING_COMPLETED: 'Configuración inicial completada',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario editado',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  CATEGORY_CREATED: 'Categoría creada',
  CATEGORY_UPDATED: 'Categoría renombrada',
  CATEGORY_ACTIVATED: 'Categoría activada',
  CATEGORY_DEACTIVATED: 'Categoría desactivada',
  CATEGORY_DELETED: 'Categoría eliminada',
  PRODUCT_CREATED: 'Producto creado',
  PRODUCT_UPDATED: 'Producto editado',
  PRODUCT_PRICE_CHANGED: 'Precio cambiado',
  PRODUCT_APPROVED: 'Producto aprobado',
  PRODUCT_ACTIVATED: 'Producto activado',
  PRODUCT_DEACTIVATED: 'Producto desactivado',
  PRODUCT_DELETED: 'Producto eliminado',
  PRICE_CHANGE_REQUESTED: 'Precio propuesto',
  PRICE_CHANGE_REJECTED: 'Precio propuesto rechazado',
  STOCK_ENTRY: 'Entrada de stock',
  STOCK_ADJUSTMENT_OUT: 'Baja de stock',
  SALE_VOIDED: 'Venta anulada',
  SALE_REISSUED: 'Venta reemitida',
  SALE_CORRECTION_REQUESTED: 'Corrección de venta pedida',
  SALE_CORRECTION_REJECTED: 'Corrección de venta rechazada'
};

const ENTITY_LABEL: Record<string, string> = {
  Company: 'Empresa',
  User: 'Usuario',
  Category: 'Categoría',
  Product: 'Producto',
  Sale: 'Venta'
};

/** Resume antes → después en una línea legible. */
export function describeChange(item: Pick<AuditItem, 'before' | 'after'>): string {
  // Los identificadores internos no ayudan a quien lee la auditoría.
  const HIDDEN = new Set(['requestId', 'id', 'companyId']);
  const keys = [...new Set([...Object.keys(item.before ?? {}), ...Object.keys(item.after ?? {})])].filter(
    (k) => !HIDDEN.has(k)
  );
  return keys
    .map((k) => {
      const b = item.before?.[k];
      const a = item.after?.[k];
      const fmt = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
      if (item.before && item.after && k in (item.before ?? {}) && k in (item.after ?? {})) return `${k}: ${fmt(b)} → ${fmt(a)}`;
      return `${k}: ${fmt(a ?? b)}`;
    })
    .join(' · ');
}

/** SWR-AUD-001: auditoría de la empresa, solo lectura, más recientes primero. */
export function AuditLogView() {
  const [entity, setEntity] = useState('');
  const first = useApiData<Page>(api(`audit${entity ? `?entity=${entity}` : ''}`));
  const [more, setMore] = useState<{ key: string; items: AuditItem[]; cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const extra = more?.key === entity ? more : null;
  const items = [...(first.data?.items ?? []), ...(extra?.items ?? [])];
  const cursor = extra ? extra.cursor : (first.data?.nextCursor ?? null);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<Page>(api(`audit?cursor=${cursor}${entity ? `&entity=${entity}` : ''}`));
      setMore({ key: entity, items: [...(extra?.items ?? []), ...page.items], cursor: page.nextCursor });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2'>
        <label htmlFor='audit-entity' className='text-sm'>
          Mostrar
        </label>
        <NativeSelect id='audit-entity' value={entity} onChange={(e) => setEntity(e.target.value)}>
          <NativeSelectOption value=''>Todo</NativeSelectOption>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => (
            <NativeSelectOption key={k} value={k}>
              {v}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {first.loading && !first.data ? (
        <LoadingRows label='Cargando auditoría' />
      ) : first.error ? (
        <LoadError message={first.error} onRetry={first.reload} />
      ) : items.length === 0 ? (
        <EmptyState title='Sin registros' description='Las acciones sobre la empresa aparecerán aquí.' />
      ) : (
        <div className='min-w-0 overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Quién</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Cambio</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className='whitespace-nowrap'>{formatDateTime(a.createdAt)}</TableCell>
                  <TableCell>
                    {a.userName ?? '—'}
                    <span className='text-muted-foreground block text-xs'>{ROLE_LABEL[a.role]}</span>
                  </TableCell>
                  <TableCell>{ACTION_LABEL[a.action] ?? a.action}</TableCell>
                  <TableCell className='max-w-md text-xs break-words'>{describeChange(a) || '—'}</TableCell>
                  <TableCell>{a.reason ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {cursor && (
        <Button variant='outline' onClick={loadMore} disabled={loadingMore}>
          Cargar más
        </Button>
      )}
    </div>
  );
}
