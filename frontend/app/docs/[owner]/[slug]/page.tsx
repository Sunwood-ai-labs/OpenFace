import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getKnowledgeArticle } from '@/lib/knowledge';
import { forgejoRepoUrl } from '@/lib/forgejo';
import { timeAgoEn, timeAgoJa } from '@/lib/format';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';
import HfIcon from '@/components/HfIcon';
import KnowledgeViewCount from '@/components/KnowledgeViewCount';
import { getKnowledgeMetricsBatch } from '@/lib/agent-metrics';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = await params;
  const locale = await getLocale();
  const article = await getKnowledgeArticle(owner, slug);
  return { title: article ? `${article.title} - ${ui(locale, 'ナレッジ', 'Knowledge')} - OpenFace` : `${ui(locale, 'ナレッジ', 'Knowledge')} - OpenFace`, description: article?.description };
}

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = await params;
  const locale = await getLocale();
  const article = await getKnowledgeArticle(owner, slug);
  if (!article) notFound();
  const metrics = await getKnowledgeMetricsBatch([{ owner: article.owner, repo: article.repository, slug: article.slug }]);
  const views = metrics[`${article.owner}/${article.repository}/${article.slug}`]?.views || 0;
  const formatLabels = article.formats.map((format) => format === 'article'
    ? ui(locale, '記事', 'Article')
    : format === 'procedure'
      ? ui(locale, '手順', 'Procedure')
      : 'Wiki');

  return (
    <article className="openface-knowledge-article min-h-screen">
      <div className="openface-article-author mx-auto flex max-w-[920px] items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/docs" className="inline-flex items-center gap-2 text-xs font-bold text-teal-800 hover:underline dark:text-teal-300">
          <HfIcon name="arrowLeft" className="h-3 w-3" /> {ui(locale, 'ナレッジ一覧', 'All knowledge')}
        </Link>
        <a href={`/git/${article.owner}`} className="text-sm font-bold text-zinc-700 hover:text-teal-800 dark:text-zinc-200 dark:hover:text-teal-300">{article.owner}</a>
      </div>
      <header className="openface-article-hero border-y border-zinc-200 px-5 py-12 text-center dark:border-zinc-800 sm:px-8 sm:py-16">
        <div className="openface-article-emoji mx-auto grid h-28 w-28 place-items-center rounded-[2rem] text-6xl sm:h-36 sm:w-36 sm:text-7xl">{article.emoji}</div>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {formatLabels.map((label) => <span key={label} className="rounded-full border border-teal-800/30 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-teal-800 dark:border-teal-300/40 dark:text-teal-300">{label}</span>)}
        </div>
        <h1 className="mx-auto mt-8 max-w-[820px] font-serif text-[clamp(2.25rem,6vw,4.5rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-zinc-950 dark:text-zinc-100">{article.title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">{article.description}</p>
        <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{ui(locale, `${timeAgoJa(article.updatedAt)}に更新 · 読了 ${article.readingMinutes}分`, `Updated ${timeAgoEn(article.updatedAt)} · ${article.readingMinutes} min read`)}</span>
          <span>·</span>
          <KnowledgeViewCount owner={article.owner} repo={article.repository} slug={article.slug} initialViews={views} record />
        </p>
      </header>
      <div className="mx-auto max-w-[1040px] px-5 sm:px-8">
        <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 py-5 dark:border-zinc-800">
          {article.topics.map((topic) => <Link key={topic} href={`/docs?tag=${encodeURIComponent(topic)}`} className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-teal-700 hover:text-teal-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-teal-300 dark:hover:text-teal-300">#{topic}</Link>)}
        </div>
        <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,760px)_190px] lg:justify-center lg:py-14">
          <div className="github-markdown-body prose-openface min-w-0 bg-transparent dark:bg-transparent" dangerouslySetInnerHTML={{ __html: article.bodyHtml || '' }} />
          <aside className="border-y border-zinc-300 py-5 text-sm dark:border-zinc-700 lg:border-y-0 lg:border-l lg:py-0 lg:pl-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{ui(locale, '出典', 'Source')}</p>
          <p className="mt-3 leading-6 text-zinc-600 dark:text-zinc-400">{ui(locale, 'このナレッジは', 'This knowledge is published from')} <code>{article.path}</code>{ui(locale, ' から公開されています。', '.')}</p>
            <a href={`${forgejoRepoUrl(article.owner, article.repository)}/src/branch/${article.branch}/${article.path}`} className="mt-4 inline-flex items-center gap-2 font-bold text-teal-900 hover:underline dark:text-teal-300">{ui(locale, 'ソースを見る', 'View source')} <HfIcon name="arrowRight" className="h-3 w-3" /></a>
          </aside>
        </div>
      </div>
    </article>
  );
}
