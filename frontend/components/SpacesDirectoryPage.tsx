import Link from 'next/link';
import { searchAllReposByTopicAndQuery, searchReposByTopicAndQuery, SortOption } from '@/lib/forgejo';
import { timeAgoEn } from '@/lib/format';
import { getSpaceTheme } from '@/lib/space-theme';
import HfIcon, { type HfIconName } from './HfIcon';
import SpaceStatusBadge from './SpaceStatusBadge';
import SpaceStatusProvider from './SpaceStatusProvider';
import { getRepoMetricsBatch } from '@/lib/agent-metrics';
import { getSpaceStatuses } from '@/lib/space-status';

const PAGE_SIZE = 48;

const compactName = (name: string) =>
  (name === 'realtime-voice-space' ? 'HF Realtime Voice' : name.replace(/-space$/i, ''))
    .split('-')
    .map((part) => {
      if (part.toLowerCase() === 'ocr') return 'OCR';
      if (part.toLowerCase() === 'scail2') return 'SCAIL 2';
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');

const withoutEmoji = (value: string) =>
  value.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s{2,}/g, ' ').trim();

const categoryItems: Array<{ label: string; icon: HfIconName }> = [
  { label: 'Image Generation', icon: 'image' },
  { label: 'Video Generation', icon: 'video' },
  { label: 'Text Generation', icon: 'filePen' },
  { label: 'Language Translation', icon: 'globe' },
  { label: 'Speech Synthesis', icon: 'microphone' },
  { label: '3D Modeling', icon: 'cube' },
  { label: 'Music Generation', icon: 'music' },
  { label: 'Object Detection', icon: 'eye' },
  { label: 'Text Analysis', icon: 'chart' },
  { label: 'Image Editing', icon: 'sparkles' },
  { label: 'Code Generation', icon: 'code' },
  { label: 'Question Answering', icon: 'sliders' },
];

export default async function SpacesDirectoryPage({
  searchParams,
}: {
  searchParams?: { q?: string; sort?: string; page?: string };
}) {
  const q = searchParams?.q?.trim() || undefined;
  const sort: SortOption = searchParams?.sort === 'stars' ? 'stars' : 'updated';
  const requestedPage = Number.parseInt(searchParams?.page || '1', 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = sort === 'stars'
    ? await searchAllReposByTopicAndQuery('space', q)
    : await searchReposByTopicAndQuery('space', q, sort, PAGE_SIZE, page);
  const repos = result.ok ? result.data : [];
  const targets = repos.map((repo) => ({
    owner: repo.owner?.login ?? repo.full_name.split('/')[0],
    repo: repo.name,
  }));
  const [metricsByRepo, spaceStatuses] = await Promise.all([
    getRepoMetricsBatch(targets),
    getSpaceStatuses(),
  ]);
  const rankedRepos = sort === 'stars'
    ? [...repos].sort((a, b) => {
        const likeDelta = (metricsByRepo[b.full_name]?.likes ?? 0) - (metricsByRepo[a.full_name]?.likes ?? 0);
        return likeDelta || b.updated_at.localeCompare(a.updated_at) || a.full_name.localeCompare(b.full_name);
      })
    : repos;
  const visibleRepos = sort === 'stars'
    ? rankedRepos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : rankedRepos;
  const querySuffix = q ? `&q=${encodeURIComponent(q)}` : '';
  const sortLabel = sort === 'stars' ? 'Most liked' : 'Relevance';
  const totalPages = Math.max(1, Math.ceil(result.total_count / PAGE_SIZE));
  const pageStart = result.total_count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, result.total_count);
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort !== 'updated') params.set('sort', sort);
    if (targetPage > 1) params.set('page', String(targetPage));
    const suffix = params.toString();
    return suffix ? `/spaces?${suffix}` : '/spaces';
  };

  return (
    <div className="openface-spaces-directory w-full overflow-x-hidden px-0 pt-8 [box-sizing:border-box]">
      <section className="mx-auto mb-[18px] max-w-[1536px] border-b border-zinc-100 px-4 pb-4">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="flex min-w-0 flex-nowrap items-center gap-x-2 gap-y-1 text-3xl font-bold tracking-tight text-zinc-900">
            <HfIcon name="space" className="h-6 w-6 text-orange-500" />
            <span>Spaces</span>
            <span className="text-zinc-300 max-sm:text-lg">·</span>
            <span className="text-zinc-500 max-sm:text-lg max-sm:font-medium">The AI App Directory</span>
          </h1>
          <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:flex-nowrap">
            <Link
              href="/new?type=space"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-zinc-900 px-3.5 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              <HfIcon name="plus" className="h-3.5 w-3.5" />
              New Space
            </Link>
            <a
              href="https://huggingface.co/docs/hub/spaces-overview"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <HfIcon name="file" className="h-3.5 w-3.5" />
              Learn more
            </a>
          </div>
        </div>
        <form action="/spaces" method="get" className="relative mt-6">
          <HfIcon name="sparkles" className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Ask anything you want to do with AI"
            className="h-12 w-full rounded-full border border-zinc-200 bg-white px-12 text-base text-zinc-700 shadow-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-100"
          />
          <HfIcon name="cube" className="absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
        </form>
        <div className="mt-2 flex gap-7 overflow-x-auto pb-5 pt-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categoryItems.map((category) => (
            <Link
              key={category.label}
              href={`/spaces?q=${encodeURIComponent(category.label.toLowerCase().replace(/\s+/g, '-'))}`}
              className="flex min-w-[92px] flex-col items-center justify-center gap-1.5 text-center text-[12px] leading-tight text-zinc-500 hover:text-zinc-900"
            >
              <HfIcon name={category.icon} className="h-5 w-5 text-zinc-400" />
              <span className="select-none">{category.label}</span>
            </Link>
          ))}
        </div>
      </section>
      <div className="mx-auto mb-7 flex max-w-[1536px] flex-wrap items-center gap-3 px-4 max-sm:mb-0 max-sm:gap-2">
        <h2 className="inline-flex h-[34px] min-w-0 items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-4 text-sm font-bold text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] max-sm:order-1 max-sm:px-3">
          <HfIcon name="fire" className="h-3.5 w-3.5 text-orange-500" />
          <span className="truncate">Spaces of the week</span>
        </h2>
        <span className="inline-flex h-[34px] min-w-0 items-center justify-center gap-3 whitespace-nowrap rounded-full border border-zinc-100 px-3 text-sm text-zinc-500 max-sm:order-4 max-sm:ml-auto">
          <HfIcon name="arrowLeft" className="h-3 w-3 text-zinc-300" />
          6 Jul 2026
          <HfIcon name="arrowRight" className="h-3 w-3 text-zinc-300" />
        </span>
        <form action="/spaces" method="get" className="relative ml-auto min-w-0 max-sm:hidden sm:w-full sm:max-w-[200px] lg:max-w-[202px]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Filter by name"
            className="h-[34px] w-full rounded-full border border-zinc-200 px-3 pl-9 text-xs placeholder-zinc-400 shadow-sm sm:px-4 sm:pl-10 sm:text-sm"
          />
          <HfIcon name="search" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        </form>
        <details name="spaces-toolbar-menu" className="group relative shrink-0 max-sm:order-2 max-sm:ml-auto">
          <summary className="inline-flex h-[34px] cursor-pointer list-none items-center justify-center gap-2 rounded-full border border-zinc-200 px-3 text-xs text-zinc-700 shadow-sm marker:hidden max-sm:w-8 max-sm:px-0 sm:text-sm [&::-webkit-details-marker]:hidden">
            <HfIcon name="filter" className="h-3.5 w-3.5" />
            <span className="max-sm:hidden">Filters (0)</span>
          </summary>
          <div className="absolute right-0 z-20 mt-2 hidden w-56 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg group-open:grid max-sm:left-0 max-sm:right-auto max-sm:w-56">
            <a href="/spaces" className="block rounded-lg px-3 py-2 font-medium text-zinc-800 hover:bg-zinc-50">All Spaces</a>
            <a href={`/spaces?q=voice&sort=${sort}`} className="block rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50">Voice apps</a>
            <a href={`/spaces?q=image&sort=${sort}`} className="block rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50">Image apps</a>
            <a href={`/spaces?q=document&sort=${sort}`} className="block rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50">Document apps</a>
          </div>
        </details>
        <details name="spaces-toolbar-menu" className="group relative shrink-0 max-sm:order-3">
          <summary className="inline-flex h-[34px] min-w-0 cursor-pointer list-none items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 text-xs text-zinc-700 shadow-sm marker:hidden sm:gap-2 sm:px-3 sm:text-sm [&::-webkit-details-marker]:hidden">
            <HfIcon name="sort" className="h-3.5 w-3.5" />
            <span className="truncate">Sort: {sortLabel}</span>
          </summary>
          <div className="absolute right-0 z-20 mt-2 hidden w-52 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg group-open:grid max-sm:left-0 max-sm:right-auto max-sm:w-52">
                <a href={`/spaces?sort=updated${querySuffix}`} className="block rounded-lg px-3 py-2 font-medium text-zinc-800 hover:bg-zinc-50">Relevance</a>
            <a href={`/spaces?sort=stars${querySuffix}`} className="block rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50">Most liked</a>
          </div>
        </details>
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
          Could not connect to Forgejo. Please try again shortly.
        </div>
      ) : (
        <SpaceStatusProvider initialStatuses={spaceStatuses}>
        <div className="mx-auto grid max-w-[1536px] grid-cols-1 gap-x-4 gap-y-5 px-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          {visibleRepos.map((repo) => {
            const owner = repo.owner?.login ?? repo.full_name.split('/')[0];
            const agents = repo.topics?.includes('agents') ?? false;
            const spaceTheme = getSpaceTheme(repo.full_name);
            const spaceHref = `/${owner}/${repo.name}`;
            const agentMetrics = metricsByRepo[repo.full_name] ?? { views: 0, likes: 0 };
            return (
              <article
                key={repo.id ?? repo.full_name}
                className={`group relative flex h-[168px] cursor-pointer flex-col overflow-hidden rounded-xl bg-gradient-to-br ${spaceTheme.gradient} text-white shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.10)] ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-zinc-950 focus-within:ring-offset-2`}
              >
                <Link href={spaceHref} className="absolute inset-0 z-0 rounded-xl" aria-label={`Open ${repo.full_name}`} />
                <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-2 pt-2.5">
                  <div className="mb-[18px] flex items-start gap-1.5 text-[11px] font-semibold leading-none text-white/90">
                    <SpaceStatusBadge owner={owner} repo={repo.name} />
                    {agents ? <Link href="/spaces?q=agents" className="pointer-events-auto hidden rounded bg-white/15 px-1.5 py-1 shadow-sm ring-1 ring-white/10 backdrop-blur hover:bg-white/25 min-[390px]:inline">Agents</Link> : null}
                    <Link href="/spaces?sort=stars" className="pointer-events-auto ml-auto inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-1 shadow-sm ring-1 ring-white/10 backdrop-blur hover:bg-white/25">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                      Featured
                    </Link>
                    <a href={`/git/${owner}/${repo.name}`} className="pointer-events-auto inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-1 shadow-sm ring-1 ring-white/10 backdrop-blur hover:bg-white/25">
                      <HfIcon name="heart" className="h-3 w-3" />
                      {agentMetrics.likes}
                    </a>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-[18px] font-bold leading-[23px] group-hover:underline">
                    <span className="shrink-0 text-xl" role="img" aria-label={`${repo.name} icon`}>{repo.space_emoji || '🚀'}</span>
                    <span className="truncate">{withoutEmoji(compactName(repo.name))}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-white/85">
                    {withoutEmoji(repo.description || 'AI application running on OpenFace')}
                  </p>
                </div>
                <div className="pointer-events-none relative z-10 mt-auto flex h-[33px] items-center justify-between gap-3 bg-black/10 px-4 text-xs font-medium text-white/85 backdrop-blur-sm">
                  <a href={`/git/${owner}`} className="pointer-events-auto flex min-w-0 items-center gap-1.5 hover:text-white" title={`Open ${owner} in Forgejo`}>
                    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold uppercase ring-1 ring-white/30">{owner.charAt(0)}</span>
                    <span className="truncate">{owner}</span>
                  </a>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex items-center gap-1" title={`${agentMetrics.views} views`}>
                      <HfIcon name="eye" className="h-3 w-3" />
                      {agentMetrics.views}
                    </span>
                    <span>{timeAgoEn(repo.updated_at)}</span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
        </SpaceStatusProvider>
      )}

      {result.ok && (
        <div className="mx-auto mt-7 flex max-w-[1536px] flex-wrap items-center gap-3 px-4 pb-10">
          <div>
            <h2 className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-800">
              <HfIcon name="bars" className="h-3.5 w-3.5 text-zinc-600" />
              Public CPU apps, trending first
            </h2>
            <p className="mt-2 pl-1 text-xs font-medium text-zinc-500">
              Showing {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {result.total_count.toLocaleString()} Spaces
            </p>
          </div>
          <nav aria-label="Spaces pagination" className="ml-auto flex items-center gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50">
                <HfIcon name="arrowLeft" className="h-3 w-3" />
                Previous
              </Link>
            ) : (
              <span aria-disabled="true" className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-100 bg-zinc-50 px-4 text-sm font-semibold text-zinc-300">
                <HfIcon name="arrowLeft" className="h-3 w-3" />
                Previous
              </span>
            )}
            <span className="inline-flex h-9 min-w-24 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-bold text-white">
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50">
                Next
                <HfIcon name="arrowRight" className="h-3 w-3" />
              </Link>
            ) : (
              <span aria-disabled="true" className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-100 bg-zinc-50 px-4 text-sm font-semibold text-zinc-300">
                Next
                <HfIcon name="arrowRight" className="h-3 w-3" />
              </span>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
