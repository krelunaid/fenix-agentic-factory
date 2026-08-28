import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FENIX - Software Factory Agentica',
  description:
    'Trasforma idee in software verificabile: brief, build, preview, test e pubblicazione controllata.',
  openGraph: {
    title: 'FENIX - Software Factory Agentica',
    description: 'Dall idea al software verificabile.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'FENIX - Software factory agentica' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FENIX - Software Factory Agentica',
    description: 'Dall idea al software verificabile.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
