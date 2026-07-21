import SpacesDirectoryPage from '@/components/SpacesDirectoryPage';
import { getLocale } from '@/lib/i18n-server';
import { ui } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata() { const locale = await getLocale(); return { title: 'Spaces - OpenFace', description: ui(locale, 'OpenFaceで共有されている実行可能なAIアプリを探せます。', 'Explore runnable AI applications shared on OpenFace.') }; }

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <SpacesDirectoryPage searchParams={resolvedSearchParams} />
  );
}
