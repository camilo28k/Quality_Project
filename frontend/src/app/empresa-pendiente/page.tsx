import { FocusPage } from '@/components/layout/focus-page';
import { LogoutButton } from '@/features/account/logout-button';
import { getSessionUser } from '@/lib/session';
import { pendingPath } from '@/lib/session-types';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Empresa en configuración' };

/** El vendedor espera a que el ADMIN complete la configuración inicial (SWR-ONB-001). */
export default async function CompanyPendingPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (pendingPath(user) !== '/empresa-pendiente') redirect('/dashboard');
  return (
    <FocusPage
      title='Tu empresa aún se está configurando'
      description='El administrador debe completar la configuración inicial antes de que puedas vender. Intenta de nuevo más tarde.'
    >
      <LogoutButton />
    </FocusPage>
  );
}
