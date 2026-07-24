import Link from 'next/link';
import { KnowledgeArticle, KnowledgeFormat, searchKnowledgeArticles } from '@/lib/knowledge';
import { timeAgoEn, timeAgoJa } from '@/lib/format';
import { getLocale } from '@/lib/i18n-server';
import { Locale, ui } from '@/lib/i18n';
import { getKnowledgeMetricsBatch } from '@/lib/agent-metrics';
import HfIcon, { HfIconName } from './HfIcon';
import KnowledgeViewCount from './KnowledgeViewCount';

type DocFormat = KnowledgeFormat;
type DocSort = 'updated' | 'trending';
type SectionKey = 'overall' | 'news' | `topic:${string}`;
type SectionSorts = Record<string, DocSort>;

type FormatDefinition = {
  value: DocFormat;
  label: string;
  description: string;
  icon: HfIconName;
};

function knowledgeFormats(locale: Locale): FormatDefinition[] {
  return [
    {
      value: 'article',
      label: ui(locale, '記事', 'Article'),
      description: ui(locale, '背景・調査・実践の記録', 'Research and field notes'),
      icon: 'filePen',
    },
    {
      value: 'procedure',
      label: ui(locale, '手順', 'Procedure'),
      description: ui(locale, '再現できる作業手順', 'Repeatable instructions'),
      icon: 'arrowRight',
    },
    {
      value: 'wiki',
      label: 'Wiki',
      description: ui(locale, '育ち続ける共有ページ', 'Living shared pages'),
      icon: 'model',
    },
    {
      value: 'news',
      label: ui(locale, 'ニュース', 'News'),
      description: ui(locale, '更新情報とコミュニティ速報', 'Updates and community briefs'),
      icon: 'clock',
    },
  ];
}

function docHref(article: KnowledgeArticle) {
  return `/docs/${article.owner}/${article.slug}`;
}

function formatLabel(value: DocFormat, formats: FormatDefinition[]) {
  return formats.find((format) => format.value === value)?.label || 'Reference';
}

function cardTone(format: DocFormat) {
  if (format === 'news') {
    return 'from-[#9f1239] via-[#db2777] to-[#f97316]';
  }
  if (format === 'article') {
    return 'from-[#b84a20] via-[#d36b2e] to-[#ef9a3d]';
  }
  if (format === 'procedure') {
    return 'from-[#0f766e] via-[#0d9488] to-[#22a99a]';
  }
  return 'from-[#334e8f] via-[#4f63b8] to-[#7c5ad6]';
}

function sortArticles(articles: KnowledgeArticle[], sort: DocSort) {
  return [...articles].sort((left, right) => (
    sort === 'trending'
      ? right.views - left.views || right.updatedAt.localeCompare(left.updatedAt)
      : right.updatedAt.localeCompare(left.updatedAt)
  ));
}

