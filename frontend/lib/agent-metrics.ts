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
  const rows = await Promise.all(repos.map(({ owner, repo }) => getRepoMetrics(owner, repo)));
  return Object.fromEntries(rows.map((row) => [`${row.owner}/${row.repo}`, row]));
}
