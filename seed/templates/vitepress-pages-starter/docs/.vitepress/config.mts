import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenFace Pages',
  description: 'VitePress documentation published by Forgejo Actions',
  base: process.env.VITEPRESS_BASE ?? '/',
})
