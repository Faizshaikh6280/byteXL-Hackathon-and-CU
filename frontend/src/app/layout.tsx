import './globals.css';
import React from 'react';
import { ThemeProvider } from '../components/ThemeProvider';

import type { Viewport } from 'next';

export const metadata = {
  title: 'TRACE | Digital Investigation Intelligence',
  description: 'Unified Digital Investigation & Analytics Platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAFA' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased selection:bg-indigo-600 selection:text-white dark:selection:bg-indigo-500 dark:selection:text-white min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
