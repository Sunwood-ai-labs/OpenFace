import Link from 'next/link';
import { nonTypeTopics, Repo, searchReposByTopicAndQuery, SortOption } from '@/lib/forgejo';
import { timeAgoEn } from '@/lib/format';
import HfIcon, { HfIconName } from './HfIcon';

type DocFormat = 'article' | 'wiki' | 'guide' | 'reference';

const formats: Array<{
  value: DocFormat;
  label: string;
  description: string;
  icon: HfIconName;
}> = [
  { value: 'article', label: 'Articles', description: 'Context, decisions, and field notes', icon: 'filePen' },
  { value: 'wiki', label: 'Wiki', description: 'Connected concepts and system maps', icon: 'model' },
  { value: 'guide', label: 'Guides', description: 'Procedures you can follow end to end', icon: 'arrowRight' },
  { value: 'reference', label: 'Reference', description: 'Stable facts, contracts, and glossaries', icon: 'file' },
];

function docFormat(repo: Repo): DocFormat {
  const topics = repo.topics || [];
  return formats.find((format) => topics.includes(format.value))?.value || 'reference';
}

function docHref(repo: Repo) {
  const owner = repo.owner?.login ?? repo.full_name.split('/')[0];
  return `/${owner}/${repo.name}`;
}

function formatLabel(value: DocFormat) {
  return formats.find((format) => format.value === value)?.label || 'Reference';
}

