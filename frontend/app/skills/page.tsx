import ListingPage from '@/components/ListingPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Skills - OpenFace',
  description: 'Browse reusable agent skills hosted on OpenFace.',
};

export default function SkillsPage({ searchParams }: { searchParams?: { q?: string; sort?: string } }) {
  return (
    <ListingPage
      topic="skill"
      title="Skills"
      icon="skill"
      placeholder="Search skills"
      searchParams={searchParams}
    />
  );
}
