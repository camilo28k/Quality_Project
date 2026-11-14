import ThemeProvider from '@/components/themes/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'TiendApp', template: '%s | TiendApp' },
  description: 'Gestión de inventario y ventas para pequeños comercios',
  icons: { icon: '/logo.svg' },
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='es' suppressHydrationWarning data-theme='tiendapp'>
      <body className={cn('bg-background overflow-x-hidden font-sans antialiased', inter.variable)}>
        <ThemeProvider attribute='class' defaultTheme='light' enableSystem disableTransitionOnChange>
          <Toaster richColors position='top-right' />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
