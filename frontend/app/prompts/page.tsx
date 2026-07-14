import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Prompts · OpenFace',
  description: 'Browse versioned agent and workflow prompts hosted on OpenFace.',
};

export default function PromptsPage({ searchParams }: { searchParams?: { q?: string; sort?: string } }) {
  return (
    <ListingPage
      topic="prompt"
      title="Prompts"
      icon="prompt"
      placeholder="Search prompts"
      searchParams={searchParams}
    />
  );
}
