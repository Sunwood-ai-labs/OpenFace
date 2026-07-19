'use client';

import { useContext, useEffect, useState } from 'react';
import type { SpaceStatus } from '@/lib/space-status';
import { SpaceStatusContext } from './SpaceStatusProvider';

const labels: Record<SpaceStatus, string> = {
  building: 'CPU · Building',
  running: 'CPU · Running',
  stopped: 'CPU · On demand',
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
  const directoryStatuses = useContext(SpaceStatusContext);
  const directoryStatus = directoryStatuses?.[`${owner}/${repo}`];
  const [detailStatus, setDetailStatus] = useState<SpaceStatus>('stopped');
  const status = directoryStatuses ? (directoryStatus || 'stopped') : detailStatus;

  useEffect(() => {
    if (directoryStatuses) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/runner-api/spaces/${owner}/${repo}/status`, {
          cache: 'no-store',
        });
        const data = (await response.json()) as { status?: SpaceStatus };
        if (active && data.status && data.status in labels) setDetailStatus(data.status);
      } catch {
        if (active) setDetailStatus('error');
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [directoryStatuses, owner, repo]);

  const className = variant === 'header'
    ? status === 'running'
      ? 'space-status-header space-status-header--running inline-flex h-8 items-center rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700'
      : status === 'building'
        ? 'space-status-header space-status-header--building inline-flex h-8 items-center rounded-lg border border-amber-100 bg-amber-50 px-3 text-xs font-semibold text-amber-700'
        : status === 'error'
          ? 'space-status-header space-status-header--error inline-flex h-8 items-center rounded-lg border border-red-100 bg-red-50 px-3 text-xs font-semibold text-red-700'
          : 'space-status-header space-status-header--stopped inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-zinc-100 px-3 text-xs font-semibold text-zinc-600'
    : 'rounded bg-white/15 px-1.5 py-1 shadow-sm ring-1 ring-white/10 backdrop-blur';

  return (
    <span className={className}>
      {labels[status]}
    </span>
  );
}
