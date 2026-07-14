import HfIcon, { HfIconName } from '@/components/HfIcon';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New repository - OpenFace',
};

const repoTypes: Array<{
  label: string;
  topic: string;
  icon: HfIconName;
  description: string;
}> = [
  {
    label: 'Model',
    topic: 'model',
    icon: 'model',
    description: 'Weights, configs, tokenizer files, and a model card.',
  },
  {
    label: 'Dataset',
    topic: 'dataset',
    icon: 'dataset',
    description: 'Data files, dataset_infos, splits, and dataset cards.',
  },
  {
    label: 'Space',
    topic: 'space',
    icon: 'space',
    description: 'Interactive apps backed by Gradio, Docker, or static files.',
  },
  {
    label: 'Skill',
    topic: 'skill',
    icon: 'skill',
    description: 'Reusable agent instructions centered on a SKILL.md file.',
  },
  {
    label: 'MCP server',
    topic: 'mcp',
    icon: 'mcp',
    description: 'Tools and resources exposed through Model Context Protocol.',
  },
  {
    label: 'Prompt',
    topic: 'prompt',
    icon: 'prompt',
    description: 'Versioned instructions for agents, workflows, and reusable commands.',
  },
];

const templates = [
  { label: 'Gradio app', topic: 'space', repo: 'my-gradio-space', slug: 'gradio-app' },
  { label: 'Docker Space', topic: 'space', repo: 'my-docker-space', slug: 'docker-space' },
  { label: 'Model card', topic: 'model', repo: 'my-model', slug: 'model-card' },
  { label: 'Dataset card', topic: 'dataset', repo: 'my-dataset', slug: 'dataset-card' },
  { label: 'Agent Skill', topic: 'skill', repo: 'my-agent-skill', slug: 'agent-skill' },
  { label: 'MCP server', topic: 'mcp', repo: 'my-mcp-server', slug: 'mcp-server' },
  { label: 'Versioned prompt', topic: 'prompt', repo: 'my-agent-prompt', slug: 'versioned-prompt' },
  { label: 'Empty repository', topic: 'model', repo: 'my-openface-repo', slug: 'empty-repository' },
];

const typeConfig: Record<string, { title: string; repoPlaceholder: string; cancelHref: string }> = {
  model: { title: 'Create a new model', repoPlaceholder: 'my-awesome-model', cancelHref: '/models' },
  dataset: { title: 'Create a new dataset', repoPlaceholder: 'my-awesome-dataset', cancelHref: '/datasets' },
  space: { title: 'Create a new Space', repoPlaceholder: 'my-awesome-space', cancelHref: '/spaces' },
  skill: { title: 'Create a new Skill', repoPlaceholder: 'my-agent-skill', cancelHref: '/skills' },
  mcp: { title: 'Create a new MCP server', repoPlaceholder: 'my-mcp-server', cancelHref: '/mcps' },
  prompt: { title: 'Create a new Prompt', repoPlaceholder: 'my-agent-prompt', cancelHref: '/prompts' },
};

