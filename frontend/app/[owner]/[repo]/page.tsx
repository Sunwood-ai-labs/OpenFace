import { notFound } from 'next/navigation';
import {
  getRepo,
  getPagesSource,
  getReadme,
  getContents,
  getCommits,
  getRepoTags,
  searchRepos,
  getTextFile,
  cloneUrl,
  forgejoRepoUrl,
  forgejoTreeUrl,
  forgejoRawUrl,
  nonTypeTopics,
  repoPromptVersion,
  repoKind,
  ContentEntry,
  RepoKind,
} from '@/lib/forgejo';
import { parseReadme } from '@/lib/markdown';
import { timeAgoEn } from '@/lib/format';
import DetailTabs from '@/components/DetailTabs';
import CardBadges from '@/components/CardBadges';
import CloneBlock from '@/components/CloneBlock';
import FileTree from '@/components/FileTree';
import SpaceRunner from '@/components/SpaceRunner';
import SpaceStatusBadge from '@/components/SpaceStatusBadge';
import HfIcon, { HfIconName } from '@/components/HfIcon';
import { getRepoMetrics } from '@/lib/agent-metrics';
import RepoViewCount from '@/components/RepoViewCount';
import PromptRevisionSwitcher from '@/components/PromptRevisionSwitcher';
import SkillRelationshipMap from '@/components/SkillRelationshipMap';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const repoInfo = await getRepo(owner, repo);
  const kind = repoInfo ? repoKind(repoInfo.topics) : null;
  const label = kind === 'space' ? 'Space' : kind === 'dataset' ? 'Dataset' : kind === 'skill' ? 'Skill' : kind === 'mcp' ? 'MCP server' : kind === 'prompt' ? 'Prompt' : 'Model';
  const repoName = repoInfo?.full_name || `${owner}/${repo}`;
  return {
    title: `${repoName} - ${label} - OpenFace`,
    description: repoInfo?.description || `${repoName} on OpenFace.`,
  };
}

const KIND_ICON: Record<string, HfIconName> = {
  model: 'model',
  dataset: 'dataset',
  space: 'space',
  skill: 'skill',
  mcp: 'mcp',
  prompt: 'prompt',
};

