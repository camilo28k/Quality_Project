import Image from 'next/image';
import { cn } from '@/lib/utils';

export function BrandLogo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Image src='/logo.svg' alt='' width={32} height={32} className='size-8 shrink-0 rounded-lg' />
      {showName && <span className='text-lg font-semibold tracking-tight'>TiendApp</span>}
    </span>
  );
}
