import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { searchRepos } from '@/lib/forgejo';
import HfIcon from '@/components/HfIcon';
import RepoGrid from '@/components/RepoGrid';
import { timeAgoEn } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'OpenFace - The AI community building locally',
  description: 'A Forgejo-backed community hub for models, datasets, and Spaces.',
};

function CompactRepoList({
  repos,
  href,
  label,
}: {
  repos: Awaited<ReturnType<typeof searchRepos>>['data'];
  href: string;
  label: string;
}) {
  const kind = label === 'Models' ? 'model' : label === 'Datasets' ? 'dataset' : label === 'Skills' ? 'skill' : label === 'MCPs' ? 'mcp' : label === 'Prompts' ? 'prompt' : label === 'Docs' ? 'doc' : 'space';
  const theme = {
    model: {
      shell: 'border-zinc-200 bg-white',
      icon: 'bg-amber-100 text-amber-700 ring-amber-200',
      link: 'hover:bg-zinc-50',
      dot: 'bg-amber-400',
      browse: 'text-amber-700 hover:text-amber-900',
      title: 'text-amber-800',
    },
    space: {
      shell: 'border-indigo-200/80 bg-gradient-to-b from-indigo-50/80 via-white to-white shadow-indigo-100/60',
      icon: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
      link: 'hover:bg-indigo-50/80',
      dot: 'bg-indigo-500',
      browse: 'text-indigo-700 hover:text-indigo-900',
      title: 'text-indigo-800',
    },
    dataset: {
      shell: 'border-zinc-200 bg-white',
      icon: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
      link: 'hover:bg-zinc-50',
      dot: 'bg-emerald-500',
      browse: 'text-emerald-700 hover:text-emerald-900',
      title: 'text-emerald-800',
    },
    skill: {
      shell: 'border-violet-200/80 bg-gradient-to-b from-violet-50/70 via-white to-white shadow-violet-100/60',
      icon: 'bg-violet-100 text-violet-700 ring-violet-200',
      link: 'hover:bg-violet-50/80',
      dot: 'bg-violet-500',
      browse: 'text-violet-700 hover:text-violet-900',
      title: 'text-violet-800',
    },
    mcp: {
      shell: 'border-cyan-200/80 bg-gradient-to-b from-cyan-50/70 via-white to-white shadow-cyan-100/60',
      icon: 'bg-cyan-100 text-cyan-700 ring-cyan-200',
      link: 'hover:bg-cyan-50/80',
      dot: 'bg-cyan-500',
      browse: 'text-cyan-700 hover:text-cyan-900',
      title: 'text-cyan-800',
    },
    prompt: {
      shell: 'border-orange-200/80 bg-gradient-to-b from-orange-50/80 via-white to-white shadow-orange-100/60',
      icon: 'bg-orange-100 text-orange-700 ring-orange-200',
      link: 'hover:bg-orange-50/80',
      dot: 'bg-orange-500',
      browse: 'text-orange-700 hover:text-orange-900',
      title: 'text-orange-800',
    },
    doc: {
      shell: 'border-teal-200/80 bg-gradient-to-b from-teal-50/80 via-white to-white shadow-teal-100/60',
      icon: 'bg-teal-100 text-teal-800 ring-teal-200',
      link: 'hover:bg-teal-50/80',
      dot: 'bg-teal-700',
      browse: 'text-teal-800 hover:text-teal-950',
      title: 'text-teal-900',
    },
  }[kind];

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-950">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${theme.icon}`}>
            <HfIcon name={kind} className="h-3.5 w-3.5" />
          </span>
          {label}
        </h2>
        <Link href={href} className={`shrink-0 text-sm font-semibold hover:underline ${theme.browse}`}>
          Browse all
        </Link>
      </div>
      <div className={`divide-y divide-zinc-100 overflow-hidden rounded-xl border shadow-sm ${theme.shell}`}>
        {repos.slice(0, 5).map((repo) => {
          const owner = repo.owner?.login ?? repo.full_name.split('/')[0];
          return (
            <Link key={repo.id ?? repo.full_name} href={`/${owner}/${repo.name}`} className={`group flex gap-3 px-4 py-3 transition-colors ${theme.link}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${theme.dot} transition-transform group-hover:scale-125`} />
              <div className="min-w-0">
                <p className={`truncate font-mono text-sm font-semibold group-hover:underline ${theme.title}`}>{repo.full_name}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  Updated {timeAgoEn(repo.updated_at)} · {repo.description || 'No description'}
                </p>
              </div>
            </Link>
          );
        })}
        {repos.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">No repositories yet.</div>
        ) : null}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [models, datasets, spaces, skills, mcps, prompts, docs] = await Promise.all([
    searchRepos({ topic: 'model', sort: 'updated', limit: 8 }),
    searchRepos({ topic: 'dataset', sort: 'updated', limit: 8 }),
    searchRepos({ topic: 'space', sort: 'updated', limit: 8 }),
    searchRepos({ topic: 'skill', sort: 'updated', limit: 8 }),
    searchRepos({ topic: 'mcp', sort: 'updated', limit: 8 }),
    searchRepos({ topic: 'prompt', sort: 'updated', limit: 8 }),
    searchRepos({ topic: 'doc', sort: 'updated', limit: 8 }),
  ]);

  return (
    <div>
      <section className="mx-auto max-w-5xl pb-8 pt-8 text-center sm:pt-10">
        <BrandMark className="mx-auto mb-5 h-14 w-14 rounded-[15px]" />
        <h1 className="mx-auto max-w-3xl text-3xl font-extrabold leading-tight tracking-normal text-zinc-950 sm:text-4xl">
          The AI community building locally.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zinc-500">
          The platform where your team collaborates on models, datasets, applications, skills, MCP servers, and versioned prompts.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link href="/spaces" className="inline-flex h-10 items-center rounded-full border border-zinc-300 bg-white px-5 font-semibold text-zinc-950 shadow-sm hover:bg-zinc-50">
            Explore AI Apps
          </Link>
          <span className="text-zinc-400">or</span>
          <Link href="/models" className="inline-flex h-10 items-center font-semibold text-zinc-700 underline decoration-zinc-200 underline-offset-8 hover:text-zinc-950">
            Browse models
          </Link>
        </div>
      </section>

      <section className="mx-auto mb-12 grid max-w-[1180px] gap-6 border-y border-zinc-200 py-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-700">Living knowledge</p>
          <h2 className="mt-3 font-serif text-4xl leading-none text-zinc-950">Docs are part of the community.</h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-zinc-600">Publish articles, Wiki nodes, guides, and reference as normal Forgejo repositories—versioned, discussable, and easy to fork.</p>
          <Link href="/docs" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-teal-900 hover:underline">Enter the library <HfIcon name="arrowRight" className="h-3 w-3" /></Link>
        </div>
        <CompactRepoList repos={docs.data} href="/docs" label="Docs" />
      </section>

      <section className="mx-auto mb-12 max-w-[1180px]">
        <div className="mb-5 flex items-center justify-center gap-4 text-lg font-bold text-zinc-950">
          <span className="h-px w-24 bg-violet-200" />
          <span>Agent tooling</span>
          <span className="h-px w-24 bg-cyan-200" />
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <CompactRepoList repos={skills.data} href="/skills" label="Skills" />
          <CompactRepoList repos={mcps.data} href="/mcps" label="MCPs" />
          <CompactRepoList repos={prompts.data} href="/prompts" label="Prompts" />
        </div>
      </section>

      <section className="mx-auto mb-12 max-w-[1180px]">
        <div className="mb-5 flex items-center justify-center gap-4 text-lg font-bold text-zinc-950">
          <span className="h-px w-24 bg-zinc-200" />
          <span>Trending on OpenFace this week</span>
          <span className="h-px w-24 bg-zinc-200" />
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <CompactRepoList repos={models.data} href="/models" label="Models" />
          <CompactRepoList repos={spaces.data} href="/spaces" label="Spaces" />
          <CompactRepoList repos={datasets.data} href="/datasets" label="Datasets" />
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-950">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <HfIcon name="model" className="h-3.5 w-3.5" />
            </span>
            Latest models
          </h2>
          <Link href="/models" className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-950 hover:underline">
            Browse all <HfIcon name="arrowRight" className="h-3 w-3" />
          </Link>
        </div>
        <RepoGrid repos={models.data} kind="model" emptyMessage="No models yet." />
      </section>

      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-950">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200">
              <HfIcon name="space" className="h-3.5 w-3.5" />
            </span>
            Spaces
          </h2>
          <Link href="/spaces" className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-950 hover:underline">
            Browse all <HfIcon name="arrowRight" className="h-3 w-3" />
          </Link>
        </div>
        <RepoGrid repos={spaces.data} kind="space" emptyMessage="No Spaces yet." />
      </section>

      <section className="mb-14">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-950">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
              <HfIcon name="dataset" className="h-3.5 w-3.5" />
            </span>
            Datasets
          </h2>
          <Link href="/datasets" className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-950 hover:underline">
            Browse all <HfIcon name="arrowRight" className="h-3 w-3" />
          </Link>
        </div>
        <RepoGrid repos={datasets.data} kind="dataset" emptyMessage="No datasets yet." />
      </section>

    </div>
  );
}
