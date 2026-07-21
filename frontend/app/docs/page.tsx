import DocsDirectoryPage from '@/components/DocsDirectoryPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Docs - OpenFace',
  description: 'Browse Git-backed articles, Wiki nodes, guides, and reference material on OpenFace.',
};

export default async function DocsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; sort?: string; type?: string }>;
}) {
  return <DocsDirectoryPage searchParams={await searchParams} />;
}
