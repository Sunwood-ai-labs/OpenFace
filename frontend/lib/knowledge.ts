import { getContents, getTextFile, Repo, searchReposByTopicAndQuery, SortOption } from './forgejo';
import { parseReadme } from './markdown';

export type KnowledgeFormat = 'article' | 'procedure' | 'wiki' | 'news';

export interface KnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  description: string;
  formats: KnowledgeFormat[];
  format: KnowledgeFormat;
  topics: string[];
  owner: string;
  repository: string;
  branch: string;
  path: string;
  updatedAt: string;
  emoji: string;
  readingMinutes: number;
  views: number;
  bodyHtml?: string;
  bodyMarkdown?: string;
}

export interface KnowledgeSearchResult {
  ok: boolean;
  data: KnowledgeArticle[];
  totalCount: number;
}

const formats = new Set<KnowledgeFormat>(['article', 'procedure', 'wiki', 'news']);
const contentDirectories: Array<{ path: string; format: KnowledgeFormat }> = [
  { path: 'articles', format: 'article' },
  { path: 'procedures', format: 'procedure' },
  { path: 'wiki', format: 'wiki' },
  { path: 'news', format: 'news' },
];

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeFormat(value: string): KnowledgeFormat | null {
  const normalized = value.toLowerCase() === 'guide'
    ? 'procedure'
    : value.toLowerCase() === 'reference'
      ? 'wiki'
      : value.toLowerCase();
  return formats.has(normalized as KnowledgeFormat) ? normalized as KnowledgeFormat : null;
}

function firstHeading(markdown: string, fallback: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback.replace(/-/g, ' ');
}

function firstParagraph(markdown: string): string {
  return markdown
    .replace(/^#.*$/gm, '')
    .split(/\n\s*\n/)
    .map((block) => block.replace(/[`*_>#\[\]]/g, '').replace(/\s+/g, ' ').trim())
    .find((block) => block.length > 30 && !block.startsWith('|')) || 'この記事を開いて、ナレッジの全文を確認してください。';
}

const formatEmoji: Record<KnowledgeFormat, string> = {
  article: '✍️',
  wiki: '🧭',
  procedure: '🛠️',
  news: '📰',
};

const topicEmoji: Array<{ topics: string[]; emoji: string }> = [
  { topics: ['news', 'release'], emoji: '📰' },
  { topics: ['recovery'], emoji: '🛟' },
  { topics: ['configuration'], emoji: '⚙️' },
  { topics: ['services'], emoji: '🏗️' },
  { topics: ['metrics'], emoji: '📊' },
  { topics: ['identity', 'permissions'], emoji: '🔐' },
  { topics: ['docs', 'publishing'], emoji: '📚' },
  { topics: ['catalog', 'topics', 'metadata'], emoji: '🗂️' },
  { topics: ['api'], emoji: '🔌' },
  { topics: ['routes'], emoji: '🗺️' },
  { topics: ['local-first'], emoji: '🏡' },
  { topics: ['community', 'design', 'accessibility'], emoji: '🧩' },
  { topics: ['cpu', 'inference'], emoji: '🧠' },
  { topics: ['visual-qa', 'themes'], emoji: '🔎' },
  { topics: ['agents', 'automation', 'review'], emoji: '🤖' },
  { topics: ['spaces', 'docker'], emoji: '🐳' },
  { topics: ['forgejo', 'git'], emoji: '🌿' },
];

const fallbackEmoji: Record<KnowledgeFormat, string[]> = {
  article: ['✍️', '💡', '📝', '🔭', '🧪', '🪶'],
  procedure: ['🛠️', '🧰', '🧭', '✅', '🚦', '🪜'],
  wiki: ['🧭', '📚', '🗺️', '🔖', '🧱', '🧬'],
  news: ['📰', '📣', '⚡', '🗞️', '📡', '🔔'],
};

function publicationEmoji(slug: string, topics: string[], format: KnowledgeFormat): string {
  const topicMatch = topicEmoji.find((candidate) => candidate.topics.some((topic) => topics.includes(topic)));
  if (topicMatch) return topicMatch.emoji;
  const hash = [...slug].reduce((total, character) => ((total * 31) + character.codePointAt(0)!) >>> 0, 0);
  const palette = fallbackEmoji[format] || [formatEmoji[format]];
  return palette[hash % palette.length];
}

function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  const japaneseCharacters = (markdown.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  return Math.max(1, Math.ceil(Math.max(words / 220, japaneseCharacters / 500)));
}

async function loadPublication(repo: Repo): Promise<KnowledgeArticle[]> {
  const owner = repo.owner?.login || repo.full_name.split('/')[0];
  const directoryEntries = await Promise.all(contentDirectories.map(async (directory) => ({
    directory,
    result: await getContents(owner, repo.name, directory.path, repo.default_branch),
  })));
  const markdownFiles = directoryEntries.flatMap(({ directory, result }) => (
    result.ok && Array.isArray(result.data)
      ? result.data
        .filter((entry) => entry.type === 'file' && /\.md$/i.test(entry.name))
        .map((entry) => ({ entry, directory }))
      : []
  ));
  const loaded = await Promise.all(markdownFiles.map(async ({ entry, directory }) => {
    const raw = await getTextFile(owner, repo.name, entry.path, repo.default_branch);
    if (!raw) return null;
    const parsed = parseReadme(raw);
    if (parsed.frontmatter.published === false) return null;
    const declaredFormats = [
      ...list(parsed.frontmatter.formats),
      ...list(parsed.frontmatter.format || parsed.frontmatter.type),
    ].map(normalizeFormat).filter(Boolean) as KnowledgeFormat[];
    const articleFormats = [...new Set(declaredFormats.length ? declaredFormats : [directory.format])];
    const format = articleFormats[0] || directory.format;
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
      formats: articleFormats,
      format,
      topics,
      owner,
      repository: repo.name,
      branch: repo.default_branch || 'main',
      path: entry.path,
      updatedAt: typeof parsed.frontmatter.updated === 'string' ? parsed.frontmatter.updated : repo.updated_at,
      emoji: typeof parsed.frontmatter.emoji === 'string' && parsed.frontmatter.emoji.trim()
        ? parsed.frontmatter.emoji.trim()
        : publicationEmoji(slug, topics, format),
      readingMinutes: readingMinutes(parsed.bodyMarkdown),
      views: 0,
      bodyHtml: parsed.bodyHtml,
      bodyMarkdown: parsed.bodyMarkdown,
    } satisfies KnowledgeArticle;
  }));
  const unique = new Map<string, KnowledgeArticle>();
  for (const article of loaded.filter(Boolean) as KnowledgeArticle[]) {
    const existing = unique.get(article.slug);
    const expectedDirectory = contentDirectories.find((item) => item.format === article.format)?.path;
    if (!existing || article.path.startsWith(`${expectedDirectory}/`)) unique.set(article.slug, article);
  }
  return [...unique.values()];
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
    articles = articles.filter((article) => [article.title, article.description, article.owner, article.repository, ...article.formats, ...article.topics]
      .some((value) => value.toLocaleLowerCase().includes(needle)));
  }
  articles.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { ok: true, data: articles, totalCount: articles.length };
}

export async function getKnowledgeArticle(owner: string, slug: string): Promise<KnowledgeArticle | null> {
  const result = await searchKnowledgeArticles();
  return result.data.find((article) => article.owner === owner && article.slug === slug) || null;
}
