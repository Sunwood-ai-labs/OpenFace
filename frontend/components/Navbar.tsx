'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandMark from './BrandMark';
import HfIcon from './HfIcon';
import SearchForm from './SearchForm';
import ThemeSelector from './ThemeSelector';
import LanguageSelector from './LanguageSelector';
import { useLocale } from './LocaleProvider';
import { ui } from '@/lib/i18n';

export default function Navbar() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const isCurrent = (href: string) => href.startsWith('/') && (pathname === href || pathname.startsWith(`${href}/`));
  const navItems = [
    { href: '/models', label: 'Models' },
    { href: '/datasets', label: 'Datasets' },
    { href: '/spaces', label: 'Spaces' },
    { href: '/skills', label: 'Skills' },
    { href: '/mcps', label: 'MCPs' },
    { href: '/prompts', label: 'Prompts' },
    { href: '/docs', label: 'Knowledge' },
    { href: '/characters', label: 'Characters' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-[1536px] items-center gap-4 px-4 py-3.5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100"
        >
          <BrandMark className="h-8 w-8 rounded-lg" />
          <span>OpenFace</span>
        </Link>

        <SearchForm className="ml-auto hidden flex-1 sm:ml-6 sm:block sm:max-w-[325px]" />

        <nav className="ml-auto hidden items-center gap-3 text-sm font-medium text-zinc-900 xl:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex items-center gap-1.5 hover:text-zinc-600">
              {item.label}
            </Link>
          ))}
          <details className="group relative">
            <summary className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-50 marker:hidden [&::-webkit-details-marker]:hidden">
              <HfIcon name="bars" className="h-3.5 w-3.5" />
            </summary>
            <div className="absolute right-0 z-40 mt-3 hidden w-[520px] grid-cols-3 gap-6 rounded-lg border border-zinc-200 bg-white p-5 text-sm shadow-xl group-open:grid">
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-400">{ui(locale, 'コンテンツ', 'Content')}</h2>
                <a href="/models" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">Models</a>
                <a href="/datasets" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">Datasets</a>
                <a href="/spaces" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">Spaces</a>
                <a href="/skills" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">Skills</a>
                <a href="/mcps" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">MCPs</a>
                <a href="/prompts" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">Prompts</a>
                <a href="/docs" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">Knowledge</a>
                <a href="/characters" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">Characters</a>
              </div>
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-400">{ui(locale, 'コミュニティ', 'Community')}</h2>
                <a href="/git/explore/repos" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">{ui(locale, 'リポジトリ', 'Repositories')}</a>
                <a href="/git/explore/users" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">{ui(locale, 'ユーザー', 'Users')}</a>
                <a href="https://github.com/Sunwood-ai-labs/OpenFace/issues" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">{ui(locale, '議論', 'Discussions')}</a>
              </div>
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-400">{ui(locale, 'セルフホスト', 'Self-host')}</h2>
                <a href="/git/repo/create" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">{ui(locale, 'リポジトリを作成', 'Create repository')}</a>
                <a href="/git/user/settings" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">{ui(locale, '設定', 'Settings')}</a>
                <a href="/git/admin" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50">{ui(locale, '管理', 'Administration')}</a>
              </div>
            </div>
          </details>
        </nav>

        <div className="hidden xl:block">
          <ThemeSelector />
        </div>
        <div className="hidden xl:block"><LanguageSelector /></div>

        <div className="hidden shrink-0 items-center gap-4 text-sm font-semibold xl:flex">
          <a href="/git/user/login" className="text-zinc-900 hover:text-zinc-600">
            {ui(locale, 'ログイン', 'Log in')}
          </a>
          <a href="/git/user/sign_up" className="rounded-full bg-zinc-950 px-4 py-2 text-white hover:bg-zinc-800">
            {ui(locale, '新規登録', 'Sign up')}
          </a>
        </div>

        <details className="group relative ml-auto xl:hidden">
          <summary className="openface-mobile-menu-toggle flex h-9 w-9 shrink-0 cursor-pointer list-none items-center justify-center rounded-lg border border-transparent text-zinc-700 hover:bg-zinc-100 marker:hidden dark:text-zinc-300 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
            <HfIcon name="bars" className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 z-40 mt-3 hidden w-[min(88vw,320px)] gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-xl group-open:grid">
            <SearchForm className="mb-1" compact />
            <div className="mb-1 flex items-center gap-2 px-3 pt-1"><ThemeSelector /><LanguageSelector /></div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent(item.href) ? 'page' : undefined}
                className="openface-mobile-nav-link"
              >
                {item.label}
              </Link>
            ))}
            <a
              href="/git/explore/repos"
              aria-current={isCurrent('/git/explore/repos') ? 'page' : undefined}
              className="openface-mobile-nav-link"
            >{ui(locale, 'リポジトリ', 'Repositories')}</a>
            <a
              href="/git/explore/users"
              aria-current={isCurrent('/git/explore/users') ? 'page' : undefined}
              className="openface-mobile-nav-link"
            >{ui(locale, 'ユーザー', 'Users')}</a>
          </div>
        </details>
      </div>
    </header>
  );
}
