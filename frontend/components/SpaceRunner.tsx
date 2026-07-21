'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import HfIcon from './HfIcon';
import { useLocale } from './LocaleProvider';
import { ui } from '@/lib/i18n';

type SpaceStatus = 'unknown' | 'stopped' | 'starting' | 'running' | 'error';

interface StatusResponse {
  status?: string;
  state?: string;
  [key: string]: unknown;
}

function normalizeStatus(json: StatusResponse | null): SpaceStatus {
  const raw = (json?.status || json?.state || '').toString().toLowerCase();
  if (raw.includes('run')) return 'running';
  if (raw.includes('start') || raw.includes('build') || raw.includes('pending')) return 'starting';
  if (raw.includes('stop') || raw.includes('exit') || raw.includes('none')) return 'stopped';
  if (raw.includes('error') || raw.includes('fail')) return 'error';
  return 'unknown';
}

export default function SpaceRunner({
  owner,
  repo,
  description,
}: {
  owner: string;
  repo: string;
  description?: string | null;
}) {
  const { locale } = useLocale();
  const [status, setStatus] = useState<SpaceStatus>('unknown');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const base = `/runner-api/spaces/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const controlBase = `/api/spaces/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const runUrl = `/run/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/`;
  const displayName = repo
    .replace(/-space$/i, '')
    .split(/[-_]+/)
    .map((part) => part.toLowerCase() === 'ocr' ? 'OCR' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const fetchStatus = useCallback(async (): Promise<SpaceStatus> => {
    try {
      const res = await fetch(`${base}/status`, { cache: 'no-store' });
      if (!res.ok) {
        setStatus('unknown');
        return 'unknown';
      }
      const json = (await res.json().catch(() => null)) as StatusResponse | null;
      const nextStatus = normalizeStatus(json);
      setStatus(nextStatus);
      return nextStatus;
    } catch {
      setStatus('unknown');
      return 'unknown';
    }
  }, [base]);

  useEffect(() => {
    void fetchStatus();
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  async function start() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${controlBase}/start`, { method: 'POST' });
      if (!res.ok) {
        setErrorMsg(res.status === 401 ? ui(locale, 'Forgejoにログインして再度お試しください。', 'Sign in to Forgejo, then try again.') : res.status === 403 ? ui(locale, 'このSpaceへの書き込み権限が必要です。', 'Write permission on this Space is required.') : ui(locale, `Spaceの再起動に失敗しました (HTTP ${res.status})`, `Failed to restart this Space (HTTP ${res.status})`));
      }
      await fetchStatus();
    } catch {
      setErrorMsg(ui(locale, 'Space Runnerに接続できませんでした。', 'Could not connect to spaces-runner.'));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${controlBase}/stop`, { method: 'POST' });
      if (!res.ok) {
        setErrorMsg(res.status === 401 ? ui(locale, 'Forgejoにログインして再度お試しください。', 'Sign in to Forgejo, then try again.') : res.status === 403 ? ui(locale, 'このSpaceへの書き込み権限が必要です。', 'Write permission on this Space is required.') : ui(locale, `Spaceの一時停止に失敗しました (HTTP ${res.status})`, `Failed to pause this Space (HTTP ${res.status})`));
      }
      await fetchStatus();
    } catch {
      setErrorMsg(ui(locale, 'Space Runnerに接続できませんでした。', 'Could not connect to spaces-runner.'));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel: Record<SpaceStatus, string> = {
    unknown: ui(locale, 'オンデマンド', 'On demand'),
    stopped: ui(locale, 'オンデマンド', 'On demand'),
    starting: ui(locale, '起動中', 'Starting'),
    running: ui(locale, '実行中', 'Running'),
    error: ui(locale, 'エラー', 'Error'),
  };

  const statusColor: Record<SpaceStatus, string> = {
    unknown: 'bg-zinc-200 text-zinc-600',
    stopped: 'bg-zinc-200 text-zinc-600',
    starting: 'bg-amber-200 text-amber-800',
    running: 'bg-green-200 text-green-800',
    error: 'bg-red-200 text-red-800',
  };

  return (
    <div className="openface-space-runner overflow-hidden bg-white dark:bg-zinc-950">
      <div className="openface-space-runner-toolbar flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex min-w-0 items-center gap-2">
          <HfIcon name="space" className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">App</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor[status]}`}>
            {statusLabel[status]}
          </span>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={start}
            disabled={busy || status === 'running' || status === 'starting'}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-950"
          >
            <HfIcon name="play" className="h-3.5 w-3.5" />
            {status === 'running' ? ui(locale, '実行中', 'Running') : ui(locale, 'Spaceを起動', 'Start this Space')}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={busy || status === 'stopped'}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {ui(locale, '一時停止', 'Pause')}
          </button>
        </div>
      </div>

      {errorMsg && <p className="px-4 pt-3 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>}

      {status === 'running' ? (
        <iframe
          src={runUrl}
          className="openface-space-frame w-full border-0"
          title={`${owner}/${repo} Space`}
        />
      ) : (
        <div className="openface-space-stage relative flex min-h-[calc(100vh-50px)] flex-col overflow-hidden bg-[#090b12] px-7 py-6 text-zinc-400">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(103,90,190,0.58),rgba(45,42,78,0.44)_16%,rgba(9,11,18,0.98)_46%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:18px_18px]" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="max-w-[360px] text-2xl font-bold leading-tight text-zinc-300">
                  {displayName}
                </h2>
                <span className="grid h-6 w-6 place-items-center rounded-full border border-white/20 text-xs text-zinc-400">i</span>
              </div>
              <p className="mt-3 max-w-[440px] text-lg leading-7 text-zinc-300">
                {description || ui(locale, `${owner}/${repo}として公開されたAIアプリです。`, `AI application published as ${owner}/${repo}.`)}
              </p>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-normal text-zinc-500">
                {ui(locale, '実行基盤', 'Powered by')} <span className="normal-case text-zinc-300">OpenFace Runner</span>
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="/git/user/login"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-semibold text-zinc-100 hover:bg-white/10 disabled:cursor-wait disabled:opacity-70"
              >
                <HfIcon name="play" className="h-3.5 w-3.5" />
                {ui(locale, 'ログイン', 'Sign in')}
              </a>
              <a
                href={`/git/${owner}/${repo}/src/branch/main`}
                aria-label={ui(locale, 'Spaceのファイルを見る', 'View Space files')}
                title={ui(locale, 'Spaceのファイルを見る', 'View Space files')}
                className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              >
                <HfIcon name="file" className="h-4 w-4" />
              </a>
              <a
                href={`/git/${owner}/${repo}/settings`}
                aria-label={ui(locale, 'ForgejoでSpaceの設定を開く', 'Open Space settings in Forgejo')}
                title={ui(locale, 'ForgejoでSpaceの設定を開く', 'Open Space settings in Forgejo')}
                className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              >
                <HfIcon name="gear" className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 text-center">
            <button
              type="button"
              onClick={start}
              disabled={busy || status === 'starting'}
              aria-label={ui(locale, 'このSpaceを起動', 'Start this Space')}
              title={ui(locale, 'このSpaceを起動', 'Start this Space')}
              className="group relative grid h-56 w-56 place-items-center rounded-full border border-violet-300/45 bg-violet-500/20 shadow-[0_0_64px_rgba(111,91,255,0.45),inset_0_0_54px_rgba(168,145,255,0.24)] transition hover:scale-[1.02] disabled:cursor-wait disabled:opacity-70 max-sm:h-44 max-sm:w-44"
            >
              <span className="absolute inset-[-16px] rounded-full border border-violet-300/10" />
              <HfIcon name="play" className="h-10 w-10 text-violet-100 transition group-hover:scale-110" />
            </button>
            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                {ui(locale, 'タップして起動', 'Tap to start')}
              </p>
              <p className="mx-auto max-w-[300px] text-xs leading-5 text-zinc-500">
                {ui(locale, 'このSpaceはオンデマンドで起動します。ログイン済みのプロジェクト管理者が起動できます。', 'This Space runs on demand. A signed-in project maintainer can start it.')}
              </p>
            </div>
          </div>

          <div className="relative z-10 pb-1 text-center text-xs text-zinc-600">
            {ui(locale, '提供', 'Powered by')} {owner}/{repo}
          </div>
        </div>
      )}
    </div>
  );
}
