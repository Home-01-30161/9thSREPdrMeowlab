import type { Metadata } from 'next';
import { Kanit, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
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
    <html lang="en" className={`${kanit.variable} ${jetbrainsMono.variable}`}>
      <body className={kanit.className}>{children}</body>
    </html>
  );
}

