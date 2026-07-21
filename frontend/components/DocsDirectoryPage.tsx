import Link from 'next/link';
import { SortOption } from '@/lib/forgejo';
import { KnowledgeArticle, KnowledgeFormat, searchKnowledgeArticles } from '@/lib/knowledge';
import { timeAgoEn } from '@/lib/format';
import HfIcon, { HfIconName } from './HfIcon';

type DocFormat = KnowledgeFormat;

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

function docHref(article: KnowledgeArticle) {
  return `/docs/${article.owner}/${article.slug}`;
}

function formatLabel(value: DocFormat) {
  return formats.find((format) => format.value === value)?.label || 'Reference';
}

function DocCard({ article, index }: { article: KnowledgeArticle; index: number }) {
  const format = article.format;
  const topics = article.topics.slice(0, 3);

  return (
    <article className="openface-doc-row group relative grid min-w-0 grid-cols-[68px_minmax(0,1fr)] gap-4 border-t border-zinc-200 py-5 transition-colors dark:border-zinc-800 sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:gap-5 sm:px-2">
      <Link href={docHref(article)} aria-hidden="true" tabIndex={-1} className="openface-doc-emoji grid h-[68px] w-[68px] place-items-center rounded-2xl bg-[#e7f2f0] text-3xl transition-transform group-hover:-translate-y-0.5 sm:h-20 sm:w-20 sm:text-4xl">
        {article.emoji}
      </Link>
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]">
          <span className="text-teal-800 dark:text-teal-300">{formatLabel(format)}</span>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-zinc-500 dark:text-zinc-400">{article.readingMinutes} min read</span>
        </div>
        <Link href={docHref(article)} className="block text-[17px] font-bold leading-snug text-zinc-950 transition group-hover:text-teal-900 dark:text-zinc-100 dark:group-hover:text-teal-200 sm:text-xl">
          {article.title}
        </Link>
        <p className="mt-1 hidden max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400 sm:line-clamp-1 sm:block">
          {article.description}
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400"><strong className="text-zinc-700 dark:text-zinc-300">{article.owner}</strong> · {timeAgoEn(article.updatedAt)}</p>
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
      <Link href={docHref(article)} aria-label={`Read ${article.title}`} className="hidden h-9 items-center gap-2 self-center px-3 text-xs font-bold text-zinc-500 transition hover:text-teal-800 dark:text-zinc-400 dark:hover:text-teal-300 sm:inline-flex">
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
  const result = await searchKnowledgeArticles(q, sort);
  const docs = selectedFormat
    ? result.data.filter((article) => article.format === selectedFormat)
    : result.data;
  const featured = docs.find((article) => article.format === 'article') || docs[0];
  const remaining = featured ? docs.filter((article) => article.id !== featured.id) : docs;
  const topicCount = new Set(result.data.flatMap((article) => article.topics)).size;
  const formatHref = (value?: DocFormat) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort !== 'updated') params.set('sort', sort);
    if (value) params.set('type', value);
    const suffix = params.toString();
    return `/docs${suffix ? `?${suffix}` : ''}`;
  };

  return (
    <div className="openface-docs-directory min-h-screen bg-[#fbfaf6] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="openface-docs-hero relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(39,39,42,.08)_1px,transparent_1px)] [background-size:80px_100%] dark:opacity-20" />
        <div className="openface-docs-hero-grid relative mx-auto grid max-w-[1440px] gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end lg:px-12">
          <div>
            <div className="mb-5 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700 dark:text-orange-400">
              <span className="h-px w-10 bg-current" /> OpenFace Docs Library
            </div>
            <h1 className="max-w-4xl font-serif text-[clamp(2.8rem,7vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.05em]">
              Knowledge,<br />published by people.
            </h1>
            <p className="openface-docs-hero-copy mt-7 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">
              Your Git-backed knowledge base for articles, research notes, procedures, and durable references—owned by you or your team.
            </p>
            <div className="openface-docs-hero-actions mt-7 flex flex-wrap gap-3">
              <a href="#how-to-use" className="inline-flex h-11 items-center gap-2 border border-zinc-950 bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-teal-900 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:border-teal-300 dark:hover:bg-teal-300">
                Start your knowledge base <HfIcon name="arrowRight" className="h-3.5 w-3.5" />
              </a>
              <Link href="/openface/docs-publishing-quickstart" className="inline-flex h-11 items-center border border-zinc-300 px-5 text-sm font-bold transition hover:border-teal-800 hover:text-teal-900 dark:border-zinc-700 dark:hover:border-teal-300 dark:hover:text-teal-300">
                Publishing quickstart
              </Link>
            </div>
          </div>
          <dl className="openface-docs-hero-stats grid grid-cols-2 border-y border-zinc-300 py-5 dark:border-zinc-700 lg:grid-cols-1 lg:border-y-0 lg:border-l lg:py-0 lg:pl-8">
            <div className="border-r border-zinc-200 pr-5 dark:border-zinc-800 lg:border-b lg:border-r-0 lg:pb-5 lg:pr-0">
              <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Published entries</dt>
              <dd className="mt-2 font-serif text-4xl">{result.ok ? result.totalCount : 0}</dd>
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
            <Link href={formatHref()} aria-current={!selectedFormat ? 'page' : undefined} className={`openface-docs-format-tab border px-3 py-2 text-xs font-bold uppercase tracking-wide ${!selectedFormat ? 'openface-docs-format-active border-teal-900 bg-teal-900 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-zinc-950' : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300'}`}>All</Link>
            {formats.map((format) => (
              <Link key={format.value} href={formatHref(format.value)} aria-current={selectedFormat === format.value ? 'page' : undefined} className={`openface-docs-format-tab border px-3 py-2 text-xs font-bold uppercase tracking-wide ${selectedFormat === format.value ? 'openface-docs-format-active border-teal-900 bg-teal-900 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-zinc-950' : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300'}`}>
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
              <section className="openface-doc-feature mb-12 grid overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="p-6 sm:p-9 lg:p-10">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-400">Featured / {formatLabel(featured.format)}</p>
                  <Link href={docHref(featured)} className="mt-5 block max-w-4xl font-serif text-3xl font-semibold leading-[1.02] tracking-[-0.03em] hover:text-teal-900 dark:hover:text-teal-200 sm:text-5xl">
                    {featured.title}
                  </Link>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">{featured.description}</p>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-zinc-400">Published by {featured.owner} from {featured.repository}</p>
                  <Link href={docHref(featured)} className="openface-docs-primary-action mt-8 inline-flex h-11 items-center gap-3 bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-teal-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-teal-300">
                    Open document <HfIcon name="arrowRight" className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="openface-doc-feature-art relative min-h-52 overflow-hidden border-t border-zinc-200 bg-[#153c3b] text-[#f3d28f] dark:border-zinc-800 lg:border-l lg:border-t-0">
                  <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_center,transparent_0,transparent_22%,currentColor_22.5%,transparent_23%,transparent_38%,currentColor_38.5%,transparent_39%)]" />
                  <div className="absolute left-1/2 top-1/2 grid h-32 w-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[2rem] border border-current bg-white/5 text-6xl">{featured.emoji}</div>
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
                    const count = result.data.filter((article) => article.format === format.value).length;
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
                  <HfIcon name="plus" className="h-3.5 w-3.5" /> Add knowledge
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
                  {(remaining.length ? remaining : docs).map((article, index) => <DocCard key={article.id} article={article} index={index} />)}
                </div>
              </div>
            </section>
          </>
        )}

        <section id="how-to-use" aria-labelledby="docs-how-to-title" className="openface-docs-onboarding mt-14 scroll-mt-24 border-y border-zinc-300 bg-[#f4f0e8] dark:border-zinc-700 dark:bg-zinc-900">
          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="border-b border-zinc-300 p-6 dark:border-zinc-700 lg:border-b-0 lg:border-r lg:p-8">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-700 dark:text-orange-400">Start here</p>
              <h2 id="docs-how-to-title" className="mt-3 font-serif text-3xl leading-none">Use the library in three moves.</h2>
              <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">One person or team has one publication repository. Each file in articles/ becomes an entry.</p>
            </div>
            <div className="grid sm:grid-cols-3">
              <div className="border-b border-zinc-300 p-6 dark:border-zinc-700 sm:border-b-0 sm:border-r lg:p-8">
                <div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-orange-700 dark:text-orange-400">01</span><HfIcon name="doc" className="h-5 w-5 text-teal-800 dark:text-teal-300" /></div>
                <h3 className="mt-7 font-serif text-2xl">Capture</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Create your publication once, then save articles, research notes, runbooks, and references in <code className="bg-white px-1 py-0.5 text-xs dark:bg-zinc-950">articles/*.md</code>.</p>
              </div>
              <div className="border-b border-zinc-300 p-6 dark:border-zinc-700 sm:border-b-0 sm:border-r lg:p-8">
                <div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-orange-700 dark:text-orange-400">02</span><HfIcon name="search" className="h-5 w-5 text-teal-800 dark:text-teal-300" /></div>
                <h3 className="mt-7 font-serif text-2xl">Organize</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Front matter gives each file a title, format, and topics. Search and topic links bring that knowledge back later.</p>
              </div>
              <div className="p-6 lg:p-8">
                <div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-orange-700 dark:text-orange-400">03</span><HfIcon name="plus" className="h-5 w-5 text-teal-800 dark:text-teal-300" /></div>
                <h3 className="mt-7 font-serif text-2xl">Grow</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Edit Markdown as your thinking changes. Commits preserve every version; pull requests let a team review before publishing.</p>
                <Link href="/new?type=doc&template=documentation" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-teal-900 hover:underline dark:text-teal-300">Add knowledge <HfIcon name="arrowRight" className="h-3 w-3" /></Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