export default function NewRepoGuidePage({
  searchParams,
}: {
  searchParams?: { type?: string; template?: string };
}) {
  const requestedType = searchParams?.type === 'model' || searchParams?.type === 'dataset' || searchParams?.type === 'space' || searchParams?.type === 'skill' || searchParams?.type === 'mcp' || searchParams?.type === 'prompt'
    ? searchParams.type
    : 'space';
  const config = typeConfig[requestedType];
  const rawTemplate = searchParams?.template?.trim() || '';
  const selectedTemplate = templates.find((template) => template.slug === rawTemplate) || null;
  const duplicateSource = rawTemplate && rawTemplate.includes('/') ? rawTemplate : '';
  const effectiveType = selectedTemplate?.topic || requestedType;
  const effectiveConfig = typeConfig[effectiveType];
  const duplicateRepoName = duplicateSource ? `${duplicateSource.split('/').pop()}-copy` : '';
  const orderedTypes = [
    ...repoTypes.filter((type) => type.topic === effectiveType),
    ...repoTypes.filter((type) => type.topic !== effectiveType),
  ];

  return (
    <div className="mx-auto max-w-[1536px] py-5">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-100 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-normal text-zinc-950">{effectiveConfig.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Choose the OpenFace repository type first, then finish creation in Forgejo. The selected topic keeps the repository visible in its matching OpenFace directory.
          </p>
          {duplicateSource ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
              <HfIcon name="fork" className="h-3 w-3" />
              Duplicating from {duplicateSource}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          form="openface-new-repo-form"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
        >
          <HfIcon name="plus" className="h-3 w-3" />
          Open Forgejo create
        </button>
      </div>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-base font-bold text-zinc-950">Repository details</h2>
          </div>

          <form id="openface-new-repo-form" action="/git/repo/create" method="get" className="space-y-6 p-5">
            {selectedTemplate ? <input type="hidden" name="template" value={selectedTemplate.slug} /> : null}
            {duplicateSource ? <input type="hidden" name="duplicate_from" value={duplicateSource} /> : null}
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-zinc-900">Repository type</legend>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {orderedTypes.map((type) => (
                  <label
                    key={type.topic}
                    className="flex cursor-pointer gap-3 rounded-lg border border-zinc-200 p-3 transition hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    <input
                      type="radio"
                      name="topic"
                      value={type.topic}
                      defaultChecked={type.topic === effectiveType}
                      className="mt-1 h-4 w-4 accent-zinc-950"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-bold text-zinc-950">
                        <HfIcon name={type.icon} className="h-3.5 w-3.5 text-zinc-400" />
                        {type.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-zinc-500">{type.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-zinc-900">Owner</span>
                <select name="owner" className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900">
                  <option>openface</option>
                  <option>openface-admin</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-zinc-900">Repository name</span>
                <input
                  name="repo"
                  defaultValue={duplicateRepoName || selectedTemplate?.repo || ''}
                  placeholder={effectiveConfig.repoPlaceholder}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-zinc-900">Short description</span>
              <textarea
                name="description"
                rows={3}
                defaultValue={duplicateSource ? `Duplicate of ${duplicateSource}` : ''}
                placeholder="A concise description shown on listings and repository headers."
                className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </label>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-zinc-900">Visibility</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50">
                  <input type="radio" name="visibility" value="public" defaultChecked className="mt-1 h-4 w-4 accent-zinc-950" />
                  <span>
                    <span className="block text-sm font-bold text-zinc-950">Public</span>
                    <span className="block text-xs leading-5 text-zinc-500">Appears in OpenFace discovery after adding the matching topic.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50">
                  <input type="radio" name="visibility" value="private" className="mt-1 h-4 w-4 accent-zinc-950" />
                  <span>
                    <span className="block text-sm font-bold text-zinc-950">Private</span>
                    <span className="block text-xs leading-5 text-zinc-500">Visible only to collaborators in Forgejo.</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-5">
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                <HfIcon name="plus" className="h-3 w-3" />
                Continue in Forgejo
              </button>
              <a href={effectiveConfig.cancelHref} className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
                Cancel
              </a>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold text-zinc-950">Starter templates</h2>
            <div className="space-y-2">
              {templates.map((template) => (
                <a
                  key={template.label}
                  href={`/new?type=${template.topic}&template=${encodeURIComponent(template.slug)}`}
                  className={
                    selectedTemplate?.slug === template.slug
                      ? 'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-zinc-900 bg-zinc-950 px-3 py-2 text-left text-sm font-semibold text-white'
                      : 'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-left text-sm text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50'
                  }
                  aria-label={`${template.label} ${template.topic}`}
                >
                  <span className="min-w-0 truncate">
                    {template.label}
                  </span>
                  <span className={selectedTemplate?.slug === template.slug ? 'shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/70' : 'shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500'}>
                    {template.topic}
                  </span>
                  <HfIcon name="arrowRight" className={selectedTemplate?.slug === template.slug ? 'h-3 w-3 text-white/70' : 'h-3 w-3 text-zinc-400'} />
                </a>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold text-zinc-950">Required topic</h2>
            <p className="text-sm leading-6 text-zinc-500">
              After creation, add the matching topic such as <code className="rounded bg-zinc-100 px-1.5 py-0.5">prompt</code> in Forgejo so OpenFace can index it. Prompt versions use an additional topic such as <code className="rounded bg-zinc-100 px-1.5 py-0.5">version-v8</code>.
            </p>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold text-zinc-950">Recommended files</h2>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li className="flex items-center gap-2"><HfIcon name="file" className="h-3.5 w-3.5" />README.md</li>
              <li className="flex items-center gap-2"><HfIcon name="folder" className="h-3.5 w-3.5" />app.py or Dockerfile for Spaces</li>
              <li className="flex items-center gap-2"><HfIcon name="download" className="h-3.5 w-3.5" />Git LFS for large artifacts</li>
            </ul>
          </section>
        </aside>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(() => {
  const form = document.getElementById("openface-new-repo-form");
  if (!form) return;
  const persistCreateState = () => {
    const params = new URLSearchParams();
    for (const el of Array.from(form.elements)) {
      if (!el.name || el.disabled) continue;
      if ((el.type === "radio" || el.type === "checkbox") && !el.checked) continue;
      if (el.value == null || el.value === "") continue;
      params.set(el.name, el.value);
    }
    if (!params.toString()) return;
    try {
      localStorage.setItem("openface.pendingCreateUrl", "/git/repo/create?" + params.toString());
      localStorage.setItem("openface.pendingCreateLabel", "Resume repository creation");
    } catch {}
    document.cookie = "openface_pending_create=" + encodeURIComponent("/git/repo/create?" + params.toString()) + "; path=/; max-age=1800; SameSite=Lax";
  };
  persistCreateState();
  form.addEventListener("input", persistCreateState);
  form.addEventListener("change", persistCreateState);
  form.addEventListener("submit", persistCreateState);
})();
          `,
        }}
      />
    </div>
  );
}
