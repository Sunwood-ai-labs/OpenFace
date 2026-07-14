'use client';

import { useEffect, useState } from 'react';

type SpaceStatus = 'building' | 'running' | 'stopped' | 'error';

const labels: Record<SpaceStatus, string> = {
  building: 'CPU · Building',
  running: 'CPU · Running',
  stopped: 'CPU · Paused',
  error: 'CPU · Error',
};

export default function SpaceStatusBadge({
  owner,
  repo,
  variant = 'card',
}: {
  owner: string;
  repo: string;
  variant?: 'card' | 'header';
}) {
  const [status, setStatus] = useState<SpaceStatus>('stopped');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/runner-api/spaces/${owner}/${repo}/status`, {
          cache: 'no-store',
        });
        const data = (await response.json()) as { status?: SpaceStatus };
        if (active && data.status && data.status in labels) setStatus(data.status);
      } catch {
        if (active) setStatus('error');
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [owner, repo]);

  const className = variant === 'header'
    ? status === 'running'
      ? 'inline-flex h-8 items-center rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700'
      : status === 'building'
        ? 'inline-flex h-8 items-center rounded-lg border border-amber-100 bg-amber-50 px-3 text-xs font-semibold text-amber-700'
        : status === 'error'
          ? 'inline-flex h-8 items-center rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-semibold text-red-700'
          : 'inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-zinc-100 px-3 text-xs font-semibold text-zinc-600'
    : 'rounded bg-white/15 px-1.5 py-1 shadow-sm ring-1 ring-white/10 backdrop-blur';

  return (
    <span className={className}>
      {labels[status]}
    </span>
  );
}
