import DocsDirectoryPage from '@/components/DocsDirectoryPage';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: `${ui(locale, 'ナレッジ', 'Knowledge')} - OpenFace`,
    description: ui(locale, 'Gitで管理された記事、Wiki、ガイド、リファレンスを閲覧できます。', 'Browse Git-backed articles, Wiki nodes, guides, and reference material on OpenFace.'),
  };
}

export default async function DocsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; sort?: string; type?: string }>;
}) {
  return <DocsDirectoryPage searchParams={await searchParams} />;
}
