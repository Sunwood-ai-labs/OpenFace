import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'OpenFace - AI community hub',
  description: 'A Forgejo-backed Hugging Face style platform for models, datasets, and Spaces.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const valid = ['standard', 'solarpunk', 'cyberpunk']; const saved = localStorage.getItem('openface-theme-v2'); const legacy = localStorage.getItem('openface-theme'); const theme = valid.includes(saved) ? saved : (legacy && legacy !== 'standard' && valid.includes(legacy) ? legacy : (matchMedia('(prefers-color-scheme: dark)').matches ? 'cyberpunk' : 'standard')); if (theme === 'standard') delete document.documentElement.dataset.openfaceTheme; else document.documentElement.dataset.openfaceTheme = theme; document.cookie = 'openface-theme=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax'; } catch {} })();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { document.addEventListener('click', (event) => { if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return; const summary = event.target.closest('summary'); const details = summary?.parentElement; if (!summary || details?.tagName !== 'DETAILS') return; const wasOpen = details.hasAttribute('open'); requestAnimationFrame(() => { if (details.hasAttribute('open') === wasOpen) details.open = !wasOpen; }); }, { passive: true }); })();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <Navbar />
        <main className="mx-auto w-full max-w-[1544px] px-0 py-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
