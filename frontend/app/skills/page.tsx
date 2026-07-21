import ListingPage from '@/components/ListingPage';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata() { const locale = await getLocale(); return { title: `${ui(locale, 'スキル', 'Skills')} - OpenFace`, description: ui(locale, 'OpenFaceで公開されている再利用可能なエージェントスキルを探せます。', 'Browse reusable agent skills hosted on OpenFace.') }; }

export default async function SkillsPage({ searchParams }: { searchParams?: Promise<{ q?: string; sort?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const locale = await getLocale();
  return (
    <ListingPage
      topic="skill"
      title={ui(locale, 'スキル', 'Skills')}
      icon="skill"
      placeholder={ui(locale, 'スキルを検索', 'Search skills')}
      searchParams={resolvedSearchParams}
    />
  );
}
