import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'MCPs - OpenFace',
  description: 'Browse Model Context Protocol servers hosted on OpenFace.',
};

export default async function McpsPage({ searchParams }: { searchParams?: Promise<{ q?: string; sort?: string }> }) {
  const resolvedSearchParams = await searchParams;
  return (
    <ListingPage
      topic="mcp"
      title="MCPs"
      icon="mcp"
      placeholder="Search MCP servers"
      searchParams={resolvedSearchParams}
    />
  );
}
