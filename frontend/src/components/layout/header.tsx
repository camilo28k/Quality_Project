import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

/** Encabezado de la plantilla sin búsqueda, notificaciones ni selector de temas. */
export default function Header() {
  return (
    <header className='bg-background/60 sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 backdrop-blur-md'>
      <div className='flex items-center gap-2 px-4'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='mr-2 h-4 data-vertical:self-center' />
        <span className='text-muted-foreground text-sm'>TiendApp</span>
      </div>
      <div className='flex items-center gap-2 px-4'>
        <ThemeModeToggle />
      </div>
    </header>
  );
}
