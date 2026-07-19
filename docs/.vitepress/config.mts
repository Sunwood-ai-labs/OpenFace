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
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'Architecture', link: '/guide/architecture' },
    { text: 'Spaces', link: '/guide/spaces' },
    { text: 'Pages', link: '/guide/pages' },
    { text: 'Visual QA', link: '/guide/visual-qa' },
    { text: 'Operations', link: '/guide/operations' }
  ]
}

function jaNav() {
  return [
    { text: 'ガイド', link: '/ja/guide/getting-started' },
    { text: '構成', link: '/ja/guide/architecture' },
    { text: 'Spaces', link: '/ja/guide/spaces' },
    { text: 'Pages', link: '/ja/guide/pages' },
    { text: 'Visual QA', link: '/ja/guide/visual-qa' },
    { text: '運用', link: '/ja/guide/operations' }
  ]
}

function enSidebar() {
  return [{
    text: 'OpenFace guide',
    items: [
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/guide/architecture' },
      { text: 'Docker Spaces', link: '/guide/spaces' },
      { text: 'OpenFace Pages', link: '/guide/pages' },
      { text: 'Visual QA', link: '/guide/visual-qa' },
      { text: 'GLM maintenance', link: '/guide/automated-maintenance' },
      { text: 'Operations', link: '/guide/operations' },
      { text: 'Troubleshooting', link: '/guide/troubleshooting' }
    ]
  }]
}

function jaSidebar() {
  return [{
    text: 'OpenFace ガイド',
    items: [
      { text: 'はじめに', link: '/ja/guide/getting-started' },
      { text: 'アーキテクチャ', link: '/ja/guide/architecture' },
      { text: 'Docker Spaces', link: '/ja/guide/spaces' },
      { text: 'OpenFace Pages', link: '/ja/guide/pages' },
      { text: 'Visual QA', link: '/ja/guide/visual-qa' },
      { text: 'GLM自動保守', link: '/ja/guide/automated-maintenance' },
      { text: '運用', link: '/ja/guide/operations' },
      { text: 'トラブルシューティング', link: '/ja/guide/troubleshooting' }
    ]
  }]
}
