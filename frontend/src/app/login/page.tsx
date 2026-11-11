import { BrandLogo } from '@/components/brand-logo';
import { LoginForm } from '@/features/auth/login-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Iniciar sesión' };

/** Diseño en dos columnas adaptado de sign-in-view de la plantilla. */
export default function LoginPage() {
  return (
    <div className='relative grid min-h-screen lg:grid-cols-2'>
      <div className='bg-primary text-primary-foreground relative hidden flex-col justify-between p-10 lg:flex'>
        <BrandLogo className='[&_img]:ring-2 [&_img]:ring-white/40' />
        <blockquote className='space-y-2'>
          <p className='text-lg'>
            Productos, inventario y ventas de tu tienda en un solo lugar.
          </p>
          <footer className='text-sm opacity-80'>Calidad de Software · CORHUILA</footer>
        </blockquote>
      </div>
      <div className='flex items-center justify-center p-6'>
        <div className='w-full max-w-sm space-y-6'>
          <div className='flex justify-center lg:hidden'>
            <BrandLogo />
          </div>
          <div className='space-y-1 text-center'>
            <h1 className='text-2xl font-semibold tracking-tight'>Iniciar sesión</h1>
            <p className='text-muted-foreground text-sm'>Ingresa con tu correo y contraseña</p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
