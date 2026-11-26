import { BrandLogo } from '@/components/brand-logo';
import React from 'react';

/** Página de un solo paso (cambio de contraseña, configuración inicial), sin menú lateral. */
export function FocusPage({
  title,
  description,
  children,
  wide = false
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main className='flex min-h-screen items-start justify-center px-4 py-10 sm:items-center'>
      <div className={`w-full space-y-6 ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
        <div className='flex justify-center'>
          <BrandLogo />
        </div>
        <div className='space-y-1 text-center'>
          <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
          {description && <p className='text-muted-foreground text-sm'>{description}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
