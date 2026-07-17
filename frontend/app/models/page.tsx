import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Models - OpenFace',
  description: 'Explore machine learning models shared on OpenFace.',
};

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <ListingPage
      topic="model"
      title="Models"
      icon="model"
      placeholder="Filter by name"
      searchParams={resolvedSearchParams}
    />
  );
}
