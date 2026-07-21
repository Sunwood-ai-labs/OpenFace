import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import LocaleProvider from '@/components/LocaleProvider';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: ui(locale, 'OpenFace - ローカルAIコミュニティハブ', 'OpenFace - Local AI Community Hub'),
    description: ui(
      locale,
      'Forgejoを基盤に、モデル、データセット、Space、ナレッジを共有できるローカルAIプラットフォーム。',
      'A local AI platform for sharing models, datasets, Spaces, and knowledge, backed by Forgejo.',
    ),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
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
        <LocaleProvider initialLocale={locale}>
          <Navbar />
          <main className="mx-auto w-full max-w-[1544px] px-0 py-0">{children}</main>
          <Footer />
        </LocaleProvider>
      </body>
    </html>
  );
}
