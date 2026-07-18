import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes, viewports } from './routes.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.VISUAL_QA_BASE_URL || 'https://localhost:8443').replace(/\/$/, '');
const outputDir = resolve(process.env.VISUAL_QA_OUTPUT_DIR || join(root, 'artifacts'));
const selectedViewports = process.env.VISUAL_QA_VIEWPORTS
  ? viewports.filter(({ id }) => process.env.VISUAL_QA_VIEWPORTS.split(',').includes(id))
  : viewports;
const selectedRouteIds = process.env.VISUAL_QA_ROUTES?.split(',').filter(Boolean);
const selectedRoutes = selectedRouteIds ? routes.filter(({ id }) => selectedRouteIds.includes(id)) : routes;

if (selectedRoutes.length === 0 || selectedViewports.length === 0) {
  throw new Error('No visual QA routes or viewports were selected.');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(join(outputDir, 'screenshots'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of selectedViewports) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });

    for (const route of selectedRoutes) {
      const page = await context.newPage();
      if (route.theme) {
        await page.addInitScript((theme) => {
          localStorage.setItem('openface-theme-v2', theme);
          document.cookie = `openface-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
        }, route.theme);
      }
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const httpErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText || 'unknown failure';
        if (!failure.includes('ERR_ABORTED')) failedRequests.push(`${request.method()} ${request.url()}: ${failure}`);
      });
      page.on('response', (networkResponse) => {
        if (networkResponse.status() >= 400) httpErrors.push(`${networkResponse.status()} ${networkResponse.url()}`);
      });

      const startedAt = Date.now();
      let response = null;
      let navigationError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await page.goto(`${baseUrl}${route.path}`, {
            waitUntil: route.waitUntil || 'networkidle',
            timeout: 45_000,
          });
          navigationError = null;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const transientNetworkChange = message.includes('ERR_NETWORK_CHANGED') || message.includes('ERR_CONNECTION_RESET');
          navigationError = message;
          if (!transientNetworkChange || attempt === 1) break;
          await page.waitForTimeout(750);
        }
      }
      if (route.settleMs) await page.waitForTimeout(route.settleMs);
      await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
      if (route.id === 'community-detail' || route.id.startsWith('community-markdown')) {
        await page.evaluate(() => {
          const slugs = ['luna-scout', 'patch-orbit', 'mikan-reviewer'];
          for (const slug of slugs) {
            for (const image of document.querySelectorAll(`a[href$="/${slug}"] img`)) {
              image.loading = 'eager';
            }
          }
        });
        await page.waitForFunction(() => {
          const slugs = ['luna-scout', 'patch-orbit', 'mikan-reviewer'];
          return slugs.every((slug) => Array.from(
            document.querySelectorAll(`a[href$="/${slug}"] img`),
          ).some((image) => image.complete && image.naturalWidth > 0));
        }, undefined, { timeout: 5_000 }).catch(() => undefined);
      }

      let disclosureOpen = null;
      let disclosureCount = null;
      const shouldOpenDisclosure = route.openDisclosureSelector &&
        (!route.openDisclosureViewport || route.openDisclosureViewport === viewport.id);
      if (shouldOpenDisclosure) {
        const summary = page.locator(route.openDisclosureSelector);
        disclosureCount = await summary.count();
        if (disclosureCount === 1) {
          await summary.click();
          disclosureOpen = await summary.evaluate((element) => element.parentElement?.hasAttribute('open') || false);
        }
      }

      const screenshotName = `${viewport.id}--${route.id}.png`;
      const screenshotPath = join(outputDir, 'screenshots', screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const pageState = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        const heading = document.querySelector('h1')?.textContent?.trim() || null;
        const viewportWidth = document.documentElement.clientWidth;
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
        const visibleAppTabLabels = Array.from(document.querySelectorAll('.openface-app-tab'))
          .filter((element) => element.getBoundingClientRect().width > 0)
          .map((element) => element.textContent?.trim() || '')
          .filter(Boolean);
        const virtualAgentSlugs = ['luna-scout', 'patch-orbit', 'mikan-reviewer'];
        const virtualAgentAuthors = virtualAgentSlugs.filter((slug) =>
          document.querySelector(`.timeline-item.comment .author[href$="/${slug}"]`),
        );
        const virtualAgentAvatars = virtualAgentSlugs.map((slug) => {
          const image = document.querySelector(`a[href$="/${slug}"] img`);
          return image ? { slug, src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 } : null;
        }).filter(Boolean);
        const issueCommentCounts = Array.from(document.querySelectorAll(
          '#issue-list .openface-community-comment-count, #issue-list a.flex-text-block',
        ))
          .map((element) => Number(element.textContent?.match(/[0-9]+/)?.[0] || 0));
        const markdownSurface = document.querySelector('.issue-content-left, .ui.timeline');
        return {
          title: document.title,
          openFaceTheme: document.documentElement.getAttribute('data-openface-theme') || 'standard',
          heading,
          viewportWidth,
          scrollWidth,
          horizontalOverflow: Math.max(0, scrollWidth - viewportWidth),
          repositoryNotFound: bodyText.includes('Repository not found'),
          applicationUnavailable: bodyText.includes('Application unavailable'),
          runningBadgeVisible: bodyText.includes('CPU · Running'),
          onDemandStageVisible: bodyText.includes('This Space runs on demand'),
          communityPage: document.body?.getAttribute('data-openface-community-page') || null,
          issueRowCount: document.querySelectorAll('#issue-list .flex-item').length,
          issueCommentCounts,
          virtualAgentAuthors,
          virtualAgentAvatars,
          markdownBlockquotes: markdownSurface?.querySelectorAll('.comment-body blockquote').length || 0,
          markdownLists: markdownSurface?.querySelectorAll('.comment-body ul, .comment-body ol').length || 0,
          markdownTaskItems: markdownSurface?.querySelectorAll('.comment-body input[type="checkbox"]').length || 0,
          markdownCodeBlocks: markdownSurface?.querySelectorAll('.comment-body pre').length || 0,
          markdownTables: markdownSurface?.querySelectorAll('.comment-body table').length || 0,
          markdownLinks: markdownSurface?.querySelectorAll('.comment-body a[href]').length || 0,
          markdownDetails: markdownSurface?.querySelectorAll('.comment-body details').length || 0,
          visibleAppTabLabels,
          bodyPreview: bodyText.replace(/\s+/g, ' ').trim().slice(0, 240),
        };
      }).catch(() => ({
        title: null,
        openFaceTheme: 'standard',
        heading: null,
        viewportWidth: viewport.width,
        scrollWidth: viewport.width,
        horizontalOverflow: 0,
        repositoryNotFound: false,
        applicationUnavailable: false,
        runningBadgeVisible: false,
        onDemandStageVisible: false,
        communityPage: null,
        issueRowCount: 0,
        issueCommentCounts: [],
        virtualAgentAuthors: [],
        virtualAgentAvatars: [],
        markdownBlockquotes: 0,
        markdownLists: 0,
        markdownTaskItems: 0,
        markdownCodeBlocks: 0,
        markdownTables: 0,
        markdownLinks: 0,
        markdownDetails: 0,
        visibleAppTabLabels: [],
        bodyPreview: '',
      }));

      const status = response?.status() ?? null;
      const defects = [];
      if (navigationError) defects.push(`Navigation failed: ${navigationError}`);
      if (status === null || status >= 400) defects.push(`Unexpected HTTP status: ${status ?? 'none'}`);
      if (pageState.horizontalOverflow > 2) defects.push(`Horizontal overflow: ${pageState.horizontalOverflow}px`);
      if (route.theme && pageState.openFaceTheme !== route.theme) defects.push(`Expected ${route.theme} theme but found ${pageState.openFaceTheme}`);
      if (shouldOpenDisclosure && disclosureCount !== 1) defects.push(`Expected one disclosure control but found ${disclosureCount}`);
      if (shouldOpenDisclosure && disclosureOpen !== true) defects.push('Disclosure control did not open after click');
      if (pageState.repositoryNotFound) defects.push('Repository not found empty state is visible');
      if (pageState.applicationUnavailable) defects.push('Embedded application is unavailable');
      if (pageState.runningBadgeVisible && pageState.onDemandStageVisible) defects.push('Runtime badge says Running while the on-demand placeholder is visible');
      if (route.id === 'community-list' && pageState.communityPage !== 'list') defects.push('Community list marker is missing');
      if (route.id === 'community-list' && pageState.issueRowCount < 1) defects.push('Community list has no seeded issue rows');
      if (route.id === 'community-list' && !pageState.issueCommentCounts.includes(3)) defects.push('Seeded three-reply discussion count is missing');
      if (route.id === 'community-detail' && pageState.communityPage !== 'detail') defects.push('Community detail marker is missing');
      if (route.id === 'community-detail' && pageState.virtualAgentAuthors.length !== 3) defects.push('All three virtual-agent participants are not visible');
      if (route.id === 'community-detail' && new Set(pageState.virtualAgentAvatars.map(({ src }) => src)).size !== 3) defects.push('Virtual-agent avatars are not distinct');
      if (route.id === 'community-detail' && pageState.virtualAgentAvatars.some(({ loaded }) => !loaded)) defects.push('A virtual-agent avatar failed to load');
      if (route.id.startsWith('community-markdown') && pageState.communityPage !== 'detail') defects.push('Markdown discussion detail marker is missing');
      if (route.id.startsWith('community-markdown') && pageState.virtualAgentAuthors.length !== 3) defects.push('Markdown discussion does not show all three agent participants');
      if (route.id.startsWith('community-markdown') && pageState.markdownBlockquotes < 1) defects.push('Markdown blockquote is missing');
      if (route.id.startsWith('community-markdown') && pageState.markdownLists < 3) defects.push('Markdown list variants are missing');
      if (route.id.startsWith('community-markdown') && pageState.markdownTaskItems < 3) defects.push('Markdown task list is missing');
      if (route.id.startsWith('community-markdown') && pageState.markdownCodeBlocks < 2) defects.push('Markdown code block variants are missing');
      if (route.id.startsWith('community-markdown') && pageState.markdownTables < 1) defects.push('Markdown table is missing');
      if (route.id.startsWith('community-markdown') && pageState.markdownLinks < 2) defects.push('Markdown links or mention are missing');
      if (route.id.startsWith('community-markdown') && pageState.markdownDetails < 1) defects.push('Markdown disclosure is missing');
      if (route.id.startsWith('community-') && !pageState.visibleAppTabLabels.includes('App')) defects.push('Space repository tab is not labeled App');
      if (pageErrors.length) defects.push(`${pageErrors.length} uncaught page error(s)`);
      if (httpErrors.length) defects.push(`${httpErrors.length} HTTP resource error(s)`);

      const result = {
        id: route.id,
        label: route.label,
        path: route.path,
        requestedUrl: `${baseUrl}${route.path}`,
        finalUrl: page.url(),
        viewport,
        focus: route.focus,
        disclosureCount,
        disclosureOpen,
        status,
        durationMs: Date.now() - startedAt,
        screenshot: relative(outputDir, screenshotPath).replaceAll('\\', '/'),
        ...pageState,
        consoleErrors,
        pageErrors,
        failedRequests,
        httpErrors,
        defects,
        passed: defects.length === 0,
      };
      results.push(result);
      process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${viewport.id.padEnd(7)} ${route.id} (${result.durationMs}ms)\n`);
      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  baseUrl,
  summary: {
    total: results.length,
    passed: results.filter(({ passed }) => passed).length,
    failed: results.filter(({ passed }) => !passed).length,
    screenshots: results.length,
  },
  results,
};

await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const markdown = [
  '# OpenFace visual QA — agent review packet',
  '',
  `Generated: \`${manifest.generatedAt}\`  `,
  `Base URL: \`${baseUrl}\`  `,
  `Result: **${manifest.summary.passed}/${manifest.summary.total} passed**`,
  '',
  '## Agent review instructions',
  '',
  '1. Open every screenshot below; do not infer visual quality from HTTP status alone.',
  '2. Compare the screenshot with the stated review focus.',
  '3. Report clipping, blur, overlap, broken assets, inconsistent spacing, wrong navigation, and misleading runtime state.',
  '4. Use `manifest.json` for exact URLs, viewport sizes, console errors, failed requests, and overflow measurements.',
  '5. For each issue, cite the screenshot filename and describe the visible evidence.',
  '',
  '## Capture index',
  '',
  '| Result | Viewport | Screen | HTTP | Overflow | Screenshot |',
  '|---|---|---|---:|---:|---|',
  ...results.map((result) => `| ${result.passed ? 'PASS' : 'FAIL'} | ${result.viewport.id} (${result.viewport.width}×${result.viewport.height}) | ${result.label} | ${result.status ?? '—'} | ${result.horizontalOverflow}px | [${result.screenshot}](${result.screenshot}) |`),
  '',
  '## Screenshots',
  '',
  ...results.flatMap((result) => [
    `### ${result.viewport.id} / ${result.label}`,
    '',
    `- Route: \`${result.path}\``,
    `- Review focus: ${result.focus}`,
    `- Automated defects: ${result.defects.length ? result.defects.join('; ') : 'none'}`,
    `- Browser observations: ${result.consoleErrors.length} console error(s), ${result.failedRequests.length} failed request(s), ${result.httpErrors.length} HTTP resource error(s)`,
    '',
    `![${result.viewport.id} ${result.label}](${result.screenshot})`,
    '',
  ]),
];
await writeFile(join(outputDir, 'AGENT_REVIEW.md'), `${markdown.join('\n')}\n`);

process.stdout.write(`\nVisual QA packet: ${join(outputDir, 'AGENT_REVIEW.md')}\n`);
process.stdout.write(`Manifest: ${join(outputDir, 'manifest.json')}\n`);

if (manifest.summary.failed > 0) process.exitCode = 1;
