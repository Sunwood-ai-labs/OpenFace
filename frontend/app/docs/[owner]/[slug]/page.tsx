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
    <article className="openface-knowledge-article mx-auto max-w-[1040px] px-5 py-10 sm:px-8 sm:py-16">
      <Link href="/docs" className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-teal-800 hover:underline dark:text-teal-300">
        <HfIcon name="arrowLeft" className="h-3 w-3" /> Back to knowledge base
      </Link>
      <header className="mt-10 border-b border-zinc-300 pb-9 dark:border-zinc-700">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
          <span className="text-orange-700 dark:text-orange-400">{article.format}</span><span>/</span><span>Updated {timeAgoEn(article.updatedAt)}</span>
        </div>
        <h1 className="mt-5 max-w-4xl font-serif text-5xl font-semibold leading-[0.98] tracking-[-0.035em] text-zinc-950 dark:text-zinc-100 sm:text-7xl">{article.title}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">{article.description}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
          <a href={`/git/${article.owner}`} className="font-bold text-teal-900 hover:underline dark:text-teal-300">{article.owner}</a>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <a href={forgejoRepoUrl(article.owner, article.repository)} className="font-mono text-xs text-zinc-500 hover:text-teal-800 hover:underline dark:hover:text-teal-300">{article.repository}</a>
          {article.topics.map((topic) => <Link key={topic} href={`/docs?q=${encodeURIComponent(topic)}`} className="font-mono text-xs text-zinc-500 hover:text-teal-800 dark:hover:text-teal-300">#{topic}</Link>)}
        </div>
      </header>
      <div className="grid gap-10 pt-10 lg:grid-cols-[minmax(0,1fr)_190px]">
        <div className="github-markdown-body prose-openface min-w-0 bg-transparent dark:bg-transparent" dangerouslySetInnerHTML={{ __html: article.bodyHtml || '' }} />
        <aside className="order-first border-y border-zinc-300 py-5 text-sm dark:border-zinc-700 lg:order-last lg:border-y-0 lg:border-l lg:py-0 lg:pl-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Source</p>
          <p className="mt-3 leading-6 text-zinc-600 dark:text-zinc-400">This entry is published from <code>articles/{article.slug}.md</code>.</p>
          <a href={`${forgejoRepoUrl(article.owner, article.repository)}/src/branch/main/${article.path}`} className="mt-4 inline-flex items-center gap-2 font-bold text-teal-900 hover:underline dark:text-teal-300">View source <HfIcon name="arrowRight" className="h-3 w-3" /></a>
        </aside>
      </div>
    </article>
  );
}
