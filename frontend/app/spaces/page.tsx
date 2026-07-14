import SpacesDirectoryPage from '@/components/SpacesDirectoryPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Spaces - OpenFace',
  description: 'Explore runnable AI applications shared on OpenFace.',
};

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; page?: string };
}) {
  return (
    <SpacesDirectoryPage searchParams={searchParams} />
  );
}
