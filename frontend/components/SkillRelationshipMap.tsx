import Link from 'next/link';
import { Repo, SkillDependency } from '@/lib/forgejo';
import HfIcon from './HfIcon';

type ResolvedDependency = SkillDependency & {
  owner: string;
  name: string;
  fullName: string;
  description?: string | null;
};

function splitReference(reference: string, fallbackOwner: string) {
  const [owner, ...nameParts] = reference.split('/');
  return nameParts.length
    ? { owner, name: nameParts.join('/') }
    : { owner: fallbackOwner, name: owner };
}

function matchesReference(reference: string, repo: Repo, fallbackOwner: string) {
  const resolved = splitReference(reference, fallbackOwner);
  const owner = repo.owner?.login ?? repo.full_name.split('/')[0];
  return owner.toLowerCase() === resolved.owner.toLowerCase() && repo.name.toLowerCase() === resolved.name.toLowerCase();
}

function resolveDependency(dependency: SkillDependency, owner: string, catalog: Repo[]): ResolvedDependency {
  const reference = splitReference(dependency.repo, owner);
  const target = catalog.find((repo) => matchesReference(dependency.repo, repo, owner));
  return {
    ...dependency,
    owner: target?.owner?.login ?? reference.owner,
    name: target?.name ?? reference.name,
    fullName: target?.full_name ?? `${reference.owner}/${reference.name}`,
    description: target?.description,
  };
}

function RelationshipCard({ dependency }: { dependency: ResolvedDependency }) {
  return (
    <Link
      href={`/${dependency.owner}/${dependency.name}`}
      data-skill-relationship-link
      className="group block rounded-xl border border-violet-100 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-violet-900/70 dark:bg-zinc-950/70"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-800">
          <HfIcon name="skill" className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-bold text-zinc-900 group-hover:text-violet-800 dark:text-zinc-100 dark:group-hover:text-violet-300">
            {dependency.name}
          </span>
          <span className="mt-1 block text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
            {dependency.reason || dependency.description || 'Linked skill workflow'}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${dependency.type === 'required' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'}`}>
          {dependency.type === 'required' ? 'Required' : 'Recommended'}
        </span>
      </div>
    </Link>
  );
}

export default function SkillRelationshipMap({ repo, catalog }: { repo: Repo; catalog: Repo[] }) {
  const owner = repo.owner?.login ?? repo.full_name.split('/')[0];
  const dependencies = (repo.skill_relationships?.dependencies || []).map((dependency) =>
    resolveDependency(dependency, owner, catalog),
  );
  const incoming = catalog.flatMap((candidate) => {
    const candidateOwner = candidate.owner?.login ?? candidate.full_name.split('/')[0];
    return (candidate.skill_relationships?.dependencies || [])
      .filter((dependency) => matchesReference(dependency.repo, repo, candidateOwner))
      .map((dependency) => ({
        ...dependency,
        owner: candidateOwner,
        name: candidate.name,
        fullName: candidate.full_name,
        description: dependency.reason || candidate.description,
        reason: dependency.reason ? `${candidate.name}: ${dependency.reason}` : candidate.description || undefined,
      }));
  });
  const requiredCount = dependencies.filter(({ type }) => type === 'required').length;
  const connectionCount = dependencies.length + incoming.length;

  return (
    <section
      data-skill-relationship-map
      className="mb-7 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/60 shadow-sm dark:border-violet-900 dark:from-violet-950/35 dark:via-zinc-950 dark:to-fuchsia-950/20"
      aria-labelledby="skill-relationship-title"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-violet-100 px-4 py-3.5 dark:border-violet-900/70 sm:px-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-700 text-white shadow-md shadow-violet-200 dark:shadow-violet-950">
          <HfIcon name="link" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="skill-relationship-title" className="font-semibold text-zinc-950 dark:text-zinc-100">Skill relationships</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Declared in <code>openface.skill.json</code></p>
        </div>
        <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-zinc-950 dark:text-violet-300">
          {connectionCount} connection{connectionCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid items-stretch gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Dependencies</h3>
            <span className="text-[10px] text-zinc-400">{requiredCount} required</span>
          </div>
          <div className="grid gap-2">
            {dependencies.length ? dependencies.map((dependency) => (
              <RelationshipCard key={`${dependency.fullName}-${dependency.type}`} dependency={dependency} />
            )) : (
              <div className="rounded-xl border border-dashed border-violet-200 bg-white/60 px-3 py-5 text-center dark:border-violet-900 dark:bg-zinc-950/40">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Self-contained</p>
                <p className="mt-1 text-[11px] text-zinc-500">No Skill dependency declared</p>
              </div>
            )}
          </div>
        </div>

        <div className="relative flex min-h-28 items-center justify-center py-2 lg:py-8">
          <span className="absolute left-0 right-0 top-1/2 hidden h-px bg-gradient-to-r from-violet-300 via-fuchsia-300 to-violet-300 lg:block dark:from-violet-800 dark:via-fuchsia-800 dark:to-violet-800" />
          <div className="relative z-10 w-full rounded-2xl border-2 border-violet-500 bg-zinc-950 px-3 py-4 text-center text-white shadow-xl shadow-violet-200/60 dark:shadow-violet-950/70">
            <span className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-xl bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40">
              <HfIcon name="skill" className="h-3.5 w-3.5" />
            </span>
            <p className="truncate font-mono text-xs font-bold" title={repo.name}>{repo.name}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300">Current skill</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-fuchsia-700 dark:text-fuchsia-300">Referenced by</h3>
            <span className="text-[10px] text-zinc-400">reverse links</span>
          </div>
          <div className="grid gap-2">
            {incoming.length ? incoming.map((dependency) => (
              <RelationshipCard key={`${dependency.fullName}-${dependency.type}`} dependency={dependency} />
            )) : (
              <div className="rounded-xl border border-dashed border-fuchsia-200 bg-white/60 px-3 py-5 text-center dark:border-fuchsia-900 dark:bg-zinc-950/40">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">No reverse links yet</p>
                <p className="mt-1 text-[11px] text-zinc-500">Other Skills can reference this repository</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
