export interface RepoAgentMetrics {
  owner: string;
  repo: string;
  views: number;
  agent_views?: number;
  browser_views?: number;
  likes: number;
  recent_agents: Array<{
    slug: string;
    display_name: string;
    emoji: string;
    acted_at: string;
  }>;
}

export interface KnowledgeMetrics {
  owner: string;
  repo: string;
  slug: string;
  views: number;
}

const RUNNER_API = (process.env.RUNNER_API || 'http://spaces-runner:8000/api').replace(/\/$/, '');

export async function getRepoMetrics(owner: string, repo: string): Promise<RepoAgentMetrics> {
  try {
    const response = await fetch(
      `${RUNNER_API}/metrics/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error(`metrics HTTP ${response.status}`);
    return await response.json() as RepoAgentMetrics;
  } catch {
    return { owner, repo, views: 0, likes: 0, recent_agents: [] };
  }
}

export async function getRepoMetricsBatch(
  repos: Array<{ owner: string; repo: string }>,
): Promise<Record<string, RepoAgentMetrics>> {
  if (repos.length === 0) return {};
  try {
    const response = await fetch(`${RUNNER_API}/metrics/repos/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repos }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`metrics batch HTTP ${response.status}`);
    return await response.json() as Record<string, RepoAgentMetrics>;
  } catch {
    return Object.fromEntries(repos.map(({ owner, repo }) => [
      `${owner}/${repo}`,
      { owner, repo, views: 0, likes: 0, recent_agents: [] },
    ]));
  }
}

export async function getKnowledgeMetricsBatch(
  items: Array<{ owner: string; repo: string; slug: string }>,
): Promise<Record<string, KnowledgeMetrics>> {
  if (items.length === 0) return {};
  try {
    const response = await fetch(`${RUNNER_API}/metrics/knowledge/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`knowledge metrics HTTP ${response.status}`);
    return await response.json() as Record<string, KnowledgeMetrics>;
  } catch {
    return Object.fromEntries(items.map(({ owner, repo, slug }) => [
      `${owner}/${repo}/${slug}`,
      { owner, repo, slug, views: 0 },
    ]));
  }
}
