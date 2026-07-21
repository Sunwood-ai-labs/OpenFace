<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { frontmatter, lang } = useData()
const visible = computed(() => Boolean(frontmatter.value.type))
const typeLabel = computed(() => {
  const labels: Record<string, [string, string]> = {
    article: ['Field note', '読みもの'],
    wiki: ['Knowledge node', '知識ノード'],
    guide: ['Practical guide', '実践ガイド'],
    reference: ['Reference', 'リファレンス']
  }
  const pair = labels[frontmatter.value.type] ?? ['Documentation', 'ドキュメント']
  return lang.value.startsWith('ja') ? pair[1] : pair[0]
})
</script>

<template>
  <header v-if="visible" class="doc-context">
    <div class="doc-context__line">
      <span class="doc-context__type">{{ typeLabel }}</span>
      <span v-if="frontmatter.readingTime" class="doc-context__time">{{ frontmatter.readingTime }}</span>
      <span v-if="frontmatter.updated" class="doc-context__updated">{{ frontmatter.updated }}</span>
    </div>
    <p v-if="frontmatter.description" class="doc-context__description">
      {{ frontmatter.description }}
    </p>
    <ul v-if="frontmatter.tags?.length" class="knowledge-tags" aria-label="Topics">
      <li v-for="tag in frontmatter.tags" :key="tag">{{ tag }}</li>
    </ul>
  </header>
</template>
