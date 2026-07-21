import { defineConfig } from 'vitepress'

const repository = 'https://github.com/Sunwood-ai-labs/OpenFace'

export default defineConfig({
  title: 'OpenFace',
  description: 'A local-first, Forgejo-backed AI community hub for models, datasets, Docker Spaces, Skills, MCPs, and versioned Prompts.',
  lang: 'en-US',
  base: process.env.VITEPRESS_BASE ?? '/OpenFace/',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: `${process.env.VITEPRESS_BASE ?? '/OpenFace/'}openface.svg` }],
    ['meta', { name: 'theme-color', content: '#ffcc21' }],
    ['meta', { property: 'og:image', content: `${process.env.VITEPRESS_BASE ?? '/OpenFace/'}social-card.svg` }]
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'OpenFace',
      description: 'Build and run a local AI community hub on your own Docker host.',
      themeConfig: {
        nav: enNav(),
        sidebar: enSidebar(),
        outline: { label: 'On this page' },
        docFooter: { prev: 'Previous', next: 'Next' },
        editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'Edit this page on GitHub' }
      }
    },
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      link: '/ja/',
      title: 'OpenFace',
      description: '自分のDockerホストで動かす、ローカルファーストのAIコミュニティハブ。',
      themeConfig: {
        nav: jaNav(),
        sidebar: jaSidebar(),
        outline: { label: 'このページの内容' },
        docFooter: { prev: '前へ', next: '次へ' },
        editLink: { pattern: `${repository}/edit/main/docs/:path`, text: 'GitHubでこのページを編集' }
      }
    }
  },
  themeConfig: {
    logo: '/openface.svg',
    siteTitle: 'OpenFace',
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repository }],
    footer: {
      message: 'Released under the MIT License. Third-party components retain their own licenses.',
      copyright: 'Copyright © 2026 Sunwood AI Labs'
    }
  },
  sitemap: { hostname: 'https://sunwood-ai-labs.github.io/OpenFace/' }
})

function enNav() {
  return [
    { text: 'Field notes', link: '/articles/' },
    { text: 'Knowledge atlas', link: '/wiki/' },
    {
      text: 'Build',
      items: [
        { text: 'Getting started', link: '/guide/getting-started' },
        { text: 'Docker Spaces', link: '/guide/spaces' },
        { text: 'OpenFace Pages', link: '/guide/pages' }
      ]
    },
    {
      text: 'Operate',
      items: [
        { text: 'Automated maintenance', link: '/guide/automated-maintenance' },
        { text: 'Visual QA', link: '/guide/visual-qa' },
        { text: 'Operations', link: '/guide/operations' },
        { text: 'Troubleshooting', link: '/guide/troubleshooting' }
      ]
    }
  ]
}

function jaNav() {
  return [
    { text: '読みもの', link: '/ja/articles/' },
    { text: '知識地図', link: '/ja/wiki/' },
    {
      text: 'つくる',
      items: [
        { text: 'はじめに', link: '/ja/guide/getting-started' },
        { text: 'Docker Spaces', link: '/ja/guide/spaces' },
        { text: 'OpenFace Pages', link: '/ja/guide/pages' }
      ]
    },
    {
      text: '運用する',
      items: [
        { text: '自動メンテナンス', link: '/ja/guide/automated-maintenance' },
        { text: 'Visual QA', link: '/ja/guide/visual-qa' },
        { text: '運用', link: '/ja/guide/operations' },
        { text: 'トラブルシューティング', link: '/ja/guide/troubleshooting' }
      ]
    }
  ]
}

function enSidebar() {
  return {
    '/articles/': [{
      text: 'Field notes',
      items: [
        { text: 'All field notes', link: '/articles/' },
        { text: 'Why a local AI hub?', link: '/articles/local-first-hub' },
        { text: 'Independent review before merge', link: '/articles/independent-review' },
        { text: 'A Space is app + repository', link: '/articles/docker-spaces' }
      ]
    }],
    '/wiki/': wikiSidebar(''),
    '/guide/': guideSidebar('')
  }
}

function jaSidebar() {
  return {
    '/ja/articles/': [{
      text: '読みもの',
      items: [
        { text: 'すべての読みもの', link: '/ja/articles/' },
        { text: 'ローカルAIハブという選択', link: '/ja/articles/local-first-hub' },
        { text: '自動マージの前に、別の目を置く', link: '/ja/articles/independent-review' },
        { text: 'Spaceはアプリで、リポジトリでもある', link: '/ja/articles/docker-spaces' }
      ]
    }],
    '/ja/wiki/': wikiSidebar('/ja', true),
    '/ja/guide/': guideSidebar('/ja', true)
  }
}

function wikiSidebar(prefix: string, ja = false) {
  return [{
    text: ja ? 'Knowledge Atlas' : 'Knowledge atlas',
    items: [
      { text: ja ? '知識地図' : 'Atlas index', link: `${prefix}/wiki/` },
      { text: ja ? 'プラットフォーム地図' : 'Platform map', link: `${prefix}/wiki/platform-map` },
      { text: ja ? 'カタログの構造' : 'Catalog anatomy', link: `${prefix}/wiki/catalog` },
      { text: ja ? '実行環境' : 'Runtime', link: `${prefix}/wiki/runtime` },
      { text: ja ? 'エージェント運用' : 'Agent operations', link: `${prefix}/wiki/agent-operations` },
      { text: ja ? '用語集' : 'Glossary', link: `${prefix}/wiki/glossary` }
    ]
  }]
}

function guideSidebar(prefix: string, ja = false) {
  return [{
    text: ja ? '実践ガイド' : 'Practical guides',
    items: [
      { text: ja ? 'はじめに' : 'Getting started', link: `${prefix}/guide/getting-started` },
      { text: ja ? 'アーキテクチャ' : 'Architecture', link: `${prefix}/guide/architecture` },
      { text: 'Docker Spaces', link: `${prefix}/guide/spaces` },
      { text: 'OpenFace Pages', link: `${prefix}/guide/pages` },
      { text: 'Visual QA', link: `${prefix}/guide/visual-qa` },
      { text: ja ? '自動メンテナンス' : 'Automated maintenance', link: `${prefix}/guide/automated-maintenance` },
      { text: ja ? '運用' : 'Operations', link: `${prefix}/guide/operations` },
      { text: ja ? 'トラブルシューティング' : 'Troubleshooting', link: `${prefix}/guide/troubleshooting` }
    ]
  }]
}
