import ListingPage from '@/components/ListingPage';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata() { const locale = await getLocale(); return { title: 'MCPs - OpenFace', description: ui(locale, 'OpenFaceで公開されているModel Context Protocolサーバーを探せます。', 'Browse Model Context Protocol servers hosted on OpenFace.') }; }

export default async function McpsPage({ searchParams }: { searchParams?: Promise<{ q?: string; sort?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const locale = await getLocale();
  return (
    <ListingPage
      topic="mcp"
      title="MCPs"
      icon="mcp"
      placeholder={ui(locale, 'MCPサーバーを検索', 'Search MCP servers')}
      searchParams={resolvedSearchParams}
    />
  );
}
