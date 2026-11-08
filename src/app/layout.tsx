import type { Metadata } from 'next';
import { Sarabun, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Homy Shop - AI CTF',
  description: 'A Thai e-commerce prompt injection CTF game with 4 escalating levels.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sarabun.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
