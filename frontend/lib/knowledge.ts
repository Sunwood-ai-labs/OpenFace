import { getContents, getTextFile, Repo, searchReposByTopicAndQuery, SortOption } from './forgejo';
import { parseReadme } from './markdown';

export type KnowledgeFormat = 'article' | 'wiki' | 'guide' | 'reference';

export interface KnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  description: string;
  format: KnowledgeFormat;
  topics: string[];
  owner: string;
  repository: string;
  path: string;
  updatedAt: string;
  bodyHtml?: string;
  bodyMarkdown?: string;
}

export interface KnowledgeSearchResult {
  ok: boolean;
  data: KnowledgeArticle[];
  totalCount: number;
}

const formats = new Set<KnowledgeFormat>(['article', 'wiki', 'guide', 'reference']);

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function firstHeading(markdown: string, fallback: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback.replace(/-/g, ' ');
}

function firstParagraph(markdown: string): string {
  return markdown
    .replace(/^#.*$/gm, '')
    .split(/\n\s*\n/)
    .map((block) => block.replace(/[`*_>#\[\]]/g, '').replace(/\s+/g, ' ').trim())
    .find((block) => block.length > 30 && !block.startsWith('|')) || 'Open this entry to read the complete knowledge note.';
}

async function loadPublication(repo: Repo): Promise<KnowledgeArticle[]> {
  const owner = repo.owner?.login || repo.full_name.split('/')[0];
  const entries = await getContents(owner, repo.name, 'articles', repo.default_branch);
  if (!entries.ok || !Array.isArray(entries.data)) return [];

  const markdownFiles = entries.data.filter((entry) => entry.type === 'file' && /\.md$/i.test(entry.name));
  const loaded = await Promise.all(markdownFiles.map(async (entry) => {
    const raw = await getTextFile(owner, repo.name, entry.path, repo.default_branch);
    if (!raw) return null;
    const parsed = parseReadme(raw);
    if (parsed.frontmatter.published === false) return null;
    const rawFormat = String(parsed.frontmatter.format || parsed.frontmatter.type || 'article').toLowerCase();
    const format = formats.has(rawFormat as KnowledgeFormat) ? rawFormat as KnowledgeFormat : 'article';
    const slug = entry.name.replace(/\.md$/i, '');
    const title = typeof parsed.frontmatter.title === 'string'
      ? parsed.frontmatter.title.trim()
      : firstHeading(parsed.bodyMarkdown, slug);
    const description = typeof parsed.frontmatter.description === 'string'
      ? parsed.frontmatter.description.trim()
      : firstParagraph(parsed.bodyMarkdown);
    const topics = [...new Set([...list(parsed.frontmatter.topics), ...list(parsed.frontmatter.tags)])]
      .filter((topic) => !formats.has(topic as KnowledgeFormat));
    return {
      id: `${owner}/${repo.name}/${slug}`,
      slug,
      title,
      description,
      format,
      topics,
      owner,
      repository: repo.name,
      path: entry.path,
      updatedAt: typeof parsed.frontmatter.updated === 'string' ? parsed.frontmatter.updated : repo.updated_at,
      bodyHtml: parsed.bodyHtml,
      bodyMarkdown: parsed.bodyMarkdown,
    } satisfies KnowledgeArticle;
  }));
  return loaded.filter(Boolean) as KnowledgeArticle[];
}

export async function searchKnowledgeArticles(
  query?: string,
  sort: SortOption = 'updated',
): Promise<KnowledgeSearchResult> {
  const publications = await searchReposByTopicAndQuery('doc', undefined, sort, 100);
  if (!publications.ok) return { ok: false, data: [], totalCount: 0 };
  let articles = (await Promise.all(publications.data.map(loadPublication))).flat();
  if (query) {
    const needle = query.toLocaleLowerCase();
    articles = articles.filter((article) => [article.title, article.description, article.owner, article.repository, ...article.topics]
      .some((value) => value.toLocaleLowerCase().includes(needle)));
  }
  articles.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { ok: true, data: articles, totalCount: articles.length };
}

export async function getKnowledgeArticle(owner: string, slug: string): Promise<KnowledgeArticle | null> {
  const result = await searchKnowledgeArticles();
  return result.data.find((article) => article.owner === owner && article.slug === slug) || null;
}
