export const viewports = [
  { id: 'desktop', width: 1440, height: 1000 },
  { id: 'mobile', width: 390, height: 844 },
];

export const themes = [
  { id: 'standard', label: 'Standard', colorScheme: 'light' },
  { id: 'solarpunk', label: 'Solarpunk', colorScheme: 'light' },
  { id: 'cyberpunk', label: 'Cyberpunk', colorScheme: 'dark' },
];

export const routes = [
  { id: 'home', label: 'Home', path: '/', focus: 'Hero, navigation, discovery sections, and card density' },
  { id: 'models', label: 'Models directory', path: '/models', focus: 'Filters, model cards, metadata, and pagination' },
  { id: 'models-filter-controls', label: 'Model filter controls', path: '/models', openDisclosureSelector: 'details[name="model-add-filter-menu"] > summary', openDisclosureViewport: 'mobile', focus: 'A visibly opened mobile filter menu in every theme' },
  { id: 'datasets', label: 'Datasets directory', path: '/datasets', focus: 'Filters, dataset cards, metadata, and pagination' },
  { id: 'spaces', label: 'Spaces directory', path: '/spaces', focus: 'Colorful Space cards, runtime badges, metrics, and pagination' },
  { id: 'skills', label: 'Skills directory', path: '/skills', focus: 'Skill repository cards, source labels, and filters' },
  { id: 'mcps', label: 'MCPs directory', path: '/mcps', focus: 'MCP repository cards, source labels, and filters' },
  { id: 'prompts', label: 'Prompts directory', path: '/prompts', focus: 'Prompt cards, version labels, and filters' },
  { id: 'new', label: 'Create repository', path: '/new', focus: 'Repository creation form, field labels, and responsive layout' },
  { id: 'model-detail', label: 'Model detail', path: '/openface/vision-transformer-mini', focus: 'README rendering, metadata sidebar, clone control, and tabs' },
  { id: 'model-detail-sample', label: 'Sample model detail', path: '/git/openface/sample-model', settleMs: 1400, scrollSelectors: [{ id: 'inference-providers', selector: '.openface-provider-card' }], focus: 'Generated model card, inference provider panel, long-scroll spacing, and theme contrast' },
  { id: 'dataset-detail', label: 'Dataset detail', path: '/openface/multilingual-text-dataset', focus: 'Dataset README, tags, clone control, and tabs' },
  { id: 'dataset-detail-sample', label: 'Sample dataset detail', path: '/git/openface/sample-dataset', settleMs: 1400, scrollSelectors: [{ id: 'dataset-viewer', selector: '.openface-dataset-viewer' }], focus: 'Generated Dataset Viewer, table readability, mobile overflow, and theme contrast' },
  { id: 'skill-detail', label: 'Skill detail', path: '/openface/repository-polish-skill', focus: 'Imported Skill README, provenance, clone control, and tabs' },
  { id: 'mcp-detail', label: 'MCP detail', path: '/openface/aira-mcp-server', focus: 'Imported MCP README, provenance, clone control, and tabs' },
  { id: 'prompt-detail', label: 'Prompt detail', path: '/openface/mystic-git-auto-commit?revision=v4.2', focus: 'Immutable revision selector, prompt source, and direct-link state' },
  { id: 'repository-files', label: 'Repository files', path: '/openface/mystic-git-auto-commit?tab=files&revision=v4.2', focus: 'Unblurred repository header, file list columns, and tabs' },
  { id: 'space-app', label: 'Embedded Space app', path: '/openface/qr-code-generator', focus: 'OpenFace navigation, Space header, runtime state, and embedded live application', settleMs: 2000 },
  { id: 'space-files', label: 'Space files', path: '/openface/qr-code-generator?tab=files', focus: 'Space repository file list, header clarity, tabs, and Pages card' },
  { id: 'community-list', label: 'Community discussions', path: '/git/openface/qr-code-generator/issues', focus: 'Seeded issue rows, filters, repository tabs, and responsive Community layout' },
  { id: 'community-detail', label: 'Community discussion detail', path: '/git/openface/qr-code-generator/issues/1', focus: 'Issue title, status, author, body, repository navigation, and responsive reading width' },
  { id: 'community-markdown', label: 'Community Markdown discussion', path: '/git/openface/qr-code-generator/issues/4', focus: 'Natural agent discussion with quote, lists, task items, code blocks, table, link, and disclosure rendering' },
  { id: 'community-markdown-disclosure', label: 'Community Markdown disclosure', path: '/git/openface/qr-code-generator/issues/4', openDisclosureSelector: '.comment-body details > summary', focus: 'Markdown contrast and an opened disclosure in every theme' },
  { id: 'forgejo-home', label: 'Forgejo home', path: '/git/', focus: 'Hub hero, catalog links, navigation, and theme surface consistency' },
  { id: 'organization', label: 'Organization profile', path: '/git/openface', focusSelector: '.openface-org-repo-card a', scrollSelectors: [{ id: 'team-members', selector: '.openface-member-cloud' }], focus: 'Organization hero, edge-to-edge mobile surface, real members, repository focus state, and theme contrast' },
  { id: 'user-profile', label: 'User profile', path: '/git/luna-scout', focus: 'Agent profile, repository list, cards, and theme contrast' },
  { id: 'login', label: 'Log in', path: '/git/user/login', focus: 'Authentication card, form controls, links, and themed background' },
  { id: 'signup', label: 'Sign up', path: '/git/user/sign_up', focus: 'Registration card, form controls, validation labels, and themed background' },
  { id: 'pages-live', label: 'OpenFace Pages site', path: '/pages/openface/pages-starter/', themeAware: false, focus: 'Published static page, asset loading, and gateway routing' },
];
