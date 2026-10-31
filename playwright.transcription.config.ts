import { defineConfig } from '@playwright/test';
import config from './playwright.config';

const browser = process.env.MUSICA_TRANSCRIPTION_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browser))
  throw new Error('MUSICA_TRANSCRIPTION_BROWSER must be chromium, firefox or webkit.');

export default defineConfig({
  ...config,
  testMatch: 'transcription.spec.ts',
  timeout: 900_000,
  workers: 1,
  projects: config.projects?.filter((project) => project.name === browser),
  outputDir: '.artifacts/transcription/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/transcription/report', open: 'never' }],
    ['json', { outputFile: '.artifacts/transcription/results.json' }],
  ],
});
