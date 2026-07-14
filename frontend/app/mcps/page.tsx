import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'MCPs - OpenFace',
  description: 'Browse Model Context Protocol servers hosted on OpenFace.',
};

export default function McpsPage({ searchParams }: { searchParams?: { q?: string; sort?: string } }) {
  return (
    <ListingPage
      topic="mcp"
      title="MCPs"
      icon="mcp"
      placeholder="Search MCP servers"
      searchParams={searchParams}
    />
  );
}
