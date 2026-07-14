import fs from 'fs';
import matter from 'gray-matter';

// ---------------------------------------------------------------------------
// Configuration (固定契約: PLAN.md)
// ---------------------------------------------------------------------------
const FORGEJO_API = process.env.FORGEJO_API || 'http://forgejo:3000/api/v1';
const FORGEJO_TOKEN_FILE = process.env.FORGEJO_TOKEN_FILE || '/shared/token';
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || 'http://localhost:8090';

let cachedToken: string | null | undefined;

function getToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  try {
    const raw = fs.readFileSync(FORGEJO_TOKEN_FILE, 'utf-8');
    cachedToken = raw.trim() || null;
  } catch {
    // Token file missing — tolerate and fall back to unauthenticated requests.
    cachedToken = null;
  }
  return cachedToken;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface RepoOwner {
  login: string;
  avatar_url?: string;
}

export interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  owner: RepoOwner;
  stars_count?: number;
  forks_count?: number;
  watchers_count?: number;
  open_issues_count?: number;
  updated_at: string;
  topics?: string[];
  html_url?: string;
  default_branch?: string;
  space_emoji?: string;
}

export interface SearchReposResult {
  ok: boolean;
  data: Repo[];
  total_count: number;
}

export interface ContentEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  sha: string;
  download_url?: string | null;
  content?: string | null;
  encoding?: string | null;
}

export interface GetContentsResult {
  ok: boolean;
  data: ContentEntry[] | ContentEntry | null;
}

export type SortOption = 'updated' | 'stars';

export interface CommitInfo {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string;
      date?: string;
    };
    committer?: {
      name?: string;
      date?: string;
    };
  };
  author?: RepoOwner | null;
  committer?: RepoOwner | null;
}

// ---------------------------------------------------------------------------
// Low-level fetch helper — never throws; callers get {ok:false} on failure so
// pages can render an empty-state instead of crashing SSR / the build.
// ---------------------------------------------------------------------------
async function apiFetch(path: string): Promise<{ ok: boolean; status: number; json: any; headers: Headers | null }> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `token ${token}`;

  const url = `${FORGEJO_API}${path}`;
  try {
    const res = await fetch(url, {
      headers,
      cache: 'no-store',
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, headers: res.headers };
  } catch (err) {
    // Network error (Forgejo down, DNS failure, etc.)
    return { ok: false, status: 0, json: null, headers: null };
  }
}

// ---------------------------------------------------------------------------
// Repo search — topic-classified listing (models / datasets / spaces)
// ---------------------------------------------------------------------------
export interface SearchReposParams {
  topic?: string; // model | dataset | space
  q?: string;
  sort?: SortOption;
  limit?: number;
  page?: number;
}

export async function searchRepos(params: SearchReposParams): Promise<SearchReposResult> {
  const { topic, q, sort = 'updated', limit = 20, page = 1 } = params;

  const qs = new URLSearchParams();
  // Forgejo topic search contract: GET /repos/search?q=<topic>&topic=true
  if (topic) {
    qs.set('q', topic);
    qs.set('topic', 'true');
  } else if (q) {
    qs.set('q', q);
  }
  qs.set('limit', String(limit));
  qs.set('page', String(page));

  if (sort === 'stars') {
    qs.set('sort', 'stars');
    qs.set('order', 'desc');
  } else {
    qs.set('sort', 'updated');
    qs.set('order', 'desc');
  }

  // Additional free-text query on top of a topic listing (e.g. /models?q=bert)
  if (topic && q) {
    qs.set('q', q);
    qs.append('topic', 'false');
  }

  const res = await apiFetch(`/repos/search?${qs.toString()}`);
  if (!res.ok || !res.json) {
    return { ok: false, data: [], total_count: 0 };
  }
  const data = Array.isArray(res.json.data) ? res.json.data as Repo[] : [];
  const headerTotal = Number.parseInt(res.headers?.get('x-total-count') || '', 10);
  return {
    ok: true,
    data: topic === 'space' ? await enrichSpaceMetadata(data) : data,
    total_count: Number.isFinite(headerTotal) ? headerTotal : (res.json.total_count ?? data.length),
  };
}

// When both a topic (model/dataset/space) and a free-text query are needed,
// Forgejo's single-endpoint search doesn't combine "topic-only" filtering
// with a fuzzy text query cleanly. To keep behaviour predictable we search
// by topic and then filter client-side (server-side/SSR) by the query text
// against name/description. This keeps the "固定契約" endpoint shape intact
// while still giving usable search-within-category behaviour.
export async function searchReposByTopicAndQuery(
  topic: string,
  q: string | undefined,
  sort: SortOption,
  limit = 50,
  page = 1,
): Promise<SearchReposResult> {
  const res = await searchRepos({ topic, sort, limit, page });
  if (!q) return res;
  const needle = q.toLowerCase();
  const filtered = res.data.filter((r) => {
    return (
      r.name.toLowerCase().includes(needle) ||
      (r.description || '').toLowerCase().includes(needle) ||
      r.full_name.toLowerCase().includes(needle)
    );
  });
  return { ok: res.ok, data: filtered, total_count: filtered.length };
}

// ---------------------------------------------------------------------------
// Single repo
// ---------------------------------------------------------------------------
export async function getRepo(owner: string, repo: string): Promise<Repo | null> {
  const res = await apiFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!res.ok || !res.json) return null;
  return res.json as Repo;
}

