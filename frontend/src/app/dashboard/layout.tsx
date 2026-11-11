import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getSessionUser } from '@/lib/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // El proxy solo revisa que exista la cookie; aquí se confirma con el backend.
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const defaultOpen = (await cookies()).get('sidebar_state')?.value !== 'false';
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        href='#main-content'
        className='bg-background ring-ring sr-only rounded-md px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:ring-2'
      >
        Saltar al contenido
      </a>
      <AppSidebar user={user} />
      <SidebarInset id='main-content' tabIndex={-1}>
        <Header />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
