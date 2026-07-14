import { searchReposByTopicAndQuery, SortOption, RepoKind } from '@/lib/forgejo';
import HfIcon, { HfIconName } from './HfIcon';
import FilterRail from './FilterRail';
import RepoSearchList from './RepoSearchList';

export interface ListingPageProps {
  topic: RepoKind;
  title: string;
  icon: HfIconName;
  placeholder: string;
  searchParams?: { q?: string; sort?: string };
}

export default async function ListingPage({
  topic,
  title,
  icon,
  placeholder,
  searchParams,
}: ListingPageProps) {
  const q = searchParams?.q?.trim() || undefined;
  const sort: SortOption = searchParams?.sort === 'stars' ? 'stars' : 'updated';
  const basePath = `/${topic}s`;
  const querySuffix = q ? `&q=${encodeURIComponent(q)}` : '';
  const filterHref = (term: string) => `${basePath}?q=${encodeURIComponent(term)}&sort=${sort}`;

  const result = await searchReposByTopicAndQuery(topic, q, sort, 50);
  const iconTone = topic === 'dataset' ? 'text-emerald-600' : topic === 'skill' ? 'text-violet-600' : topic === 'mcp' ? 'text-cyan-600' : topic === 'prompt' ? 'text-orange-600' : 'text-amber-600';
  const createLabel = topic === 'dataset' ? 'Dataset' : topic === 'space' ? 'Space' : topic === 'skill' ? 'Skill' : topic === 'mcp' ? 'MCP server' : topic === 'prompt' ? 'Prompt' : 'Model';
  const mobileFilters = topic === 'dataset'
    ? ['Audio', 'Image', 'Text', 'Tabular', 'parquet', 'Benchmark']
    : topic === 'skill'
      ? ['Codex', 'Automation', 'Design', 'Developer tools', 'Workflow']
      : topic === 'mcp'
        ? ['TypeScript', 'Python', 'API', 'Search', 'Developer tools']
        : topic === 'prompt'
          ? ['Goal command', 'Coding agent', 'Workflow', 'version-v7', 'version-v8']
        : ['Text Generation', 'Image-to-Text', 'Safetensors', 'Transformers', 'GGUF', 'vLLM'];

  return (
    <div className="mx-auto grid min-w-0 max-w-[1536px] gap-8 px-4 lg:grid-cols-[422px_minmax(0,1fr)]">
      <FilterRail topic={topic === 'space' ? 'model' : topic} />
      <div className="min-w-0 lg:pt-[34px]">
        <div className="mb-6 flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <HfIcon name={icon} className={`h-5 w-5 ${iconTone}`} />
            {title}
          </h1>
          <span className="text-zinc-400">{result.ok ? result.total_count : 0}</span>
          <form action={`/${topic}s`} method="get" className="relative ml-4 hidden w-[224px] lg:block">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder={placeholder}
              className="h-7 w-full rounded-full border border-zinc-200 px-3 pl-9 text-sm placeholder-zinc-400 shadow-sm focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-100"
            />
            <HfIcon name="search" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input type="hidden" name="sort" value={sort} />
          </form>
          <form action={`/${topic}s`} method="get" className="relative order-3 ml-0 w-full lg:order-none lg:hidden">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder={placeholder}
              className="h-7 w-full rounded-full border border-zinc-200 px-4 pl-10 text-sm placeholder-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-100"
            />
            <HfIcon name="search" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input type="hidden" name="sort" value={sort} />
          </form>
          <div className="order-4 ml-0 flex w-full min-w-0 flex-row flex-wrap gap-2 sm:order-2 sm:ml-auto sm:w-auto sm:justify-end lg:order-none lg:gap-2">
            <a
              href={`/new?type=${topic}`}
              className="hidden w-full rounded-lg bg-zinc-950 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-zinc-800 sm:w-auto"
            >
              New {createLabel}
            </a>
            {topic === 'model' && <a href={filterHref('base')} className="inline-flex h-[30px] w-auto items-center rounded-full border border-zinc-200 px-3 text-center text-sm text-zinc-600 hover:bg-zinc-50">Base only</a>}
            {topic === 'model' && <a href={filterHref('inference')} className="inline-flex h-[30px] w-auto items-center rounded-full border border-zinc-200 px-3 text-center text-sm text-zinc-600 hover:bg-zinc-50">Inference Available</a>}
            {topic === 'dataset' && <a href={filterHref(q || 'text')} className="inline-flex h-[30px] w-auto items-center rounded-full border border-zinc-200 px-3 text-center text-sm text-zinc-600 hover:bg-zinc-50">Full-text search</a>}
            <details name={`${topic}-add-filter-menu`} className="group relative w-auto lg:hidden">
              <summary className="inline-flex h-[30px] w-auto cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 marker:hidden hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
                <HfIcon name="sliders" className="h-3.5 w-3.5" />
                Add filters
              </summary>
              <div className="absolute left-0 right-auto z-20 mt-2 hidden w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg group-open:grid sm:left-auto sm:right-0 sm:w-56">
                {mobileFilters.map((term) => (
                  <a key={term} href={filterHref(term)} className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">
                    {term}
                  </a>
                ))}
              </div>
            </details>
            <details name={`${topic}-toolbar-menu`} className="group relative w-auto">
              <summary className="inline-flex h-[30px] w-auto cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 marker:hidden hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
                <HfIcon name="sort" className="h-3.5 w-3.5" />
                Sort: {sort === 'stars' ? 'Most liked' : 'Trending'}
              </summary>
              <div className="absolute left-0 right-auto z-20 mt-2 hidden w-full rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg group-open:grid sm:left-auto sm:right-0 sm:w-52">
                <a href={`${basePath}?sort=updated${querySuffix}`} className="rounded-lg px-3 py-2 font-medium text-zinc-800 hover:bg-zinc-50">Trending</a>
                <a href={`${basePath}?sort=stars${querySuffix}`} className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50">Most liked</a>
              </div>
            </details>
          </div>
        </div>

        {!result.ok ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Could not connect to Forgejo. Please try again shortly.
          </div>
        ) : (
          <RepoSearchList
            repos={result.data}
            kind={topic === 'dataset' ? 'dataset' : topic === 'skill' ? 'skill' : topic === 'mcp' ? 'mcp' : topic === 'prompt' ? 'prompt' : 'model'}
            emptyMessage={`No ${title.toLowerCase()} yet.`}
          />
        )}
      </div>
    </div>
  );
}
