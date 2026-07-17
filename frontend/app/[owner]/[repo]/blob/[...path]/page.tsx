import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  forgejoCommitsUrl,
  forgejoRawUrl,
  forgejoTreeUrl,
  getContents,
  getRawFile,
  isLfsPointer,
  lfsMediaUrl,
} from '@/lib/forgejo';
import { formatBytes } from '@/lib/format';
import HfIcon from '@/components/HfIcon';

export const dynamic = 'force-dynamic';

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'json', 'yaml', 'yml', 'toml', 'py', 'js', 'ts', 'tsx', 'jsx',
  'css', 'html', 'sh', 'cfg', 'ini', 'gitattributes', 'gitignore', 'csv', 'tsv',
  'dockerfile', 'requirements', 'lock', 'cfg',
]);

function isProbablyText(name: string): boolean {
  const lower = name.toLowerCase();
  const ext = lower.split('.').pop() || '';
  if (lower === 'dockerfile' || lower === 'requirements.txt') return true;
  return TEXT_EXTENSIONS.has(ext);
}

export default async function FileViewPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; path: string[] }>;
}) {
  const { owner, repo, path: pathSegments } = await params;
  const path = pathSegments.map(decodeURIComponent).join('/');

  const contentsRes = await getContents(owner, repo, path);
  if (!contentsRes.ok || !contentsRes.data || Array.isArray(contentsRes.data)) {
    notFound();
  }
  const entry = contentsRes.data;

  const branch = 'main';
  const rawUrl = forgejoRawUrl(owner, repo, path, branch);
  const forgejoFileUrl = forgejoTreeUrl(owner, repo, path, branch);
  const historyUrl = forgejoCommitsUrl(owner, repo, path, branch);

  let textContent: string | null = null;
  let lfs = false;

  if (isProbablyText(entry.name) && entry.size < 2_000_000) {
    textContent = await getRawFile(owner, repo, path);
    if (textContent && isLfsPointer(textContent)) {
      lfs = true;
    }
  }

  const dirPath = path.split('/').slice(0, -1).join('/');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Link
          href={forgejoTreeUrl(owner, repo, dirPath, branch)}
          className="inline-flex items-center gap-1.5 hover:text-accent-dark hover:underline"
        >
          <HfIcon name="arrowLeft" className="h-3 w-3" />
          Back to files
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{path}</span>
          {lfs && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              LFS
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{formatBytes(entry.size)}</span>
          <a href={rawUrl} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:border-accent dark:border-zinc-700">
            <HfIcon name="file" className="h-3 w-3" />
            Raw
          </a>
          <a href={rawUrl} download className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:border-accent dark:border-zinc-700">
            <HfIcon name="download" className="h-3 w-3" />
            Download
          </a>
          <a href={historyUrl} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:border-accent dark:border-zinc-700">
            <HfIcon name="clock" className="h-3 w-3" />
            History
          </a>
          <a href={forgejoFileUrl} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:border-accent dark:border-zinc-700">
            <HfIcon name="link" className="h-3 w-3" />
            Forgejo
          </a>
        </div>
      </div>

      {lfs ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-900/20">
          <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
            This file is stored with Git LFS. Download the resolved file instead of the pointer.
          </p>
          <a
            href={lfsMediaUrl(owner, repo, path)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-950"
          >
            <HfIcon name="download" className="h-3.5 w-3.5" />
            Download LFS file
          </a>
        </div>
      ) : textContent !== null ? (
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          <code>{textContent}</code>
        </pre>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          This file cannot be previewed.
          <br />
          <a href={rawUrl} className="mt-2 inline-block text-accent-dark hover:underline">
            Open raw file
          </a>
        </div>
      )}
    </div>
  );
}
