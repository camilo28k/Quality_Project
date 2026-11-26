import { FocusPage } from '@/components/layout/focus-page';
import { OnboardingWizard } from '@/features/company/onboarding-wizard';
import { getSessionUser } from '@/lib/session';
import { pendingPath } from '@/lib/session-types';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Configuración inicial' };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const pending = pendingPath(user);
  if (pending !== '/configuracion-inicial') redirect(pending ?? '/dashboard');
  return (
    <FocusPage
      wide
      title='Configura tu empresa'
      description='Completa estos datos una sola vez. Podrás editarlos después en Configuración.'
    >
      <OnboardingWizard initialName={user.company?.tradeName ?? ''} />
    </FocusPage>
  );
}