function DocCard({
  article,
  locale,
  formats,
}: {
  article: KnowledgeArticle;
  locale: Locale;
  formats: FormatDefinition[];
}) {
  const topics = article.topics.slice(0, 2);
  const visibleFormats = article.formats.filter((value) => value !== 'article');

  return (
    <article
      className={`group relative flex h-[190px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl bg-gradient-to-br ${cardTone(article.format)} text-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.10)] ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-zinc-950 focus-within:ring-offset-2`}
    >
      <Link
        href={docHref(article)}
        aria-label={ui(locale, `${article.title}を読む`, `Read ${article.title}`)}
        className="absolute inset-0 z-0 rounded-xl"
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:22px_22px]" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -right-4 z-0 select-none text-[112px] leading-none opacity-[0.16] grayscale-[0.15] transition duration-300 group-hover:scale-105 group-hover:opacity-[0.21]"
      >
        {article.emoji}
      </span>
      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-2 pt-2.5">
        <div className="mb-4 flex min-w-0 items-start gap-1.5 text-[10px] font-semibold leading-none text-white/90">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {visibleFormats.map((value) => (
              <Link
                key={value}
                href={`/docs?type=${value}`}
                className="pointer-events-auto rounded bg-white/15 px-1.5 py-1 shadow-sm ring-1 ring-white/10 backdrop-blur hover:bg-white/25"
              >
                {formatLabel(value, formats)}
              </Link>
            ))}
          </div>
          <Link
            href="/docs?sort=trending"
            className="pointer-events-auto ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-white/15 px-1.5 py-1 shadow-sm ring-1 ring-white/10 backdrop-blur hover:bg-white/25"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            {ui(locale, '注目', 'Featured')}
          </Link>
        </div>
        <h3 className="line-clamp-2 text-[17px] font-bold leading-[22px] group-hover:underline">
          {article.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-white/85">
          {article.description}
        </p>
        {topics.length > 0 ? (
          <div className="relative z-20 mt-auto flex min-w-0 gap-1.5 pt-2">
            {topics.map((topic) => (
              <Link
                key={topic}
                href={`/docs?tag=${encodeURIComponent(topic)}`}
                className="pointer-events-auto max-w-[48%] truncate rounded-full bg-black/10 px-2 py-1 text-[10px] font-medium text-white/85 ring-1 ring-white/10 hover:bg-black/20 hover:text-white"
              >
                #{topic}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <div className="pointer-events-none relative z-10 mt-auto flex h-[33px] items-center justify-between gap-3 bg-black/10 px-4 text-xs font-medium text-white/85 backdrop-blur-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold uppercase ring-1 ring-white/30">
            {article.owner.charAt(0)}
          </span>
          <span className="truncate">{article.owner}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <KnowledgeViewCount owner={article.owner} repo={article.repository} slug={article.slug} initialViews={article.views} />
          <span>{locale === 'ja' ? timeAgoJa(article.updatedAt) : timeAgoEn(article.updatedAt)}</span>
        </span>
      </div>
    </article>
  );
}

function KnowledgeSection({
  articles,
  count,
  format,
  formats,
  hrefForSort,
  locale,
  sort,
  title,
  topic,
}: {
  articles: KnowledgeArticle[];
  count: number;
  format?: DocFormat;
  formats: FormatDefinition[];
  hrefForSort: (sort: DocSort) => string;
  locale: Locale;
  sort: DocSort;
  title: string;
  topic?: string;
}) {
  const definition = format ? formats.find((candidate) => candidate.value === format) : undefined;
  const sectionSlug = topic ? `topic-${topic.replace(/[^a-z0-9-]/gi, '-')}` : format || 'overall';

  return (
    <section className="scroll-mt-24" id={`knowledge-${sectionSlug}`}>
      <div className="mb-3 flex min-w-0 items-end gap-3 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            format === 'news'
              ? 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300'
                  : topic
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
          }`}>
            <HfIcon name={definition?.icon || (topic ? 'filter' : 'bars')} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {definition?.description || (topic ? ui(locale, 'よく使われるタグ', 'Popular topic') : ui(locale, 'すべての公開ナレッジ', 'All public knowledge'))} · {count}
            </p>
          </div>
        </div>
        <nav
          aria-label={ui(locale, `${title}の並び順`, `${title} sort order`)}
          className="ml-auto flex shrink-0 items-center rounded-full bg-zinc-100 p-0.5 text-xs font-semibold dark:bg-zinc-800"
        >
          <Link
            href={hrefForSort('updated')}
            aria-current={sort === 'updated' ? 'page' : undefined}
            className={`rounded-full px-2.5 py-1.5 transition ${
              sort === 'updated'
                ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {ui(locale, '新着', 'Latest')}
          </Link>
          <Link
            href={hrefForSort('trending')}
            aria-current={sort === 'trending' ? 'page' : undefined}
            className={`rounded-full px-2.5 py-1.5 transition ${
              sort === 'trending'
                ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {ui(locale, '人気', 'Popular')}
          </Link>
        </nav>
        {format || topic ? (
          <Link
            href={format ? `/docs?type=${format}&sort=${sort}` : `/docs?tag=${encodeURIComponent(topic!)}&sort=${sort}`}
            className="hidden shrink-0 text-xs font-semibold text-teal-700 hover:underline sm:inline dark:text-teal-300"
          >
            {ui(locale, 'すべて見る →', 'View all →')}
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        {articles.slice(0, 4).map((article) => (
          <DocCard key={`${format || 'overall'}-${article.id}`} article={article} locale={locale} formats={formats} />
        ))}
      </div>
    </section>
  );
}

export default async function DocsDirectoryPage({
  searchParams,
}: {
  searchParams?: {
    articleSort?: string;
    newsSort?: string;
    overallSort?: string;
    procedureSort?: string;
    q?: string;
    sort?: string;
    tag?: string;
    tagSorts?: string;
    type?: string;
    wikiSort?: string;
  };
}) {
  const locale = await getLocale();
  const formats = knowledgeFormats(locale);
  const q = searchParams?.q?.trim() || undefined;
  const sort: DocSort = searchParams?.sort === 'trending' ? 'trending' : 'updated';
  const selectedTag = searchParams?.tag?.trim() || undefined;
  const selectedFormat = formats.some((format) => format.value === searchParams?.type)
    ? searchParams?.type as DocFormat
    : undefined;
  const result = await searchKnowledgeArticles(q, 'updated');
  const metrics = await getKnowledgeMetricsBatch(result.data.map((article) => ({
    owner: article.owner,
    repo: article.repository,
    slug: article.slug,
  })));
  const enriched = result.data.map((article) => ({
    ...article,
    views: metrics[`${article.owner}/${article.repository}/${article.slug}`]?.views || 0,
  }));
  const filtered = enriched.filter((article) => (
    (!selectedFormat || article.formats.includes(selectedFormat))
    && (!selectedTag || article.topics.includes(selectedTag))
  ));
  const docs = sortArticles(filtered, sort);
  const isOverview = !q && !selectedFormat && !selectedTag;
  const topicEntries = [...enriched.flatMap((article) => article.topics).reduce((counts, topic) => {
    counts.set(topic, (counts.get(topic) || 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const featuredTopicEntries = topicEntries.slice(0, 6);
  const trendingTopics = new Set((searchParams?.tagSorts || '').split(',').map((topic) => topic.trim()).filter(Boolean));
  const sectionSorts: SectionSorts = {
    overall: searchParams?.overallSort === 'trending' ? 'trending' : 'updated',
    news: searchParams?.newsSort === 'trending' ? 'trending' : 'updated',
  };
  featuredTopicEntries.forEach(([topic]) => {
    sectionSorts[`topic:${topic}`] = trendingTopics.has(topic) ? 'trending' : 'updated';
  });

  const buildHref = ({
    nextSort = sort,
    nextFormat = selectedFormat,
    nextTag = selectedTag,
    keepQuery = true,
  }: {
    nextSort?: DocSort;
    nextFormat?: DocFormat;
    nextTag?: string;
    keepQuery?: boolean;
  } = {}) => {
    const params = new URLSearchParams();
    if (keepQuery && q) params.set('q', q);
    if (nextSort !== 'updated') params.set('sort', nextSort);
    if (nextFormat) params.set('type', nextFormat);
    if (nextTag) params.set('tag', nextTag);
    const suffix = params.toString();
    return `/docs${suffix ? `?${suffix}` : ''}`;
  };

  const buildSectionHref = (section: SectionKey, nextSort: DocSort) => {
    const params = new URLSearchParams();
    const nextOverallSort = section === 'overall' ? nextSort : sectionSorts.overall;
    const nextNewsSort = section === 'news' ? nextSort : sectionSorts.news;
    const nextTrendingTopics = new Set(trendingTopics);
    if (section.startsWith('topic:')) {
      const topic = section.slice('topic:'.length);
      if (nextSort === 'trending') nextTrendingTopics.add(topic);
      else nextTrendingTopics.delete(topic);
    }
    if (nextOverallSort === 'trending') params.set('overallSort', 'trending');
    if (nextNewsSort === 'trending') params.set('newsSort', 'trending');
    if (nextTrendingTopics.size > 0) params.set('tagSorts', [...nextTrendingTopics].sort().join(','));
    const suffix = params.toString();
    const sectionSlug = section.startsWith('topic:')
      ? `topic-${section.slice('topic:'.length).replace(/[^a-z0-9-]/gi, '-')}`
      : section;
    return `/docs${suffix ? `?${suffix}` : ''}#knowledge-${sectionSlug}`;
  };

  const sortLabel = sort === 'trending'
    ? ui(locale, '閲覧数', 'Most viewed')
    : ui(locale, '更新順', 'Recently updated');
  const activeFilterCount = Number(Boolean(selectedFormat)) + Number(Boolean(selectedTag));
  const overviewSections: Array<{
    key: SectionKey;
    format?: DocFormat;
    topic?: string;
    title: string;
    articles: KnowledgeArticle[];
  }> = [
    {
      key: 'news',
      format: 'news',
      title: ui(locale, 'ニュース', 'News'),
      articles: enriched.filter((article) => article.formats.includes('news')),
    },
    {
      key: 'overall',
      title: ui(locale, 'すべてのナレッジ', 'All knowledge'),
      articles: enriched,
    },
    ...featuredTopicEntries.map(([topic]) => ({
      key: `topic:${topic}` as SectionKey,
      topic,
      title: `#${topic}`,
      articles: enriched.filter((article) => article.topics.includes(topic)),
    })),
  ];

  return (
    <div className="openface-docs-directory w-full overflow-x-hidden px-0 pt-8 [box-sizing:border-box]">
      <section className="mx-auto mb-[18px] max-w-[1536px] border-b border-zinc-100 px-4 pb-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="flex min-w-0 flex-nowrap items-center gap-x-2 gap-y-1 text-3xl font-bold tracking-tight text-zinc-900 max-sm:text-[26px] dark:text-zinc-100">
            <HfIcon name="doc" className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            <span>Knowledge</span>
            <span className="text-zinc-300 max-sm:text-lg dark:text-zinc-700">·</span>
            <span className="whitespace-nowrap text-zinc-500 max-sm:text-lg max-sm:font-medium dark:text-zinc-400">
              {ui(locale, 'ナレッジ一覧', 'Knowledge Directory')}
            </span>
          </h1>
          <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0 max-sm:flex-nowrap">
            <Link
              href="/new?type=doc"
              className="openface-docs-create inline-flex h-9 items-center gap-2 rounded-full bg-zinc-900 px-3.5 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950"
            >
              <HfIcon name="plus" className="h-3.5 w-3.5" />
              {ui(locale, '新規ナレッジ', 'New knowledge')}
            </Link>
            <Link
              href="/openface/docs-publishing-quickstart"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <HfIcon name="file" className="h-3.5 w-3.5" />
              {ui(locale, 'はじめ方', 'Quickstart')}
            </Link>
          </div>
        </div>

        <form action="/docs" method="get" className="relative mt-6">
          <HfIcon name="search" className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={ui(locale, 'タイトル、トピック、概要を検索', 'Search titles, topics, and summaries')}
            className="h-12 w-full rounded-full border border-zinc-200 bg-white px-12 text-base text-zinc-700 shadow-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:ring-zinc-800"
          />
          {selectedFormat ? <input type="hidden" name="type" value={selectedFormat} /> : null}
          {selectedTag ? <input type="hidden" name="tag" value={selectedTag} /> : null}
          {sort === 'trending' ? <input type="hidden" name="sort" value="trending" /> : null}
          <HfIcon name="model" className="absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
        </form>

        <div className="mt-2 flex gap-7 overflow-x-auto pb-5 pt-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={buildHref({ nextFormat: 'news', nextTag: undefined })}
            aria-current={selectedFormat === 'news' ? 'page' : undefined}
            className={`flex min-w-[112px] flex-col items-center justify-center gap-1.5 text-center text-[12px] leading-tight transition ${selectedFormat === 'news' ? 'openface-docs-news-active font-bold text-pink-700 dark:text-pink-300' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
          >
            <HfIcon name="clock" className="h-5 w-5" />
            <span className="select-none">
              {ui(locale, 'ニュース', 'News')} · {enriched.filter((article) => article.formats.includes('news')).length}
            </span>
            <span className="max-w-[128px] truncate text-[10px] opacity-70">{ui(locale, '最新のお知らせ', 'Latest updates')}</span>
          </Link>
          <Link
            href="/docs"
            aria-current={isOverview ? 'page' : undefined}
            className={`flex min-w-[112px] flex-col items-center justify-center gap-1.5 text-center text-[12px] leading-tight transition ${isOverview ? 'font-bold text-teal-700 dark:text-teal-300' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
          >
            <HfIcon name="bars" className="h-5 w-5" />
            <span className="select-none">{ui(locale, '全体', 'All')} · {enriched.length}</span>
            <span className="max-w-[128px] truncate text-[10px] opacity-70">{ui(locale, 'カテゴリ別ホーム', 'Category home')}</span>
          </Link>
          {featuredTopicEntries.map(([topic, count]) => (
            <Link
              key={topic}
              href={buildHref({ nextFormat: undefined, nextTag: topic })}
              aria-current={selectedTag === topic ? 'page' : undefined}
              className={`flex min-w-[92px] flex-col items-center justify-center gap-1.5 text-center text-[12px] leading-tight transition ${selectedTag === topic ? 'font-bold text-teal-700 dark:text-teal-300' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
            >
              <HfIcon name="filter" className="h-5 w-5" />
              <span className="max-w-[112px] truncate">#{topic}</span>
              <span className="text-[10px] opacity-70">{ui(locale, `${count}件`, `${count} items`)}</span>
            </Link>
          ))}
        </div>
      </section>

      {!isOverview ? (
      <div className="mx-auto mb-7 flex max-w-[1536px] flex-wrap items-center gap-3 px-4 max-sm:mb-0 max-sm:gap-2">
        <h2 className="openface-docs-section-pill inline-flex h-[34px] min-w-0 items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-4 text-sm font-bold text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] max-sm:order-1 max-sm:px-3 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-zinc-100">
          <HfIcon name="fire" className="h-3.5 w-3.5 text-orange-500" />
          <span className="truncate">{sort === 'trending' ? ui(locale, 'よく読まれている', 'Trending knowledge') : ui(locale, '新着ナレッジ', 'Latest knowledge')}</span>
        </h2>
        <span className="inline-flex h-[34px] items-center rounded-full border border-zinc-100 px-3 text-sm text-zinc-500 max-sm:order-4 max-sm:ml-auto dark:border-zinc-800 dark:text-zinc-400">
          {ui(locale, `${docs.length}件`, `${docs.length} items`)}
        </span>
        <form action="/docs" method="get" className="relative ml-auto min-w-0 max-sm:hidden sm:w-full sm:max-w-[202px]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={ui(locale, '名前で絞り込む', 'Filter by name')}
            className="h-[34px] w-full rounded-full border border-zinc-200 bg-white px-4 pl-10 text-sm placeholder-zinc-400 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {selectedFormat ? <input type="hidden" name="type" value={selectedFormat} /> : null}
          {selectedTag ? <input type="hidden" name="tag" value={selectedTag} /> : null}
          {sort === 'trending' ? <input type="hidden" name="sort" value="trending" /> : null}
          <HfIcon name="search" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        </form>
        <details name="docs-toolbar-menu" className="group relative shrink-0 max-sm:order-2 max-sm:ml-auto">
          <summary className="inline-flex h-[34px] cursor-pointer list-none items-center justify-center gap-2 rounded-full border border-zinc-200 px-3 text-xs text-zinc-700 shadow-sm marker:hidden max-sm:w-8 max-sm:px-0 sm:text-sm dark:border-zinc-700 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
            <HfIcon name="filter" className="h-3.5 w-3.5" />
            <span className="max-sm:hidden">{ui(locale, `フィルター (${activeFilterCount})`, `Filters (${activeFilterCount})`)}</span>
          </summary>
          <div className="absolute right-0 z-30 mt-2 hidden w-64 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg group-open:grid max-sm:left-0 max-sm:right-auto dark:border-zinc-700 dark:bg-zinc-900">
            <Link href={buildHref({ nextFormat: undefined, nextTag: undefined })} className="rounded-lg px-3 py-2 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800">
              {ui(locale, 'すべてのナレッジ', 'All knowledge')}
            </Link>
            <span className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
              {ui(locale, '文書形式', 'Document type')}
            </span>
            {formats.map((format) => (
              <Link key={format.value} href={buildHref({ nextFormat: format.value, nextTag: undefined })} className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800">
                {ui(locale, `形式: ${format.label}`, `Type: ${format.label}`)}
              </Link>
            ))}
          </div>
        </details>
        <details name="docs-toolbar-menu" className="group relative shrink-0 max-sm:order-3">
          <summary className="inline-flex h-[34px] min-w-0 cursor-pointer list-none items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 text-xs text-zinc-700 shadow-sm marker:hidden sm:gap-2 sm:px-3 sm:text-sm dark:border-zinc-700 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
            <HfIcon name="sort" className="h-3.5 w-3.5" />
            <span className="truncate">{ui(locale, '並び順', 'Sort')}: {sortLabel}</span>
          </summary>
          <div className="absolute right-0 z-30 mt-2 hidden w-52 rounded-lg border border-zinc-200 bg-white p-2 text-sm shadow-lg group-open:grid max-sm:left-auto max-sm:right-0 dark:border-zinc-700 dark:bg-zinc-900">
            <Link href={buildHref({ nextSort: 'updated' })} className="rounded-lg px-3 py-2 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800">
              {ui(locale, '更新順', 'Recently updated')}
            </Link>
            <Link href={buildHref({ nextSort: 'trending' })} className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800">
              {ui(locale, '閲覧数', 'Most viewed')}
            </Link>
          </div>
        </details>
      </div>
      ) : null}

      {!result.ok ? (
        <div className="mx-auto max-w-[1536px] rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          {ui(locale, 'Forgejoに接続できませんでした。しばらくしてから再度お試しください。', 'Could not connect to Forgejo. Please try again shortly.')}
        </div>
      ) : isOverview ? (
        <div className="mx-auto grid max-w-[1536px] gap-10 px-4 pb-4">
          {overviewSections.map((section) => {
            const sectionSort = sectionSorts[section.key];
            return (
              <KnowledgeSection
                key={section.key}
                articles={sortArticles(section.articles, sectionSort)}
                count={section.articles.length}
                format={section.format}
                formats={formats}
                hrefForSort={(nextSort) => buildSectionHref(section.key, nextSort)}
                locale={locale}
                sort={sectionSort}
                title={section.title}
                topic={section.topic}
              />
            );
          })}
        </div>
      ) : docs.length === 0 ? (
        <div className="mx-auto max-w-[1536px] rounded-lg border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <HfIcon name="doc" className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-4 text-xl font-bold">{ui(locale, '条件に一致するナレッジがありません', 'No knowledge matched your filters')}</p>
          <Link href="/docs" className="mt-3 inline-block text-sm font-semibold text-teal-700 underline dark:text-teal-300">
            {ui(locale, '絞り込みを解除', 'Clear filters')}
          </Link>
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1536px] grid-cols-1 gap-x-4 gap-y-5 px-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          {docs.map((article) => (
            <DocCard key={article.id} article={article} locale={locale} formats={formats} />
          ))}
        </div>
      )}

      {result.ok && !isOverview ? (
        <div className="mx-auto mt-7 flex max-w-[1536px] flex-wrap items-center gap-3 px-4 pb-10">
          <div>
            <h2 className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              <HfIcon name="bars" className="h-3.5 w-3.5 text-teal-600" />
              {ui(locale, '公開ナレッジ', 'Public knowledge')}
            </h2>
            <p className="mt-2 pl-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {ui(locale, `${enriched.length}件中 ${docs.length}件を表示 · ${topicEntries.length}トピック`, `Showing ${docs.length} of ${enriched.length} items · ${topicEntries.length} topics`)}
            </p>
          </div>
          {(selectedFormat || selectedTag || q || sort === 'trending') ? (
            <Link href="/docs" className="ml-auto inline-flex h-9 items-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              {ui(locale, '条件をリセット', 'Reset filters')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
