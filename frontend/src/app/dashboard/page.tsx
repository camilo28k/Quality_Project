import PageContainer from '@/components/layout/page-container';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { navForRole } from '@/config/nav-config';
import { getSessionUser } from '@/lib/session';
import Link from 'next/link';

/** Panel con accesos rápidos (tarjetas de overview de la plantilla). Sin reportes: SWR-REP fuera del MVP. */
export default async function DashboardPage() {
  const user = (await getSessionUser())!;
  const shortcuts = navForRole(user.role).filter((i) => i.url !== '/dashboard');
  const descriptions: Record<string, string> = {
    '/dashboard/ventas/nueva': 'Registrar una venta y descontar inventario',
    '/dashboard/ventas': 'Consultar las ventas confirmadas',
    '/dashboard/productos': 'Catálogo, precios y existencias',
    '/dashboard/categorias': 'Clasificación de productos'
  };
  return (
    <PageContainer pageTitle={`Hola, ${user.name}`} pageDescription='¿Qué quieres hacer hoy?'>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {shortcuts.map((item) => (
          <Link key={item.url} href={item.url} className='group'>
            <Card className='group-hover:ring-primary h-full transition-shadow group-hover:ring-2'>
              <CardHeader>
                <item.icon className='text-primary mb-2 size-6' />
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{descriptions[item.url]}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
