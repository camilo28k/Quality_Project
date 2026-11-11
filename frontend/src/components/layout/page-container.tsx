import React from 'react';

/** Contenedor de página de la plantilla, simplificado (sin infobar). */
export default function PageContainer({
  children,
  pageTitle,
  pageDescription,
  pageHeaderAction
}: {
  children: React.ReactNode;
  pageTitle: string;
  pageDescription?: string;
  pageHeaderAction?: React.ReactNode;
}) {
  return (
    <div className='flex flex-1 flex-col px-4 pt-2 pb-4 md:px-6 md:pt-4'>
      <div className='mb-4 flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>{pageTitle}</h1>
          {pageDescription && <p className='text-muted-foreground text-sm'>{pageDescription}</p>}
        </div>
        {pageHeaderAction && <div className='shrink-0'>{pageHeaderAction}</div>}
      </div>
      {children}
    </div>
  );
}

export function NoAccess() {
  return (
    <div role='status' className='text-muted-foreground flex flex-1 items-center justify-center p-8 text-center'>
      No tiene permisos para ver esta página.
    </div>
  );
}
