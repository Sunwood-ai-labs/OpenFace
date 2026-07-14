import Link from 'next/link';
import HfIcon from './HfIcon';
import type { RepoKind } from '@/lib/forgejo';

export default function DetailTabs({
  owner,
  repo,
  active,
  isSpace,
  kind,
  communityCount,
}: {
  owner: string;
  repo: string;
  active: 'card' | 'files';
  isSpace?: boolean;
  kind?: RepoKind | null;
  communityCount?: number;
}) {
  const filesHref = `/git/${owner}/${repo}/src/branch/main`;
  const cardLabel = isSpace
    ? 'App'
    : kind === 'dataset'
      ? 'Dataset card'
      : kind === 'skill'
        ? 'Skill card'
        : kind === 'mcp'
          ? 'MCP card'
          : kind === 'prompt'
            ? 'Prompt card'
          : 'Model card';
  const tabClass = (tab: string) =>
    `inline-flex min-h-12 items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold ${
      active === tab
        ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`;

  return (
    <div className="flex shrink-0 gap-1 max-sm:w-full max-sm:justify-end">
      <Link href={`/${owner}/${repo}?tab=card`} className={tabClass('card')}>
        <HfIcon name={isSpace ? 'space' : 'file'} className="h-3.5 w-3.5" />
        {cardLabel}
      </Link>
      <a href={filesHref} className={tabClass('files')}>
        <HfIcon name="folder" className="h-3.5 w-3.5" />
        Files
      </a>
      <a href={`/git/${owner}/${repo}/issues`} className={tabClass('community')}>
        <HfIcon name="link" className="h-3.5 w-3.5" />
        Community
        {typeof communityCount === 'number' && communityCount > 0 ? (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-500">
            {communityCount}
          </span>
        ) : null}
      </a>
    </div>
  );
}