// ---------------------------------------------------------------------------
// Directory / file listing
// ---------------------------------------------------------------------------
export async function getContents(
  owner: string,
  repo: string,
  path: string = ''
): Promise<GetContentsResult> {
  const cleanPath = path.replace(/^\/+/, '');
  const res = await apiFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${cleanPath}`
  );
  if (!res.ok || res.json === null) {
    return { ok: false, data: null };
  }
  return { ok: true, data: res.json };
}

export async function getCommits(
  owner: string,
  repo: string,
  path = '',
  limit = 10
): Promise<CommitInfo[]> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (path) qs.set('path', path.replace(/^\/+/, ''));
  const res = await apiFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${qs.toString()}`
  );
  if (!res.ok || !Array.isArray(res.json)) return [];
  return res.json as CommitInfo[];
}

// ---------------------------------------------------------------------------
// Raw file content (text) — via /raw/ endpoint
// ---------------------------------------------------------------------------
export async function getRawFile(
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `token ${token}`;
  const cleanPath = path.replace(/^\/+/, '');
  const url = `${FORGEJO_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/raw/${cleanPath}`;
  try {
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// README (base64 decode via contents API)
// ---------------------------------------------------------------------------
export async function getReadme(owner: string, repo: string): Promise<string | null> {
  const res = await getContents(owner, repo, 'README.md');
  if (!res.ok || !res.data || Array.isArray(res.data)) return null;
  const entry = res.data;
  if (!entry.content) return null;
  try {
    return Buffer.from(entry.content, (entry.encoding as BufferEncoding) || 'base64').toString(
      'utf-8'
    );
  } catch {
    return null;
  }
}

function normalizeEmoji(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const first = new Intl.Segmenter('en', { granularity: 'grapheme' })
      .segment(trimmed)[Symbol.iterator]().next().value?.segment as string | undefined;
    if (!first || !/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(first)) return undefined;
    return first;
  } catch {
    return Array.from(trimmed)[0];
  }
}

function inferredSpaceEmoji(repo: Repo): string {
  const text = [repo.name, repo.description || '', ...(repo.topics || [])].join(' ').toLowerCase();
  if (/wildlife|bird|animal/.test(text)) return '🦅';
  if (/webgpu|kernel|gpu/.test(text)) return '⚡';
  if (/train|trainer|lora|fine-tun/.test(text)) return '🧪';
  if (/table|chart|csv|data-viz|visualization/.test(text)) return '📊';
  if (/video|movie|animation/.test(text)) return '🎬';
  if (/audio-clean|noise|sound/.test(text)) return '🎧';
  if (/voice|speech|microphone|realtime/.test(text)) return '🎙️';
  if (/chat|question|answer/.test(text)) return '💬';
  if (/document|pdf|ocr/.test(text)) return '📄';
  if (/image|vision|photo|visual/.test(text)) return '🖼️';
  if (/code|agent/.test(text)) return '🤖';
  return '🚀';
}

async function enrichSpaceMetadata(repos: Repo[]): Promise<Repo[]> {
  return Promise.all(repos.map(async (repo) => {
    const owner = repo.owner?.login ?? repo.full_name.split('/')[0];
    const readme = await getReadme(owner, repo.name);
    let configuredEmoji: string | undefined;
    if (readme) {
      try {
        configuredEmoji = normalizeEmoji(matter(readme).data?.emoji);
      } catch {
        configuredEmoji = undefined;
      }
    }
    return { ...repo, space_emoji: configuredEmoji || inferredSpaceEmoji(repo) };
  }));
}

// ---------------------------------------------------------------------------
// LFS pointer detection
// ---------------------------------------------------------------------------
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

export function isLfsPointer(content: string): boolean {
  return content.trimStart().startsWith(LFS_POINTER_PREFIX);
}

export function lfsMediaUrl(owner: string, repo: string, path: string, branch = 'main'): string {
  return `/git/${owner}/${repo}/media/branch/${branch}/${path}`;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------
export function cloneUrl(owner: string, repo: string): string {
  return `${PUBLIC_BASE_URL}/git/${owner}/${repo}.git`;
}

export function forgejoRepoUrl(owner: string, repo: string): string {
  return `/git/${owner}/${repo}`;
}

export function forgejoTreeUrl(owner: string, repo: string, path = '', branch = 'main'): string {
  const cleanPath = path.replace(/^\/+/, '');
  return `${forgejoRepoUrl(owner, repo)}/src/branch/${branch}${cleanPath ? `/${cleanPath}` : ''}`;
}

export function forgejoRawUrl(owner: string, repo: string, path: string, branch = 'main'): string {
  return `${forgejoRepoUrl(owner, repo)}/raw/branch/${branch}/${path.replace(/^\/+/, '')}`;
}

export function forgejoCommitsUrl(owner: string, repo: string, path = '', branch = 'main'): string {
  const cleanPath = path.replace(/^\/+/, '');
  return `${forgejoRepoUrl(owner, repo)}/commits/branch/${branch}${cleanPath ? `/${cleanPath}` : ''}`;
}

const TYPE_TOPICS = new Set(['model', 'dataset', 'space']);

export function nonTypeTopics(topics: string[] | undefined): string[] {
  if (!topics) return [];
  return topics.filter((t) => !TYPE_TOPICS.has(t));
}

export function repoKind(topics: string[] | undefined): 'model' | 'dataset' | 'space' | null {
  if (!topics) return null;
  if (topics.includes('space')) return 'space';
  if (topics.includes('dataset')) return 'dataset';
  if (topics.includes('model')) return 'model';
  return null;
}
