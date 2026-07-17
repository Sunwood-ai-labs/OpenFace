import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Skills - OpenFace',
  description: 'Browse reusable agent skills hosted on OpenFace.',
};

export default async function SkillsPage({ searchParams }: { searchParams?: Promise<{ q?: string; sort?: string }> }) {
  const resolvedSearchParams = await searchParams;
  return (
    <ListingPage
      topic="skill"
      title="Skills"
      icon="skill"
      placeholder="Search skills"
      searchParams={resolvedSearchParams}
    />
  );
}
