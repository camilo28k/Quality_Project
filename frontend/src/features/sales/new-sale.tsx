'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, apiFetch } from '@/lib/api';
import { formatCOP, formatQty } from '@/lib/format';
import { PAYMENT_LABEL, UNIT_LABEL, type PaymentMethod, type Product, type Sale } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';
import { IconTrash } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { lineSubtotal, quantityError, total } from './sale-math';

interface Line {
  key: string;
  product: Product;
  quantity: number;
}

const newKey = () => crypto.randomUUID();

/**
 * Registro de venta: SWR-MED-002, SWR-SALE-003/004/007/008/010, SWR-PAY-001.
 */
export function NewSale() {
  const products = useApiData<Product[]>(api('products'));
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lineError, setLineError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [saleErrors, setSaleErrors] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Sale | null>(null);
  // SWR-SALE-010: una clave por carrito; si el carrito cambia se genera otra.
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);

  const selected = products.data?.find((p) => p.id === productId);

  function changeCart(next: Line[]) {
    setLines(next);
    setIdempotencyKey(newKey());
    setSaleErrors([]);
  }

  function addLine(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      setLineError('Seleccione un producto');
      return;
    }
    const qty = quantity.trim() === '' ? Number.NaN : Number(quantity.replace(',', '.'));
    const error = quantityError(selected.unit, qty);
    if (error) {
      setLineError(error);
      return;
    }
    setLineError(null);
    setConfirmed(null);
    changeCart([...lines, { key: newKey(), product: selected, quantity: qty }]);
    setQuantity('');
  }

  async function confirm() {
    if (submitting || lines.length === 0) return;
    setSubmitting(true);
    setSaleErrors([]);
    try {
      const { sale } = await apiFetch<{ sale: Sale; replayed: boolean }>(api('sales'), {
        method: 'POST',
        body: {
          idempotencyKey,
          paymentMethod: payment,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity }))
        }
      });
      toast.success(`Venta confirmada por ${formatCOP(sale.total)}`);
      setConfirmed(sale);
      changeCart([]);
      await products.reload();
    } catch (e) {
      setSaleErrors(e instanceof ApiError ? e.messages : ['No se pudo confirmar la venta. Intente de nuevo.']);
    } finally {
      setSubmitting(false);
    }
  }

  if (products.loading && !products.data) return <LoadingRows label='Cargando productos' />;
  if (products.error) return <LoadError message={products.error} onRetry={products.reload} />;
  if (!products.data?.length) {
    return <EmptyState title='No hay productos activos' description='Registra productos para poder vender.' />;
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[24rem_1fr]'>
      <Card>
        <CardHeader>
          <CardTitle>Agregar producto</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addLine} noValidate className='space-y-4'>
            <Field>
              <FieldLabel htmlFor='sale-product'>Producto</FieldLabel>
              <NativeSelect
                id='sale-product'
                className='w-full'
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <NativeSelectOption value=''>Seleccione…</NativeSelectOption>
                {products.data.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name} — {formatCOP(p.price)} / {UNIT_LABEL[p.unit]} (disp. {formatQty(p.stock)})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field data-invalid={!!lineError}>
              <FieldLabel htmlFor='sale-quantity'>
                Cantidad{selected ? ` (${UNIT_LABEL[selected.unit]})` : ''}
              </FieldLabel>
              <Input
                id='sale-quantity'
                inputMode='decimal'
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={!!lineError}
              />
              {lineError && <FieldError>{lineError}</FieldError>}
            </Field>
            <Button type='submit' variant='outline'>
              Agregar a la venta
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle de la venta</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {confirmed && (
            <Alert role='status'>
              <AlertTitle>Venta confirmada</AlertTitle>
              <AlertDescription>
                Total {formatCOP(confirmed.total)} · {PAYMENT_LABEL[confirmed.paymentMethod]} · {confirmed.items.length}{' '}
                línea(s)
              </AlertDescription>
            </Alert>
          )}
          {saleErrors.length > 0 && (
            <Alert variant='destructive' role='alert'>
              <AlertTitle>No se pudo confirmar la venta</AlertTitle>
              <AlertDescription>
                <ul className='list-disc pl-4'>
                  {saleErrors.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {lines.length === 0 ? (
            <p className='text-muted-foreground text-sm'>Agrega productos para comenzar la venta.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className='text-right'>Cantidad</TableHead>
                  <TableHead className='text-right'>Precio</TableHead>
                  <TableHead className='text-right'>Subtotal</TableHead>
                  <TableHead className='sr-only'>Quitar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell>{l.product.name}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatQty(l.quantity)} {UNIT_LABEL[l.product.unit]}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{formatCOP(l.product.price)}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatCOP(lineSubtotal(l.quantity, l.product.price))}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`Quitar ${l.product.name}`}
                        onClick={() => changeCart(lines.filter((x) => x.key !== l.key))}
                      >
                        <IconTrash />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className='text-right font-semibold tabular-nums' data-testid='sale-total'>
                    {formatCOP(total(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.product.price }))))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
        <CardFooter className='flex flex-wrap items-end justify-between gap-4'>
          <Field className='w-48'>
            <FieldLabel htmlFor='sale-payment'>Medio de pago</FieldLabel>
            <NativeSelect
              id='sale-payment'
              className='w-full'
              value={payment}
              onChange={(e) => setPayment(e.target.value as PaymentMethod)}
            >
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button size='lg' onClick={confirm} disabled={submitting || lines.length === 0}>
            {submitting && <Spinner />}
            Confirmar venta
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
