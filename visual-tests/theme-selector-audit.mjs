import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.VISUAL_QA_BASE_URL || 'https://localhost:8443').replace(/\/$/, '');
const outputDir = resolve(process.env.THEME_SELECTOR_QA_OUTPUT_DIR || join(root, 'artifacts', 'theme-selector'));
const cases = [
  { id: 'desktop', viewport: { width: 1440, height: 900 } },
  { id: 'mobile', viewport: { width: 390, height: 844 } },
];
const sequence = [
  { active: 'standard', next: 'Solarpunk' },
  { active: 'solarpunk', next: 'Cyberpunk' },
  { active: 'cyberpunk', next: 'Standard' },
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const results = [];
for (const testCase of cases) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: testCase.viewport,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const defects = [];

  let response = await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  if (response?.status() !== 200) defects.push(`Home returned HTTP ${response?.status() ?? 'none'}`);
  await page.evaluate(() => {
    localStorage.setItem('openface-theme-v2', 'standard');
    localStorage.removeItem('openface-theme');
  });
  response = await page.reload({ waitUntil: 'load' });
  if (response?.status() !== 200) defects.push(`Home reload returned HTTP ${response?.status() ?? 'none'}`);

  if (testCase.id === 'mobile') {
    const menuToggle = page.locator('header details > summary:visible');
    if (await menuToggle.count() !== 1) defects.push('Expected one visible mobile menu toggle');
    else await menuToggle.click();
  }

  const button = page.locator('.openface-theme-selector:visible');
  if (await button.count() !== 1) defects.push(`Expected one visible theme button, found ${await button.count()}`);

  const states = [];
  if (defects.length === 0) {
    for (const expected of sequence) {
      const state = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          active: document.documentElement.dataset.openfaceTheme || 'standard',
          ariaLabel: element.getAttribute('aria-label'),
          width: rect.width,
          height: rect.height,
          stored: localStorage.getItem('openface-theme-v2'),
        };
      });
      states.push(state);
      if (state.active !== expected.active) defects.push(`Expected ${expected.active}, received ${state.active}`);
      if (state.stored !== expected.active) defects.push(`Stored theme should be ${expected.active}, received ${state.stored}`);
      if (!state.ariaLabel?.includes(`Switch to ${expected.next}`)) defects.push(`Unexpected aria-label: ${state.ariaLabel}`);
      if (state.width !== 32 || state.height !== 32) defects.push(`Theme button is ${state.width}×${state.height}, expected 32×32`);
      await page.screenshot({ path: join(outputDir, `${testCase.id}--${expected.active}.png`), fullPage: false });
      await button.click();
    }

    await button.click();
    await page.reload({ waitUntil: 'load' });
    const persisted = await page.evaluate(() => ({
      active: document.documentElement.dataset.openfaceTheme || 'standard',
      stored: localStorage.getItem('openface-theme-v2'),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
    }));
    if (persisted.active !== 'solarpunk' || persisted.stored !== 'solarpunk') defects.push(`Reload did not preserve Solarpunk: ${JSON.stringify(persisted)}`);
    if (persisted.overflow > 2) defects.push(`Horizontal overflow is ${persisted.overflow}px`);
    states.push({ persisted });
  }

  results.push({
    id: testCase.id,
    viewport: testCase.viewport,
    passed: defects.length === 0,
    defects,
    states,
  });
  await context.close();
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  passed: results.every(({ passed }) => passed),
  results,
};
await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, 'REPORT.md'), [
  '# Theme selector audit',
  '',
  `- Result: ${report.passed ? 'PASS' : 'FAIL'}`,
  `- Base URL: ${baseUrl}`,
  '',
  ...results.flatMap((result) => [
    `## ${result.id}`,
    '',
    `- ${result.passed ? 'PASS' : 'FAIL'} — 32px icon control, cycle order, persistence, and overflow`,
    ...result.defects.map((defect) => `- FAIL — ${defect}`),
    ...sequence.map(({ active }) => `- Screenshot: ${relative(root, join(outputDir, `${result.id}--${active}.png`)).replaceAll('\\', '/')}`),
    '',
  ]),
].join('\n'));

if (!report.passed) process.exitCode = 1;
