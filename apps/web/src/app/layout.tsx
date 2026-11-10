import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'DMS' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="font-sans bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