export default async function RepoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ tab?: string; path?: string; revision?: string }>;
}) {
  const [{ owner, repo }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const tab = resolvedSearchParams.tab === 'files' ? 'files' : 'card';
  const path = resolvedSearchParams.path || '';

  const repoInfo = await getRepo(owner, repo);

  if (!repoInfo) {
    // Forgejo may be unreachable, or repo genuinely doesn't exist.
    // Render a graceful empty-state rather than throwing during SSR.
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <p className="mb-2 text-lg font-semibold">Repository not found</p>
        <p className="text-sm">
          {owner}/{repo} does not exist or Forgejo is not reachable.
        </p>
      </div>
    );
  }

  const kind = repoKind(repoInfo.topics);
  const topicBadges = nonTypeTopics(repoInfo.topics);
  const promptVersion = kind === 'prompt' ? repoPromptVersion(repoInfo.topics) : null;
  const isSpace = kind === 'space';
  const [agentMetrics, pagesSource, promptTags, skillCatalog] = await Promise.all([
    isSpace ? getRepoMetrics(owner, repo) : Promise.resolve(null),
    getPagesSource(owner, repo, repoInfo.default_branch || 'main'),
    kind === 'prompt' ? getRepoTags(owner, repo) : Promise.resolve([]),
    kind === 'skill' ? searchRepos({ topic: 'skill', limit: 100 }) : Promise.resolve(null),
  ]);
  const requestedRevision = resolvedSearchParams.revision?.trim() || null;
  const selectedRevision = requestedRevision && promptTags.some((tag) => tag.name === requestedRevision)
    ? requestedRevision
    : null;
  const kindLabel = isSpace ? 'Spaces' : kind === 'dataset' ? 'Datasets' : kind === 'skill' ? 'Skills' : kind === 'mcp' ? 'MCPs' : kind === 'prompt' ? 'Prompts' : 'Models';
  const kindHref = isSpace ? '/spaces' : kind === 'dataset' ? '/datasets' : kind === 'skill' ? '/skills' : kind === 'mcp' ? '/mcps' : kind === 'prompt' ? '/prompts' : '/models';
  const kindIcon = kind ? KIND_ICON[kind] : 'box';
  const isSpaceApp = isSpace && tab === 'card';

  return (
    <div className={isSpaceApp ? 'openface-space-app-page' : ''}>
      <div className={`openface-repo-header flex flex-wrap items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 ${isSpaceApp ? 'openface-space-app-header mb-0' : 'mb-6 max-sm:block'}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2 py-3 max-sm:flex-wrap">
          <a
            href={kindHref}
            aria-label={`Back to ${kindLabel}`}
            title={`Back to ${kindLabel}`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <HfIcon name={kindIcon} className="h-4 w-4" />
          </a>
          <h1 className={`flex min-w-0 items-center gap-1 text-lg font-bold max-sm:w-[calc(100%-1.5rem)] ${isSpaceApp ? 'max-sm:flex-nowrap max-sm:text-base' : 'max-sm:flex-wrap'}`}>
            <a
              href={kindHref}
              className={`shrink-0 text-zinc-500 hover:text-zinc-950 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100 ${isSpaceApp ? 'max-sm:hidden' : ''}`}
            >
              {kindLabel}:
            </a>
            <a href={`/git/${owner}`} className="text-zinc-500 hover:underline dark:text-zinc-400">{owner}</a>
            <span className="shrink-0 text-zinc-300">/</span>
            <span className={`min-w-0 font-mono text-zinc-950 dark:text-zinc-100 ${isSpaceApp ? 'truncate' : 'break-words'}`}>{repoInfo.name}</span>
          </h1>
          <a
            href={forgejoRepoUrl(owner, repo)}
            title={isSpace ? `${agentMetrics?.likes ?? 0} agent likes` : 'Open the Forgejo repository to like this project'}
            className="ml-2 inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            <HfIcon name="heart" className="h-3 w-3" />
            {isSpace ? `${agentMetrics?.likes ?? 0} likes` : 'like'}
          </a>
          {isSpace ? (
            <RepoViewCount owner={owner} repo={repo} initialViews={agentMetrics?.views ?? 0} />
          ) : (
            <a href={forgejoRepoUrl(owner, repo)} className="inline-flex h-8 items-center rounded-lg border border-zinc-100 px-2.5 text-xs text-zinc-500 hover:bg-zinc-50">
              {repoInfo.stars_count ?? 0}
            </a>
          )}
          {isSpace ? (
            <SpaceStatusBadge owner={owner} repo={repo} variant="header" />
          ) : null}
        </div>
        <div className={isSpaceApp ? 'max-sm:hidden' : ''}>
          <DetailTabs owner={owner} repo={repo} active={tab} isSpace={isSpace} kind={kind} communityCount={repoInfo.open_issues_count} revision={selectedRevision} />
        </div>
      </div>

      {!isSpace && (
        <div className="mb-6">
          {repoInfo.description && (
            <p className="text-zinc-600 dark:text-zinc-400">{repoInfo.description}</p>
          )}
          {promptVersion ? (
            <a href={`${kindHref}?q=${encodeURIComponent(`version-${promptVersion}`)}`} className="mt-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 font-mono text-xs font-bold text-orange-800 hover:bg-orange-100">
              <HfIcon name="prompt" className="h-3 w-3" /> Current release {promptVersion}
            </a>
          ) : null}
          {kind === 'prompt' && promptTags.length > 0 ? (
            <PromptRevisionSwitcher owner={owner} repo={repo} tags={promptTags} selectedRevision={selectedRevision} />
          ) : null}
          {topicBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {topicBadges.map((t) => (
                <a
                  key={t}
                  href={`${kindHref}?q=${encodeURIComponent(t)}`}
                  className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {t}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {isSpaceApp && (
        <div className="openface-space-app-runner">
          <SpaceRunner owner={owner} repo={repo} description={repoInfo.description} />
        </div>
      )}

      {!isSpaceApp && <div className={tab === 'files' ? '' : 'grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]'}>
        <div className="min-w-0">
          {tab === 'card' ? (
            <CardTabContent
              owner={owner}
              repo={repo}
              kind={kind}
              defaultBranch={repoInfo.default_branch || 'main'}
              revision={selectedRevision}
              skillRepo={kind === 'skill' ? repoInfo : null}
              skillCatalog={skillCatalog?.data || []}
            />
          ) : (
            <FilesTabContent
              owner={owner}
              repo={repo}
              path={path}
              defaultBranch={repoInfo.default_branch || 'main'}
              updatedAt={repoInfo.updated_at}
            />
          )}
        </div>

        {tab === 'card' && <aside className="flex flex-col gap-4">
          {kind === 'skill' ? (
            <div className="hidden lg:block">
              <SkillRelationshipMap repo={repoInfo} catalog={skillCatalog?.data || []} placement="sidebar" />
            </div>
          ) : null}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {isSpace ? 'Space actions' : kind === 'dataset' ? 'Dataset actions' : kind === 'skill' ? 'Skill actions' : kind === 'mcp' ? 'MCP actions' : kind === 'prompt' ? 'Prompt actions' : 'Model actions'}
            </p>
            <div className="grid gap-2">
              {isSpace ? (
                <>
                  <a href={`/${owner}/${repo}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                    <HfIcon name="play" className="h-3.5 w-3.5" />
                    Open app
                  </a>
                  <a href={`/new?type=space&template=${encodeURIComponent(`${owner}/${repo}`)}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <HfIcon name="fork" className="h-3.5 w-3.5" />
                    Duplicate Space
                  </a>
                </>
              ) : kind === 'dataset' ? (
                <>
                  <a href={`/${owner}/${repo}?tab=files`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                    <HfIcon name="table" className="h-3.5 w-3.5" />
                    Preview dataset
                  </a>
                  <a href={forgejoRepoUrl(owner, repo)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <HfIcon name="download" className="h-3.5 w-3.5" />
                    Use this dataset
                  </a>
                </>
              ) : kind === 'skill' ? (
                <>
                  <a href={`/${owner}/${repo}?tab=files`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 text-sm font-semibold text-white hover:bg-violet-800">
                    <HfIcon name="skill" className="h-3.5 w-3.5" />
                    Inspect SKILL.md
                  </a>
                  <a href={forgejoRepoUrl(owner, repo)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <HfIcon name="download" className="h-3.5 w-3.5" />
                    Install this skill
                  </a>
                </>
              ) : kind === 'mcp' ? (
                <>
                  <a href={`/${owner}/${repo}?tab=files`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3 text-sm font-semibold text-white hover:bg-cyan-800">
                    <HfIcon name="mcp" className="h-3.5 w-3.5" />
                    Inspect server
                  </a>
                  <a href={forgejoRepoUrl(owner, repo)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <HfIcon name="code" className="h-3.5 w-3.5" />
                    Configure MCP
                  </a>
                </>
              ) : kind === 'prompt' ? (
                <>
                  <a href={selectedRevision ? forgejoTreeUrl(owner, repo, '', selectedRevision, 'tag') : `/${owner}/${repo}?tab=files`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-orange-700 px-3 text-sm font-semibold text-white hover:bg-orange-800">
                    <HfIcon name="prompt" className="h-3.5 w-3.5" />
                    Inspect prompt source
                  </a>
                  <a href={forgejoRepoUrl(owner, repo)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <HfIcon name="fork" className="h-3.5 w-3.5" />
                    Fork this prompt
                  </a>
                </>
              ) : (
                <>
                  <a href={forgejoRepoUrl(owner, repo)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                    <HfIcon name="play" className="h-3.5 w-3.5" />
                    Use this model
                  </a>
                  <a href={`/${owner}/${repo}?tab=files`} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                    <HfIcon name="code" className="h-3.5 w-3.5" />
                    Deploy
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <CloneBlock cloneUrl={cloneUrl(owner, repo)} />
          </div>

          {pagesSource ? (
            <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 dark:border-indigo-900 dark:from-indigo-950/30 dark:to-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">OpenFace Pages</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Static site from {pagesSource === 'gh-pages' ? 'the gh-pages branch' : 'docs/ on the default branch'}.</p>
              <a href={`/pages/${owner}/${repo}/`} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-indigo-800 hover:shadow-md">
                <HfIcon name="globe" className="h-3.5 w-3.5" /> Visit site
              </a>
            </div>
          ) : null}

          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Stats
            </p>
            <ul className="space-y-2 text-zinc-600 dark:text-zinc-400">
              <li><a href={forgejoRepoUrl(owner, repo)} className="flex items-center gap-2 hover:text-zinc-900"><HfIcon name="star" className="h-3.5 w-3.5 text-zinc-400" />Stars: {repoInfo.stars_count ?? 0}</a></li>
              <li><a href={`/git/${owner}/${repo}/forks`} className="flex items-center gap-2 hover:text-zinc-900"><HfIcon name="fork" className="h-3.5 w-3.5 text-zinc-400" />Forks: {repoInfo.forks_count ?? 0}</a></li>
              <li><a href={forgejoRepoUrl(owner, repo)} className="flex items-center gap-2 hover:text-zinc-900"><HfIcon name="eye" className="h-3.5 w-3.5 text-zinc-400" />Watchers: {repoInfo.watchers_count ?? 0}</a></li>
              <li className="flex items-center gap-2" title={repoInfo.updated_at}>
                <HfIcon name="clock" className="h-3.5 w-3.5 text-zinc-400" />Updated {timeAgoEn(repoInfo.updated_at)}
              </li>
            </ul>
          </div>

          <a
            href={forgejoRepoUrl(owner, repo)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-center text-sm font-semibold text-zinc-700 hover:border-amber-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <HfIcon name="link" className="h-3.5 w-3.5" />
            Open in Forgejo
          </a>
        </aside>}
      </div>}
    </div>
  );
}

async function CardTabContent({
  owner,
  repo,
  kind,
  defaultBranch,
  revision,
  skillRepo,
  skillCatalog,
}: {
  owner: string;
  repo: string;
  kind: RepoKind | null;
  defaultBranch: string;
  revision?: string | null;
  skillRepo: import('@/lib/forgejo').Repo | null;
  skillCatalog: import('@/lib/forgejo').Repo[];
}) {
  const ref = revision || defaultBranch;
  const refKind = revision ? 'tag' : 'branch';
  const [readmeRaw, taggedPromptRaw] = await Promise.all([
    getReadme(owner, repo, ref),
    kind === 'prompt' && revision ? getTextFile(owner, repo, 'PROMPT.md', revision) : Promise.resolve(null),
  ]);
  const renderedRaw = taggedPromptRaw || readmeRaw;
  const { frontmatter, bodyHtml } = parseReadme(renderedRaw, {
    assetBaseUrl: forgejoRawUrl(owner, repo, '', ref, refKind),
    relativeLinkBaseUrl: revision
      ? forgejoTreeUrl(owner, repo, '', revision, 'tag') + '/'
      : `/${owner}/${repo}/blob/`,
  });

  if (!renderedRaw) {
    return (
      <div>
        {kind === 'skill' && skillRepo ? (
          <div className="mb-7 lg:hidden">
            <SkillRelationshipMap repo={skillRepo} catalog={skillCatalog} placement="mobile" />
          </div>
        ) : null}
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          README.md was not found. Skill relationships remain available from <code>openface.skill.json</code>.
        </div>
      </div>
    );
  }

  return (
    <div>
      {kind === 'prompt' && revision ? (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-950 dark:bg-orange-950/20 dark:text-orange-200">
          <HfIcon name="prompt" className="h-4 w-4 shrink-0" />
          <span><strong className="font-mono">{revision}</strong> のGit tagに保存された <code>PROMPT.md</code> 原文を表示しています。</span>
        </div>
      ) : null}
      <CardBadges frontmatter={frontmatter} basePath={kind === 'dataset' ? '/datasets' : kind === 'space' ? '/spaces' : kind === 'skill' ? '/skills' : kind === 'mcp' ? '/mcps' : kind === 'prompt' ? '/prompts' : '/models'} />
      {kind === 'skill' && skillRepo ? (
        <div className="mb-7 lg:hidden">
          <SkillRelationshipMap repo={skillRepo} catalog={skillCatalog} placement="mobile" />
        </div>
      ) : null}
      <div
        className={kind === 'skill' || kind === 'prompt'
          ? 'github-markdown-body prose-openface min-w-0 bg-white dark:bg-zinc-900'
          : 'prose-openface min-w-0 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900'}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  );
}

async function FilesTabContent({
  owner,
  repo,
  path,
  defaultBranch,
  updatedAt,
}: {
  owner: string;
  repo: string;
  path: string;
  defaultBranch: string;
  updatedAt: string;
}) {
  const [res, commits] = await Promise.all([
    getContents(owner, repo, path),
    getCommits(owner, repo, path, 8),
  ]);

  if (!res.ok || !res.data) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        Could not load files.
      </div>
    );
  }

  const entries: ContentEntry[] = Array.isArray(res.data) ? res.data : [res.data];

  return (
    <FileTree
      owner={owner}
      repo={repo}
      currentPath={path}
      entries={entries}
      branch={defaultBranch}
      commits={commits}
      updatedAt={updatedAt}
      forgejoUrl={forgejoTreeUrl(owner, repo, path, defaultBranch)}
      cloneUrl={cloneUrl(owner, repo)}
    />
  );
}
