'use client';

import { useEffect, useState } from 'react';
import HfIcon from '@/components/HfIcon';
import { useLocale } from './LocaleProvider';
import { ui } from '@/lib/i18n';

type ViewResponse = {
  metrics?: { views?: number };
};

export default function KnowledgeViewCount({
  owner,
  repo,
  slug,
  initialViews,
  record = false,
}: {
  owner: string;
  repo: string;
  slug: string;
  initialViews: number;
  record?: boolean;
}) {
  const [views, setViews] = useState(initialViews);
  const { locale } = useLocale();

  useEffect(() => {
    if (!record) return;
    const idempotencyKey = `knowledge-browser:${owner}/${repo}/${slug}:${performance.timeOrigin}`;
    const controller = new AbortController();
    fetch(`/runner-api/metrics/knowledge/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(slug)}/views`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<ViewResponse> : null)
      .then((result) => {
        const nextViews = result?.metrics?.views;
        if (typeof nextViews === 'number') setViews(nextViews);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('Could not record knowledge view', error);
        }
      });
    return () => controller.abort();
  }, [owner, repo, slug, record]);

  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      title={ui(locale, `閲覧 ${views}回`, `${views} views`)}
      aria-label={ui(locale, `閲覧 ${views}回`, `${views} views`)}
    >
      <HfIcon name="eye" className="h-3.5 w-3.5" />
      {ui(locale, `${views} views`, `${views} views`)}
    </span>
  );
}
