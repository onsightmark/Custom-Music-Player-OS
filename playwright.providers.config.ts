import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const browserName = process.env.MUSICA_PROVIDER_BROWSER ?? 'chromium';
const browser = base.projects?.find((project) => project.name === browserName);
if (!browser) throw new Error('MUSICA_PROVIDER_BROWSER must name a project in playwright.config.ts.');

export default defineConfig({
  ...base,
  testMatch: 'providers.spec.ts',
  testIgnore: [],
  outputDir: '.artifacts/providers/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/providers/report', open: 'never' }],
    ['json', { outputFile: '.artifacts/providers/results.json' }],
  ],
  timeout: 90000,
  retries: 0,
  workers: 1,
  projects: [{ ...browser, name: `${browserName}-live-providers` }],
});
