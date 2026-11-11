'use client';

import { BrandLogo } from '@/components/brand-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { navForRole } from '@/config/nav-config';
import { ROLE_LABEL, type SessionUser } from '@/lib/session-types';
import { IconChevronsDown, IconLogout, IconUserCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/** Adaptado de app-sidebar de la plantilla: sin organizaciones ni Clerk. */
export default function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='px-3 pt-4 group-data-[collapsible=icon]:px-2'>
        <Link href='/dashboard' aria-label='TiendApp, ir al panel'>
          <BrandLogo className='group-data-[collapsible=icon]:[&>span]:hidden' />
        </Link>
      </SidebarHeader>
      <SidebarContent className='overflow-x-hidden'>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarMenu>
            {navForRole(user.role).map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  render={<Link href={item.url} />}
                  tooltip={item.title}
                  isActive={pathname === item.url}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size='lg' />}>
                <IconUserCircle className='size-8' />
                <span className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-medium'>{user.name}</span>
                  <span className='text-muted-foreground truncate text-xs'>{ROLE_LABEL[user.role]}</span>
                </span>
                <IconChevronsDown className='ml-auto size-4' />
              </DropdownMenuTrigger>
              <DropdownMenuContent className='min-w-56' side='top' align='end'>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className='font-normal'>
                    <span className='block font-medium'>{user.name}</span>
                    <span className='text-muted-foreground block text-xs'>{user.email}</span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <IconLogout className='mr-2 size-4' />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
