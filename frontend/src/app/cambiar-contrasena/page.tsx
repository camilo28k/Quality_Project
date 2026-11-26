import { FocusPage } from '@/components/layout/focus-page';
import { ChangePasswordForm } from '@/features/account/change-password-form';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Cambiar contraseña' };

/** Ruta /cambiar-contrasena: obligatoria con contraseña temporal y disponible siempre desde el menú. */
export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return (
    <FocusPage title='Cambiar contraseña' description={user.email}>
      <ChangePasswordForm mandatory={user.mustChangePassword} />
    </FocusPage>
  );
}
