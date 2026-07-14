'use client';

import { FormEvent } from 'react';
import HfIcon from './HfIcon';

function targetForSearch(rawQuery: string) {
  const query = rawQuery.trim();
  const strip = (pattern: RegExp) => query.replace(pattern, '').trim();
  if (/^datasets?:/i.test(query)) return { path: '/datasets', query: strip(/^datasets?:\s*/i) };
  if (/^spaces?:/i.test(query)) return { path: '/spaces', query: strip(/^spaces?:\s*/i) };
  if (/^users?:/i.test(query)) return { path: '/git/explore/users', query: strip(/^users?:\s*/i) };
  if (/^repos?:/i.test(query)) return { path: '/git/explore/repos', query: strip(/^repos?:\s*/i) };
  return { path: '/models', query };
}

export default function SearchForm({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawQuery = String(data.get('q') || '');
    const target = targetForSearch(rawQuery);
    window.location.href = target.query ? `${target.path}?q=${encodeURIComponent(target.query)}` : target.path;
  };

  return (
    <form action="/search" method="get" className={className} onSubmit={submit}>
      <div className="relative">
        <input
          type="search"
          name="q"
          placeholder="Search models, datasets, users..."
          className={
            compact
              ? 'h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 pl-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-200'
              : 'h-9 w-full rounded-lg border border-zinc-200 bg-white px-4 pl-10 text-sm text-zinc-900 shadow-sm placeholder-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
          }
        />
        <span className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-zinc-400">
          <HfIcon name="search" className="h-3.5 w-3.5" />
        </span>
      </div>
    </form>
  );
}
