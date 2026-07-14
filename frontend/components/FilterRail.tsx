import HfIcon, { HfIconName } from './HfIcon';
import type { RepoKind } from '@/lib/forgejo';

interface FilterGroup {
  title: string;
  items: Array<{ label: string; icon?: HfIconName; tone?: string }>;
  range?: { start: string; middle?: string[]; end: string };
}

function rangeTerms(range: NonNullable<FilterGroup['range']>) {
  return [range.start, ...(range.middle || []), range.end];
}

const modelFilters: FilterGroup[] = [
  {
    title: 'Tasks',
    items: [
      { label: 'Text Generation', icon: 'filePen', tone: 'text-rose-500' },
      { label: 'Any-to-Any', icon: 'sparkles', tone: 'text-amber-500' },
      { label: 'Image-to-Text', icon: 'image', tone: 'text-blue-500' },
      { label: 'Image-to-Image', icon: 'image', tone: 'text-sky-500' },
      { label: 'Text-to-Video', icon: 'video', tone: 'text-indigo-500' },
      { label: 'Text-to-Speech', icon: 'microphone', tone: 'text-emerald-500' },
    ],
  },
  {
    title: 'Parameters',
    items: [],
    range: { start: '< 1B', middle: ['6B', '12B', '32B', '128B'], end: '> 500B' },
  },
  {
    title: 'Libraries',
    items: [
      { label: 'PyTorch', icon: 'cube', tone: 'text-orange-500' },
      { label: 'TensorFlow', icon: 'cube', tone: 'text-amber-500' },
      { label: 'JAX', icon: 'chart', tone: 'text-fuchsia-500' },
      { label: 'Transformers', icon: 'model', tone: 'text-yellow-500' },
      { label: 'Diffusers', icon: 'sparkles', tone: 'text-red-500' },
      { label: 'Safetensors', icon: 'box', tone: 'text-zinc-700' },
    ],
  },
  {
    title: 'Apps',
    items: [
      { label: 'vLLM', icon: 'play', tone: 'text-blue-500' },
      { label: 'llama.cpp', icon: 'code', tone: 'text-zinc-700' },
      { label: 'Ollama', icon: 'cube', tone: 'text-zinc-700' },
      { label: 'Gradio', icon: 'space', tone: 'text-orange-500' },
    ],
  },
];

const datasetFilters: FilterGroup[] = [
  {
    title: 'Modalities',
    items: [
      { label: '3D', icon: 'cube', tone: 'text-blue-500' },
      { label: 'Audio', icon: 'microphone', tone: 'text-purple-500' },
      { label: 'Document', icon: 'file', tone: 'text-pink-500' },
      { label: 'Image', icon: 'image', tone: 'text-emerald-500' },
      { label: 'Tabular', icon: 'table', tone: 'text-zinc-600' },
      { label: 'Text', icon: 'filePen', tone: 'text-red-500' },
      { label: 'Video', icon: 'video', tone: 'text-indigo-500' },
    ],
  },
  {
    title: 'Size (rows)',
    items: [],
    range: { start: '< 1K', end: '> 1T' },
  },
  {
    title: 'Format',
    items: [
      { label: 'json', icon: 'code' },
      { label: 'csv', icon: 'table' },
      { label: 'parquet', icon: 'box' },
      { label: 'imagefolder', icon: 'image' },
      { label: 'soundfolder', icon: 'microphone' },
      { label: 'webdataset', icon: 'globe' },
      { label: 'text', icon: 'filePen' },
      { label: 'arrow', icon: 'arrowRight' },
    ],
  },
  {
    title: 'Type',
    items: [
      { label: 'Benchmark', icon: 'trophy', tone: 'text-amber-500' },
      { label: 'Traces', icon: 'sparkles', tone: 'text-blue-500' },
    ],
  },
];

