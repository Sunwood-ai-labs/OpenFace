'use client';

import { useState } from 'react';

export default function CloneBlock({ cloneUrl }: { cloneUrl: string }) {
  const [copied, setCopied] = useState(false);
  const command = `git clone ${cloneUrl}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Clone
      </p>
      <div className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-zinc-100">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md bg-zinc-700 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-600"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
