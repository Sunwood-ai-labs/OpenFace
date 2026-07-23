import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.VISUAL_QA_BASE_URL || 'https://localhost:8443').replace(/\/$/, '');
const outputDir = resolve(process.env.CHARACTER_QA_OUTPUT_DIR || join(root, 'artifacts', 'characters'));
const themes = ['standard', 'solarpunk', 'cyberpunk'];
const viewports = [
  { id: 'desktop', width: 1440, height: 1000 },
  { id: 'mobile', width: 390, height: 844 },
];
const routes = [
  {
    id: 'directory',
    path: '/characters',
    required: [
      'Ayano Yukimura',
      'Fuhyo',
      'Hisha',
      'Kakugyo',
      'Kohaku',
      'Maki',
      'Momiji',
      'Onizuka',
      'PuruPuru · 30 states',
      'PuruPuru · 6 states',
    ],
    imageMinimum: 11,
    petCards: ['ayano-yukimura', 'fuhyo', 'hisha', 'kakugyo', 'kohaku', 'maki', 'momiji', 'onizuka'],
    animatedPreview: true,
  },
  {
    id: 'purupuru-upper',
    path: '/openface/lumi-jelly-pngtuber',
    required: ['PuruPuru', '6状態', 'avatar/default-settings.json'],
    hrefs: ['/git/openface/lumi-jelly-pngtuber/src/branch/main/avatar/default-settings.json'],
    animatedPreview: true,
  },
  {
    id: 'purupuru-head-motion',
    path: '/openface/lumi-jelly-head-motion-pngtuber',
    required: ['PuruPuru', '5方向・30状態', 'PuruPuru direction-control patch'],
    hrefs: ['/git/openface/lumi-jelly-head-motion-pngtuber/src/branch/main/integration/purupuru-lumi-jelly-head-motion.patch.gz'],
    animatedPreview: true,
    directionControl: true,
  },
  {
    id: 'codex-pet-momiji',
    path: '/openface/character-design-images?pet=momiji',
    required: ['Momiji · Codex Pet', '8パッケージ・1536×1872', '8キャラクター'],
    hrefs: [
      '/git/openface/character-design-images/src/branch/main/assets/pets/momiji/pet.json',
      '/git/openface/character-design-images/src/branch/main/assets/pets/momiji/spritesheet.webp',
    ],
  },
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(join(outputDir, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const theme of themes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true,
      colorScheme: theme === 'cyberpunk' ? 'dark' : 'light',
      reducedMotion: 'no-preference',
    });
    await context.addInitScript((selectedTheme) => {
      localStorage.setItem('openface-theme-v2', selectedTheme);
      document.cookie = `openface-theme=${selectedTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }, theme);

    for (const route of routes) {
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
      const previewBefore = route.animatedPreview
        ? await page.locator('[data-purupuru-preview]').first().getAttribute('data-frame-path')
        : null;
      if (route.animatedPreview) await page.waitForTimeout(800);
      const previewAfter = route.animatedPreview
        ? await page.locator('[data-purupuru-preview]').first().getAttribute('data-frame-path')
        : null;
      let directionChanged = null;
      if (route.directionControl) {
        const directionButton = page.locator('[data-purupuru-direction="right"]');
        await directionButton.click();
        directionChanged = await page.locator('[data-purupuru-preview]').first().getAttribute('data-direction');
      }
      const state = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-openface-theme') || 'standard',
        text: document.body.innerText,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        images: Array.from(document.images).map((image) => ({
          alt: image.alt,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
        })),
        links: Array.from(document.querySelectorAll('a[href]')).map((link) => link.getAttribute('href')),
        petCards: Array.from(document.querySelectorAll('[data-codex-pet-card]')).map((card) => card.getAttribute('data-codex-pet-card')),
      }));
      const missingText = route.required.filter((text) => !state.text.includes(text));
      const missingLinks = (route.hrefs || []).filter((href) => !state.links.includes(href));
      const characterImages = state.images.filter((image) => /preview|プレビュー/i.test(image.alt));
      const brokenImages = characterImages.filter((image) => !image.complete || image.naturalWidth < 1);
      const screenshot = join(outputDir, 'screenshots', `${theme}-${viewport.id}-${route.id}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({
        theme,
        viewport: viewport.id,
        route: route.id,
        status: response?.status() || 0,
        activeTheme: state.theme,
        missingText,
        missingLinks,
        characterImages: characterImages.length,
        brokenImages,
        horizontalOverflow: Math.max(0, state.scrollWidth - state.clientWidth),
        consoleErrors,
        petCards: state.petCards,
        animationChanged: route.animatedPreview ? previewBefore !== previewAfter : null,
        directionChanged,
        screenshot,
        passed:
          response?.status() === 200
          && state.theme === theme
          && missingText.length === 0
          && missingLinks.length === 0
          && brokenImages.length === 0
          && characterImages.length >= (route.imageMinimum || 1)
          && (!route.petCards || route.petCards.every((id) => state.petCards.includes(id)))
          && (!route.animatedPreview || previewBefore !== previewAfter)
          && (!route.directionControl || directionChanged === 'right')
          && state.scrollWidth - state.clientWidth <= 1
          && consoleErrors.length === 0,
      });
      await page.close();
    }
    await context.close();
  }
}

await browser.close();
const failures = results.filter((result) => !result.passed);
const report = { generatedAt: new Date().toISOString(), baseUrl, cases: results.length, failures, results };
await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, 'README.md'), [
  '# Character format visual audit',
  '',
  `- Coverage: ${themes.length} themes × ${viewports.length} viewports × ${routes.length} routes = ${results.length} screenshots`,
  `- Result: ${failures.length === 0 ? 'PASS' : 'FAIL'} (${results.length - failures.length}/${results.length})`,
  '- Checks: eight distinct Codex Pet cards, selected-pet links, real PuruPuru frame changes, direction controls, active theme, console errors, and horizontal overflow.',
  '',
].join('\n'));
console.log(JSON.stringify({ outputDir, cases: results.length, failures: failures.length }, null, 2));
if (failures.length) {
  console.error(JSON.stringify({ characterAuditFailures: failures }, null, 2));
}
if (failures.length) process.exitCode = 1;