const skillFilters: FilterGroup[] = [
  {
    title: 'Use cases',
    items: [
      { label: 'Automation', icon: 'gear', tone: 'text-violet-500' },
      { label: 'Developer tools', icon: 'code', tone: 'text-indigo-500' },
      { label: 'Design', icon: 'sparkles', tone: 'text-fuchsia-500' },
      { label: 'Hardware', icon: 'cube', tone: 'text-orange-500' },
      { label: 'Documentation', icon: 'file', tone: 'text-blue-500' },
      { label: 'Workflow', icon: 'skill', tone: 'text-violet-600' },
    ],
  },
  {
    title: 'Clients',
    items: [
      { label: 'Codex', icon: 'code' },
      { label: 'Claude Code', icon: 'sparkles' },
      { label: 'CLI', icon: 'gear' },
    ],
  },
];

const mcpFilters: FilterGroup[] = [
  {
    title: 'Capabilities',
    items: [
      { label: 'Search', icon: 'search', tone: 'text-cyan-600' },
      { label: 'Developer tools', icon: 'code', tone: 'text-blue-600' },
      { label: 'Messaging', icon: 'link', tone: 'text-indigo-500' },
      { label: 'Media', icon: 'image', tone: 'text-fuchsia-500' },
      { label: 'Automation', icon: 'gear', tone: 'text-zinc-600' },
    ],
  },
  {
    title: 'Languages',
    items: [
      { label: 'TypeScript', icon: 'code' },
      { label: 'Python', icon: 'filePen' },
      { label: 'Docker', icon: 'box' },
    ],
  },
];

export default function FilterRail({ topic }: { topic: Exclude<RepoKind, 'space'> }) {
  const groups = topic === 'dataset' ? datasetFilters : topic === 'skill' ? skillFilters : topic === 'mcp' ? mcpFilters : modelFilters;
  const basePath = topic === 'dataset' ? '/datasets' : topic === 'skill' ? '/skills' : topic === 'mcp' ? '/mcps' : '/models';
  const filterHref = (label: string) => `${basePath}?q=${encodeURIComponent(label.toLowerCase())}`;

  return (
    <aside className="hidden border-r border-zinc-100 pr-5 lg:block">
      <div className="sticky top-20">
        <div className="mb-7 flex flex-nowrap items-center gap-3 text-sm">
          {['Main', 'Tasks', 'Libraries', 'Languages', 'Licenses', 'Other'].map((tab, index) => (
            <a
              key={tab}
              href={index === 0 ? basePath : filterHref(tab)}
              className={
                index === 0
                  ? 'shrink-0 rounded-full bg-zinc-950 px-3 py-1 text-xs font-bold text-white'
                  : 'shrink-0 py-1 text-xs text-zinc-500 hover:text-zinc-900'
              }
            >
              {tab}
            </a>
          ))}
        </div>

        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-4 text-sm font-medium text-zinc-500">{group.title}</h2>
              {group.range && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
                    {rangeTerms(group.range).map((tick, index, list) => (
                      <a
                        key={tick}
                        href={filterHref(`${group.title} ${tick}`)}
                        className={
                          index === 0 || index === list.length - 1
                            ? 'rounded bg-zinc-100 px-2 py-1 hover:bg-zinc-200 hover:text-zinc-900'
                            : 'hover:text-zinc-900'
                        }
                      >
                        {tick}
                      </a>
                    ))}
                  </div>
                  <div className="relative h-5">
                    <div className="absolute left-1 right-1 top-2 h-1 rounded-full bg-zinc-950" />
                    <a
                      href={filterHref(`${group.title} ${group.range.start}`)}
                      aria-label={`Filter ${group.title} ${group.range.start}`}
                      className="absolute left-0 top-0 h-5 w-5 rounded-full bg-zinc-950 ring-offset-2 hover:ring-2 hover:ring-zinc-300"
                    />
                    <a
                      href={filterHref(`${group.title} ${group.range.end}`)}
                      aria-label={`Filter ${group.title} ${group.range.end}`}
                      className="absolute right-0 top-0 h-5 w-5 rounded-full bg-zinc-950 ring-offset-2 hover:ring-2 hover:ring-zinc-300"
                    />
                  </div>
                </div>
              )}
              {group.items.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <a
                      key={item.label}
                      href={filterHref(item.label)}
                    className="inline-flex h-7 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      {item.icon && <HfIcon name={item.icon} className={`h-3.5 w-3.5 ${item.tone || 'text-zinc-400'}`} />}
                      {item.label}
                    </a>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
