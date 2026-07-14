import matter from 'gray-matter';
import { marked } from 'marked';

export interface ModelCardFrontmatter {
  license?: string;
  pipeline_tag?: string;
  language?: string | string[];
  tags?: string[];
  [key: string]: unknown;
}

export interface ParsedReadme {
  frontmatter: ModelCardFrontmatter;
  bodyHtml: string;
  bodyMarkdown: string;
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

function resolveRelativeImageSources(html: string, assetBaseUrl?: string): string {
  if (!assetBaseUrl) return html;
  return html.replace(/(<img\b[^>]*?\bsrc=["'])([^"']+)(["'])/gi, (match, prefix, source, suffix) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(source)) return match;
    const cleanSource = source.replace(/^\.\//, '');
    return `${prefix}${assetBaseUrl}${cleanSource}${suffix}`;
  });
}

export function parseReadme(raw: string | null, assetBaseUrl?: string): ParsedReadme {
  if (!raw) {
    return { frontmatter: {}, bodyHtml: '', bodyMarkdown: '' };
  }
  try {
    const { data, content } = matter(raw);
    const bodyHtml = resolveRelativeImageSources(marked.parse(content, { async: false }) as string, assetBaseUrl);
    return { frontmatter: data || {}, bodyHtml, bodyMarkdown: content };
  } catch {
    const bodyHtml = resolveRelativeImageSources(marked.parse(raw, { async: false }) as string, assetBaseUrl);
    return { frontmatter: {}, bodyHtml, bodyMarkdown: raw };
  }
}

export function languageList(language: string | string[] | undefined): string[] {
  if (!language) return [];
  if (Array.isArray(language)) return language;
  return [language];
}
