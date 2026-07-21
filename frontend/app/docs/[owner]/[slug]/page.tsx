import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getKnowledgeArticle } from '@/lib/knowledge';
import { forgejoRepoUrl } from '@/lib/forgejo';
import { timeAgoEn } from '@/lib/format';
import HfIcon from '@/components/HfIcon';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = await params;
  const article = await getKnowledgeArticle(owner, slug);
  return { title: article ? `${article.title} - Docs - OpenFace` : 'Knowledge entry - OpenFace', description: article?.description };
}

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = await params;
  const article = await getKnowledgeArticle(owner, slug);
  if (!article) notFound();

  return (
    <article className="openface-knowledge-article min-h-screen">
      <div className="openface-article-author mx-auto flex max-w-[920px] items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/docs" className="inline-flex items-center gap-2 text-xs font-bold text-teal-800 hover:underline dark:text-teal-300">
          <HfIcon name="arrowLeft" className="h-3 w-3" /> Articles
        </Link>
        <a href={`/git/${article.owner}`} className="text-sm font-bold text-zinc-700 hover:text-teal-800 dark:text-zinc-200 dark:hover:text-teal-300">{article.owner}</a>
      </div>
      <header className="openface-article-hero border-y border-zinc-200 px-5 py-12 text-center dark:border-zinc-800 sm:px-8 sm:py-16">
        <div className="openface-article-emoji mx-auto grid h-28 w-28 place-items-center rounded-[2rem] text-6xl sm:h-36 sm:w-36 sm:text-7xl">{article.emoji}</div>
        <h1 className="mx-auto mt-8 max-w-[820px] font-serif text-[clamp(2.25rem,6vw,4.5rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-zinc-950 dark:text-zinc-100">{article.title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">{article.description}</p>
        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">Updated {timeAgoEn(article.updatedAt)} · {article.readingMinutes} min read</p>
      </header>
      <div className="mx-auto max-w-[1040px] px-5 sm:px-8">
        <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 py-5 dark:border-zinc-800">
          {article.topics.map((topic) => <Link key={topic} href={`/docs?q=${encodeURIComponent(topic)}`} className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-teal-700 hover:text-teal-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-teal-300 dark:hover:text-teal-300">#{topic}</Link>)}
        </div>
        <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,760px)_190px] lg:justify-center lg:py-14">
          <div className="github-markdown-body prose-openface min-w-0 bg-transparent dark:bg-transparent" dangerouslySetInnerHTML={{ __html: article.bodyHtml || '' }} />
          <aside className="order-first border-y border-zinc-300 py-5 text-sm dark:border-zinc-700 lg:order-last lg:border-y-0 lg:border-l lg:py-0 lg:pl-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Source</p>
          <p className="mt-3 leading-6 text-zinc-600 dark:text-zinc-400">This entry is published from <code>articles/{article.slug}.md</code>.</p>
            <a href={`${forgejoRepoUrl(article.owner, article.repository)}/src/branch/${article.branch}/${article.path}`} className="mt-4 inline-flex items-center gap-2 font-bold text-teal-900 hover:underline dark:text-teal-300">View source <HfIcon name="arrowRight" className="h-3 w-3" /></a>
          </aside>
        </div>
      </div>
    </article>
  );
}
