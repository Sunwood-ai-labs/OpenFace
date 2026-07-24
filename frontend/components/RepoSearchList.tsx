import Link from 'next/link';
import { Repo } from '@/lib/forgejo';
import { timeAgoEn, timeAgoJa } from '@/lib/format';
import { Locale, ui } from '@/lib/i18n';
import { nonTypeTopics, repoPromptVersion } from '@/lib/forgejo';
import HfIcon from './HfIcon';

export default function RepoSearchList({
  repos,
  kind,
  emptyMessage,
  locale,
}: {
  repos: Repo[];
  kind: 'model' | 'dataset' | 'skill' | 'mcp' | 'prompt' | 'benchmark';
  emptyMessage?: string;
  locale: Locale;
}) {
  if (!repos || repos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
        {emptyMessage || ui(locale, 'リポジトリが見つかりません。', 'No repositories found.')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-5 xl:grid-cols-2">
      {repos.map((repo) => {
        const owner = repo.owner?.login ?? repo.full_name.split('/')[0];
        const badges = nonTypeTopics(repo.topics).slice(0, 2);
        const promptVersion = kind === 'prompt' ? repoPromptVersion(repo.topics) : null;
        const dependencyCount = kind === 'skill' ? repo.skill_relationships?.dependencies.length || 0 : 0;
        const basePath = kind === 'dataset' ? '/datasets' : kind === 'skill' ? '/skills' : kind === 'mcp' ? '/mcps' : kind === 'prompt' ? '/prompts' : kind === 'benchmark' ? '/benchmarks' : '/models';
        const primaryBadge = badges[0] || (kind === 'dataset' ? 'Viewer' : kind === 'skill' ? 'Codex skill' : kind === 'mcp' ? 'MCP server' : kind === 'prompt' ? 'Prompt' : kind === 'benchmark' ? 'Evaluation suite' : 'Text Generation');
        const secondaryBadge = badges[1];
        const iconTheme = kind === 'dataset'
          ? 'rounded bg-emerald-50 text-emerald-700'
          : kind === 'skill'
            ? 'rounded-lg bg-violet-50 text-violet-700'
            : kind === 'mcp'
              ? 'rounded-lg bg-cyan-50 text-cyan-700'
              : kind === 'prompt'
                ? 'rounded-lg bg-orange-50 text-orange-700'
              : kind === 'benchmark'
                ? 'rounded-lg bg-sky-50 text-sky-700'
              : 'rounded-full bg-amber-50 text-amber-700';
        return (
          <article
            key={repo.id ?? repo.full_name}
            className={`block overflow-hidden rounded-lg border bg-white px-3 py-2 transition hover:bg-zinc-50 hover:shadow-sm ${
              kind === 'benchmark' ? 'h-[76px] border-sky-100 hover:border-sky-200' : 'h-[62px] border-zinc-100 hover:border-zinc-200'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`inline-flex h-5 w-5 items-center justify-center ${iconTheme}`}>
                <HfIcon name={kind} className="h-3 w-3" />
              </span>
              <Link href={`/${owner}/${repo.name}`} className="truncate font-mono text-[15px] font-semibold leading-5 text-zinc-900 hover:underline">
                {repo.full_name}
              </Link>
              {promptVersion ? <span className="shrink-0 rounded-full bg-orange-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-orange-800">{promptVersion}</span> : null}
              {kind === 'skill' ? (
                <span
                  data-skill-dependency-count
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${dependencyCount ? 'bg-violet-100 text-violet-700' : 'bg-zinc-100 text-zinc-500'}`}
                  title={dependencyCount ? ui(locale, `${dependencyCount}件の根拠付きスキル連携`, `${dependencyCount} evidence-backed Skill workflow links`) : ui(locale, 'スキル連携は未設定です', 'No Skill workflow links declared')}
                >
                  <HfIcon name="link" className="h-2.5 w-2.5" />
                  {dependencyCount ? ui(locale, `${dependencyCount}件`, `${dependencyCount} links`) : ui(locale, '単独', 'Standalone')}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-zinc-400">
              <p className="min-w-0 flex-1 truncate">
                <Link href={`${basePath}?q=${encodeURIComponent(primaryBadge)}`} className="text-zinc-500 hover:text-zinc-800 hover:underline">
                  {primaryBadge}
                </Link>
                {secondaryBadge ? (
                  <>
                    {' · '}
                    <Link href={`${basePath}?q=${encodeURIComponent(secondaryBadge)}`} className="hover:text-zinc-800 hover:underline">
                      {secondaryBadge}
                    </Link>
                  </>
                ) : null}
                {' · '}{ui(locale, `更新 ${timeAgoJa(repo.updated_at)}`, `Updated ${timeAgoEn(repo.updated_at)}`)}
                {repo.description ? ` · ${repo.description}` : ''}
              </p>
              <a href={`/git/${owner}/${repo.name}/forks`} className="hidden shrink-0 items-center gap-1 text-xs hover:text-zinc-700 sm:inline-flex" title="Forks">
                <HfIcon name="fork" className="h-3 w-3" />
                {repo.forks_count ?? 0}
              </a>
              <a href={`/git/${owner}/${repo.name}`} className="hidden shrink-0 items-center gap-1 text-xs hover:text-zinc-700 sm:inline-flex" title="Likes">
                <HfIcon name="heart" className="h-3 w-3" />
                {repo.stars_count ?? 0}
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}
