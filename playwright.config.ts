import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.MUSICA_TEST_PORT ?? 4173);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['local-player.spec.ts', 'wallpaper.spec.ts', 'library-boundaries.spec.ts'],
  outputDir: '.artifacts/playwright/results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/playwright/report', open: 'never' }],
    ['json', { outputFile: '.artifacts/playwright/results.json' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        launchOptions: process.env.MUSICA_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.MUSICA_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
