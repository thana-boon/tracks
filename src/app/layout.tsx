import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { Toaster } from 'sonner';
import { DialogProvider } from '@/components/dialog';
import './globals.css';

const font = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-thai',
});

export const metadata: Metadata = {
  title: 'Track วิชาเสริม · สุคนธีรวิทย์',
  description: 'ระบบวิชาเสริม ม.4-6 โรงเรียนสุคนธีรวิทย์',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5b2d8e',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={font.variable}>
      <body>
        <DialogProvider>{children}</DialogProvider>
        <Toaster
          position="top-center"
          richColors
          toastOptions={{ style: { fontFamily: 'var(--font-plex-thai)' } }}
        />
      </body>
    </html>
  );
}
