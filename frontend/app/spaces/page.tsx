import SpacesDirectoryPage from '@/components/SpacesDirectoryPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Spaces - OpenFace',
  description: 'Explore runnable AI applications shared on OpenFace.',
};

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <SpacesDirectoryPage searchParams={resolvedSearchParams} />
  );
}