function DocCard({ repo, index }: { repo: Repo; index: number }) {
  const format = docFormat(repo);
  const topics = nonTypeTopics(repo.topics).filter((topic) => topic !== format).slice(0, 3);

  return (
    <article className="group relative min-w-0 border-t border-zinc-200 py-5 transition-colors hover:bg-[#f4f0e8] dark:border-zinc-800 dark:hover:bg-zinc-900/80 sm:grid sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:gap-4 sm:px-3">
      <span className="mb-3 block font-mono text-[11px] font-bold tracking-[0.18em] text-orange-700 dark:text-orange-400 sm:mb-0 sm:pt-1">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
          <span className="text-teal-800 dark:text-teal-300">{formatLabel(format)}</span>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-zinc-500 dark:text-zinc-400">Updated {timeAgoEn(repo.updated_at)}</span>
        </div>
        <Link href={docHref(repo)} className="block font-serif text-2xl font-semibold leading-tight text-zinc-950 transition group-hover:text-teal-900 dark:text-zinc-100 dark:group-hover:text-teal-200">
          {repo.name.replace(/-/g, ' ')}
        </Link>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {repo.description || 'Open this document to read the complete entry.'}
        </p>
        {topics.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {topics.map((topic) => (
              <Link key={topic} href={`/docs?q=${encodeURIComponent(topic)}`} className="font-mono text-[11px] uppercase tracking-wide text-zinc-500 hover:text-teal-800 hover:underline dark:text-zinc-400 dark:hover:text-teal-300">
                #{topic}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <Link href={docHref(repo)} aria-label={`Read ${repo.name}`} className="mt-4 inline-flex h-9 items-center gap-2 self-center border border-zinc-300 px-3 text-xs font-bold uppercase tracking-wide text-zinc-700 transition hover:border-teal-800 hover:bg-teal-900 hover:text-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-teal-300 dark:hover:bg-teal-300 dark:hover:text-zinc-950 sm:mt-0">
        Read <HfIcon name="arrowRight" className="h-3 w-3" />
      </Link>
    </article>
  );
}

export default async function DocsDirectoryPage({
  searchParams,
}: {
  searchParams?: { q?: string; sort?: string; type?: string };
}) {
  const q = searchParams?.q?.trim() || undefined;
  const sort: SortOption = searchParams?.sort === 'stars' ? 'stars' : 'updated';
  const selectedFormat = formats.some((format) => format.value === searchParams?.type)
    ? searchParams?.type as DocFormat
    : undefined;
  const result = await searchReposByTopicAndQuery('doc', q, sort, 100);
  const docs = selectedFormat
    ? result.data.filter((repo) => docFormat(repo) === selectedFormat)
    : result.data;
  const featured = docs.find((repo) => docFormat(repo) === 'article') || docs[0];
  const remaining = featured ? docs.filter((repo) => repo.full_name !== featured.full_name) : docs;
  const topicCount = new Set(result.data.flatMap((repo) => nonTypeTopics(repo.topics).filter((topic) => !formats.some((format) => format.value === topic)))).size;
  const formatHref = (value?: DocFormat) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort !== 'updated') params.set('sort', sort);
    if (value) params.set('type', value);
    const suffix = params.toString();
    return `/docs${suffix ? `?${suffix}` : ''}`;
  };

  return (
    <div className="openface-docs-directory -mx-4 -mt-6 min-h-screen bg-[#fbfaf6] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 sm:-mx-6 lg:-mx-8">
      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(39,39,42,.08)_1px,transparent_1px)] [background-size:80px_100%] dark:opacity-20" />
        <div className="relative mx-auto grid max-w-[1440px] gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end lg:px-12">
          <div>
            <div className="mb-5 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700 dark:text-orange-400">
              <span className="h-px w-10 bg-current" /> OpenFace Docs Library
            </div>
            <h1 className="max-w-4xl font-serif text-[clamp(3.25rem,8vw,7.5rem)] font-semibold leading-[0.82] tracking-[-0.055em]">
              Read broadly.<br />Navigate precisely.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">
              An editorial library where field notes explain the decisions, Wiki nodes map the system, and practical guides help you ship.
            </p>
          </div>
          <dl className="grid grid-cols-2 border-y border-zinc-300 py-5 dark:border-zinc-700 lg:grid-cols-1 lg:border-y-0 lg:border-l lg:py-0 lg:pl-8">
            <div className="border-r border-zinc-200 pr-5 dark:border-zinc-800 lg:border-b lg:border-r-0 lg:pb-5 lg:pr-0">
              <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Published entries</dt>
              <dd className="mt-2 font-serif text-4xl">{result.ok ? result.total_count : 0}</dd>
            </div>
            <div className="pl-5 lg:pt-5 lg:pl-0">
              <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Connected topics</dt>
              <dd className="mt-2 font-serif text-4xl">{topicCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">
        <div className="mb-9 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <form action="/docs" method="get" className="relative max-w-2xl">
            <HfIcon name="search" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input name="q" defaultValue={q} placeholder="Search titles, topics, and summaries" className="h-12 w-full rounded-none border border-zinc-300 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-teal-800 focus:ring-2 focus:ring-teal-800/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-teal-300" />
            {selectedFormat ? <input type="hidden" name="type" value={selectedFormat} /> : null}
          </form>
          <div className="flex flex-wrap gap-2">
            <Link href={formatHref()} aria-current={!selectedFormat ? 'page' : undefined} className={`border px-3 py-2 text-xs font-bold uppercase tracking-wide ${!selectedFormat ? 'border-teal-900 bg-teal-900 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-zinc-950' : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300'}`}>All</Link>
            {formats.map((format) => (
              <Link key={format.value} href={formatHref(format.value)} aria-current={selectedFormat === format.value ? 'page' : undefined} className={`border px-3 py-2 text-xs font-bold uppercase tracking-wide ${selectedFormat === format.value ? 'border-teal-900 bg-teal-900 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-zinc-950' : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300'}`}>
                {format.label}
              </Link>
            ))}
          </div>
        </div>

        {!result.ok ? (
          <div className="border border-dashed border-zinc-300 p-12 text-center text-zinc-500 dark:border-zinc-700">Could not connect to Forgejo.</div>
        ) : docs.length === 0 ? (
          <div className="border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <HfIcon name="doc" className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-4 font-serif text-2xl">No matching documents</p>
            <Link href="/docs" className="mt-3 inline-block text-sm font-semibold text-teal-800 underline dark:text-teal-300">Clear filters</Link>
          </div>
        ) : (
          <>
            {featured ? (
              <section className="mb-12 grid overflow-hidden border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="p-6 sm:p-9 lg:p-12">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-400">Featured / {formatLabel(docFormat(featured))}</p>
                  <Link href={docHref(featured)} className="mt-6 block max-w-4xl font-serif text-4xl font-semibold leading-[0.98] tracking-[-0.035em] hover:text-teal-900 dark:hover:text-teal-200 sm:text-6xl">
                    {featured.name.replace(/-/g, ' ')}
                  </Link>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">{featured.description}</p>
                  <Link href={docHref(featured)} className="mt-8 inline-flex h-11 items-center gap-3 bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-teal-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-teal-300">
                    Open document <HfIcon name="arrowRight" className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="relative min-h-60 overflow-hidden border-t border-zinc-300 bg-[#153c3b] text-[#f3d28f] dark:border-zinc-700 lg:border-l lg:border-t-0">
                  <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_center,transparent_0,transparent_22%,currentColor_22.5%,transparent_23%,transparent_38%,currentColor_38.5%,transparent_39%)]" />
                  <div className="absolute left-1/2 top-1/2 grid h-32 w-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-current font-serif text-6xl">D</div>
                  <div className="absolute bottom-5 left-5 right-5 flex justify-between font-mono text-[9px] font-bold uppercase tracking-[0.2em]">
                    <span>Git-backed</span><span>Living knowledge</span>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside>
                <p className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Browse by format</p>
                <div className="grid gap-0 border-t border-zinc-300 dark:border-zinc-700">
                  {formats.map((format) => {
                    const count = result.data.filter((repo) => docFormat(repo) === format.value).length;
                    return (
                      <Link key={format.value} href={formatHref(format.value)} className="group grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 border-b border-zinc-300 py-4 dark:border-zinc-700">
                        <HfIcon name={format.icon} className="mt-0.5 h-4 w-4 text-teal-800 dark:text-teal-300" />
                        <span><strong className="block text-sm">{format.label}</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">{format.description}</span></span>
                        <span className="font-mono text-xs text-zinc-400 group-hover:text-teal-800 dark:group-hover:text-teal-300">{count}</span>
                      </Link>
                    );
                  })}
                </div>
                <Link href="/new?type=doc" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-teal-900 hover:underline dark:text-teal-300">
                  <HfIcon name="plus" className="h-3.5 w-3.5" /> Publish a Doc
                </Link>
              </aside>

              <div className="min-w-0">
                <div className="mb-2 flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-400">Knowledge index</p>
                    <h2 className="mt-2 font-serif text-4xl">{selectedFormat ? formatLabel(selectedFormat) : q ? `Results for “${q}”` : 'Continue reading'}</h2>
                  </div>
                  <span className="font-mono text-xs text-zinc-500">{docs.length} entries</span>
                </div>
                <div>
                  {(remaining.length ? remaining : docs).map((repo, index) => <DocCard key={repo.id ?? repo.full_name} repo={repo} index={index} />)}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
