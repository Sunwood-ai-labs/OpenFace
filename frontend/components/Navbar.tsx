'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandMark from './BrandMark';
import HfIcon, { HfIconName } from './HfIcon';
import SearchForm from './SearchForm';
import ThemeSelector from './ThemeSelector';
import LanguageSelector from './LanguageSelector';
import { useLocale } from './LocaleProvider';
import { ui } from '@/lib/i18n';

export default function Navbar() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const isCurrent = (href: string) => href.startsWith('/') && (pathname === href || pathname.startsWith(`${href}/`));
  const allNavItems: Array<{ href: string; icon: HfIconName; label: string }> = [
    { href: '/models', icon: 'model', label: 'Models' },
    { href: '/datasets', icon: 'dataset', label: 'Datasets' },
    { href: '/spaces', icon: 'space', label: 'Spaces' },
    { href: '/skills', icon: 'skill', label: 'Skills' },
    { href: '/mcps', icon: 'mcp', label: 'MCPs' },
    { href: '/prompts', icon: 'prompt', label: 'Prompts' },
    { href: '/docs', icon: 'doc', label: 'Knowledge' },
    { href: '/characters', icon: 'character', label: 'Characters' },
  ];
  const primaryNavItems = allNavItems.filter((item) => ['/models', '/datasets', '/spaces', '/docs'].includes(item.href));
  const exploreNavItems = allNavItems.filter((item) => !primaryNavItems.includes(item));
  const exploreIsCurrent = exploreNavItems.some((item) => isCurrent(item.href));

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

        <nav className="ml-auto hidden items-center gap-4 text-sm font-medium text-zinc-900 xl:flex dark:text-zinc-100">
          {primaryNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? 'page' : undefined}
              className={`relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap transition ${
                isCurrent(item.href)
                  ? 'font-bold text-zinc-950 after:absolute after:inset-x-0 after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-teal-500 dark:text-white'
                  : 'text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white'
              }`}
            >
              <HfIcon name={item.icon} className="h-3.5 w-3.5 text-zinc-400" />
              {item.label}
            </Link>
          ))}
          <details className="openface-global-explore group relative">
            <summary
              className={`inline-flex h-8 cursor-pointer list-none items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold transition marker:hidden [&::-webkit-details-marker]:hidden ${
                exploreIsCurrent
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <HfIcon name="bars" className="h-3.5 w-3.5" />
              <span>Explore</span>
            </summary>
            <div className="absolute right-0 z-40 mt-3 hidden w-[640px] grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-6 rounded-xl border border-zinc-200 bg-white p-5 text-sm shadow-xl group-open:grid dark:border-zinc-700 dark:bg-zinc-900">
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{ui(locale, '開発ツール', 'Build tools')}</h2>
                <div className="grid grid-cols-2 gap-2">
                  {exploreNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isCurrent(item.href) ? 'page' : undefined}
                      className={`group/item flex min-h-24 items-center gap-3 rounded-xl border p-3 text-zinc-800 transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white hover:shadow-sm dark:text-zinc-100 dark:hover:border-teal-700 dark:hover:bg-zinc-800 ${
                        isCurrent(item.href)
                          ? 'border-teal-300 bg-teal-50/80 ring-1 ring-teal-200 dark:border-teal-700 dark:bg-teal-950/30 dark:ring-teal-900'
                          : 'border-zinc-200 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-800/70'
                      }`}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-zinc-200 transition group-hover/item:scale-105 dark:bg-zinc-900 dark:text-teal-300 dark:ring-zinc-700">
                        <HfIcon name={item.icon} className="h-6 w-6" />
                      </span>
                      <span className="font-bold">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="grid content-start gap-5">
                <div>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{ui(locale, 'コミュニティ', 'Community')}</h2>
                  <a href="/git/explore/repos" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">{ui(locale, 'リポジトリ', 'Repositories')}</a>
                  <a href="/git/explore/users" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">{ui(locale, 'ユーザー', 'Users')}</a>
                  <a href="https://github.com/Sunwood-ai-labs/OpenFace/issues" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">{ui(locale, '議論', 'Discussions')}</a>
                </div>
                <div>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{ui(locale, 'セルフホスト', 'Self-host')}</h2>
                  <a href="/git/repo/create" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">{ui(locale, 'リポジトリを作成', 'Create repository')}</a>
                  <a href="/git/user/settings" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">{ui(locale, '設定', 'Settings')}</a>
                  <a href="/git/admin" className="block rounded-lg px-2 py-1.5 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">{ui(locale, '管理', 'Administration')}</a>
                </div>
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
            {allNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent(item.href) ? 'page' : undefined}
                className="openface-mobile-nav-link flex items-center gap-3"
              >
                <HfIcon name={item.icon} className="h-4 w-4 text-zinc-400" />
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
