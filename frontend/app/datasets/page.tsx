import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Datasets - OpenFace',
  description: 'Explore datasets and benchmark assets shared on OpenFace.',
};

export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  return (
    <ListingPage
      topic="dataset"
      title="Datasets"
      icon="dataset"
      placeholder="Filter by name"
      searchParams={searchParams}
    />
  );
}
