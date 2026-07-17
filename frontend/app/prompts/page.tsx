import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Prompts · OpenFace',
  description: 'Browse versioned agent and workflow prompts hosted on OpenFace.',
};

export default async function PromptsPage({ searchParams }: { searchParams?: Promise<{ q?: string; sort?: string }> }) {
  const resolvedSearchParams = await searchParams;
  return (
    <ListingPage
      topic="prompt"
      title="Prompts"
      icon="prompt"
      placeholder="Search prompts"
      searchParams={resolvedSearchParams}
    />
  );
}
