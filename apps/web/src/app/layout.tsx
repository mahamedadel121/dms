import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = { title: 'DMS' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Runs before paint: applies the saved locale direction, theme and density so there is no flash.
const BOOT = `(function(){try{var d=document.documentElement,s=localStorage;var l=s.getItem('dms.locale');if(l==='en'){d.lang='en';d.dir='ltr';}var t=s.getItem('dms.theme')||'light';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.setAttribute('data-theme',t==='dark'?'dark':'light');var n=s.getItem('dms.density');if(n==='compact'||n==='comfortable'){d.setAttribute('data-density',n);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
