export type SpaceStatus = 'building' | 'running' | 'stopped' | 'error';

export interface SpaceStatusRow {
  owner: string;
  repo: string;
  status: SpaceStatus;
}

const RUNNER_API = (process.env.RUNNER_API || 'http://spaces-runner:8000/api').replace(/\/$/, '');

export async function getSpaceStatuses(): Promise<Record<string, SpaceStatus>> {
  try {
    const response = await fetch(`${RUNNER_API}/spaces`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`spaces HTTP ${response.status}`);
    const rows = await response.json() as SpaceStatusRow[];
    return Object.fromEntries(rows.map((row) => [`${row.owner}/${row.repo}`, row.status]));
  } catch {
    return {};
  }
}
