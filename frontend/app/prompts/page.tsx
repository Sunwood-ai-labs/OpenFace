import ListingPage from '@/components/ListingPage';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata() { const locale = await getLocale(); return { title: `${ui(locale, 'プロンプト', 'Prompts')} · OpenFace`, description: ui(locale, 'バージョン管理されたエージェント／ワークフロープロンプトを探せます。', 'Browse versioned agent and workflow prompts hosted on OpenFace.') }; }

export default async function PromptsPage({ searchParams }: { searchParams?: Promise<{ q?: string; sort?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const locale = await getLocale();
  return (
    <ListingPage
      topic="prompt"
      title={ui(locale, 'プロンプト', 'Prompts')}
      icon="prompt"
      placeholder={ui(locale, 'プロンプトを検索', 'Search prompts')}
      searchParams={resolvedSearchParams}
    />
  );
}
