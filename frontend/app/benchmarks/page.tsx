import ListingPage from '@/components/ListingPage';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: `${ui(locale, 'ベンチマーク', 'Benchmarks')} - OpenFace`,
    description: ui(
      locale,
      'CAD、SVG、マルチモーダル生成などの再現可能な評価スイートを探せます。',
      'Discover reproducible evaluation suites for CAD, SVG, and multimodal generation.',
    ),
  };
}

export default async function BenchmarksPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; sort?: string }>;
}) {
  const locale = await getLocale();
  return (
    <ListingPage
      topic="benchmark"
      title={ui(locale, 'ベンチマーク', 'Benchmarks')}
      icon="benchmark"
      placeholder={ui(locale, 'CAD、SVG、タスク名で検索', 'Filter by CAD, SVG, or task')}
      searchParams={await searchParams}
    />
  );
}
