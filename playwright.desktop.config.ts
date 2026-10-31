import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'desktop.spec.ts',
  outputDir: '.artifacts/desktop/results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/desktop/report', open: 'never' }],
    ['json', { outputFile: '.artifacts/desktop/results.json' }],
  ],
});
