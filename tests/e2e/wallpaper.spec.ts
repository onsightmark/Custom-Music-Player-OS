import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

async function importTracks(page: Page, ...names: string[]) {
  await page.getByRole('button', { name: 'Add music', exact: true }).first().click();
  await page
    .getByLabel('Import media files')
    .setInputFiles(names.map((name) => resolve('tests/fixtures', name)));
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

async function lyrics(page: Page) {
  await page.getByRole('button', { name: 'Lyric settings', exact: true }).click();
  await page.getByLabel('Import lyrics', { exact: true }).setInputFiles(resolve('tests/fixtures/words.lrc'));
  await page.getByRole('button', { name: 'Close lyric settings' }).click();
}

const clock = (page: Page) =>
  page.locator('.local-media').evaluate((media: HTMLMediaElement) => media.currentTime);

test('seeking after a natural ending resumes at the chosen lyric', async ({ page }) => {
  await page.goto('/');
  await importTracks(page, 'tone-a.wav');
  await lyrics(page);
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  const bounds = await seek.boundingBox();
  if (!bounds) throw new Error('The seek control has no visible bounds.');
  await seek.click({ position: { x: bounds.width * 0.9, y: bounds.height / 2 } });
  expect(await clock(page)).toBeGreaterThan(7);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('.local-media').evaluate((media: HTMLMediaElement) => media.ended))
    .toBe(true);
  await page.getByRole('button', { name: 'Every color finds its place', exact: true }).click();
  await expect.poll(() => clock(page)).toBeCloseTo(5, 1);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => clock(page)).toBeGreaterThan(5.3);
  expect(await clock(page)).toBeLessThan(7);
});

test('wallpaper follows the real audio clock and persists a separately imported background', async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  context.on('page', (opened) => opened.on('pageerror', (error) => errors.push(error.message)));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await importTracks(page, 'tone-a.wav', 'tone-b.wav');
  await lyrics(page);
  await page.getByRole('button', { name: 'Customize appearance' }).click();
  await page
    .getByLabel('Import background', { exact: true })
    .setInputFiles(resolve('tests/fixtures/backdrop.webm'));
  await expect(page.locator('.background-selection')).toContainText('backdrop.webm');
  await page.getByRole('button', { name: 'Close appearance' }).click();

  const opened = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Preview wallpaper', exact: true }).click();
  const preview = await opened;
  await expect(preview.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await expect(preview.locator('audio, iframe')).toHaveCount(0);
  await expect(preview.locator('.wallpaper-queue')).toContainText('tone-b');
  await expect
    .poll(() =>
      preview.getByLabel('Background video').evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  expect(
    await preview.getByLabel('Background video').evaluate((video: HTMLVideoElement) => video.muted),
  ).toBe(true);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await preview.bringToFront();
  await expect.poll(() => clock(page)).toBeGreaterThan(0.5);
  await expect(preview.locator('.lyric-line[aria-current="true"]')).toHaveText('A quiet pulse begins');
  await expect
    .poll(() =>
      preview.getByLabel('Background video').evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(preview.locator('.wallpaper-status')).toContainText('Paused');
  await expect
    .poll(() => preview.getByLabel('Background video').evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true);

  await page.getByRole('button', { name: 'Customize appearance' }).click();
  await page.getByLabel('Import background', { exact: true }).setInputFiles(resolve('public/icon-512.png'));
  await expect(page.locator('.background-selection')).toContainText('icon-512.png');
  await expect(preview.getByAltText('Your imported background')).toBeVisible();
  await expect(preview.locator('video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close appearance' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(preview.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await preview.bringToFront();
  await expect(preview.locator('.wallpaper-status')).toContainText('Listening');
  await expect(preview.locator('.lyric-line[aria-current="true"]')).toHaveText('A quiet pulse begins');
  const screenshot = testInfo.outputPath('wallpaper-audio.png');
  await preview.screenshot({ path: screenshot });
  await testInfo.attach('wallpaper-audio', { path: screenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Customize appearance' }).click();
  await page.getByRole('button', { name: 'Remove background' }).click();
  await expect(preview.getByAltText('Your imported background')).toHaveCount(0);
  await preview.close();
  expect(errors).toEqual([]);
});

test('a local video is mirrored silently and follows pause and lyric seeking', async ({ page, context }) => {
  await page.goto('/');
  await importTracks(page, 'backdrop.webm');
  await lyrics(page);
  const opened = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Preview wallpaper' }).click();
  const preview = await opened;
  await expect(preview.getByRole('heading', { name: 'backdrop', exact: true })).toBeVisible();
  const mirror = preview.getByLabel('Background video');
  await expect
    .poll(() => mirror.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await preview.bringToFront();
  await expect.poll(() => clock(page)).toBeGreaterThan(0.5);
  await expect
    .poll(() => mirror.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0.4);
  expect(await mirror.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Every color finds its place', exact: true }).click();
  await preview.bringToFront();
  await expect.poll(() => mirror.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(5, 1);
  await expect.poll(() => mirror.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await expect(preview.locator('.lyric-line[aria-current="true"]')).toHaveText('Every color finds its place');
  await expect(preview.locator('audio, iframe')).toHaveCount(0);
  await preview.close();
});
