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

export interface ReadmeRenderUrls {
  assetBaseUrl?: string;
  relativeLinkBaseUrl?: string;
}

function isAbsoluteOrAnchor(url: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url);
}

function resolveRelativeUrl(source: string, baseUrl: string): string {
  if (isAbsoluteOrAnchor(source)) return source;
  try {
    const resolved = new URL(source, `https://openface.invalid${baseUrl}`);
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return source;
  }
}

function resolveRelativeRepositoryUrls(html: string, urls?: ReadmeRenderUrls): string {
  if (!urls) return html;
  let resolved = html;
  if (urls.assetBaseUrl) {
    const assetBaseUrl = urls.assetBaseUrl;
    resolved = resolved.replace(/(<img\b[^>]*?\bsrc=["'])([^"']+)(["'])/gi, (match, prefix, source, suffix) => {
      if (isAbsoluteOrAnchor(source)) return match;
      return `${prefix}${resolveRelativeUrl(source, assetBaseUrl)}${suffix}`;
    });
  }
  if (urls.relativeLinkBaseUrl) {
    const relativeLinkBaseUrl = urls.relativeLinkBaseUrl;
    resolved = resolved.replace(/(<a\b[^>]*?\bhref=["'])([^"']+)(["'])/gi, (match, prefix, href, suffix) => {
      if (isAbsoluteOrAnchor(href)) return match;
      return `${prefix}${resolveRelativeUrl(href, relativeLinkBaseUrl)}${suffix}`;
    });
  }
  return resolved;
}

export function parseReadme(raw: string | null, urls?: ReadmeRenderUrls): ParsedReadme {
  if (!raw) {
    return { frontmatter: {}, bodyHtml: '', bodyMarkdown: '' };
  }
  try {
    const { data, content } = matter(raw);
    const bodyHtml = resolveRelativeRepositoryUrls(marked.parse(content, { async: false }) as string, urls);
    return { frontmatter: data || {}, bodyHtml, bodyMarkdown: content };
  } catch {
    const bodyHtml = resolveRelativeRepositoryUrls(marked.parse(raw, { async: false }) as string, urls);
    return { frontmatter: {}, bodyHtml, bodyMarkdown: raw };
  }
}

export function languageList(language: string | string[] | undefined): string[] {
  if (!language) return [];
  if (Array.isArray(language)) return language;
  return [language];
}
