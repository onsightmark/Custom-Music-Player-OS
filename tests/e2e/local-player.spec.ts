import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = (name: string) => resolve('tests/fixtures', name);
const observations = new WeakMap<Page, { errors: string[]; console: string[] }>();
const media = (page: Page) => page.locator('audio, video');
const position = (page: Page) => media(page).evaluate((element: HTMLMediaElement) => element.currentTime);

async function importMedia(page: Page, ...files: string[]) {
  await page.getByRole('button', { name: 'Add music', exact: true }).first().click();
  await page.getByLabel('Import media files').setInputFiles(files.map(fixture));
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

async function moveRange(slider: Locator, steps: number) {
  await slider.focus();
  await slider.press('Home');
  for (let step = 0; step < steps; step += 1) await slider.press('ArrowRight');
}

async function seekNearEnd(page: Page) {
  const slider = page.getByRole('slider', { name: 'Seek', exact: true });
  const bounds = await slider.boundingBox();
  if (!bounds) throw new Error('The seek control has no visible bounds.');
  await slider.click({ position: { x: bounds.width * 0.9, y: bounds.height / 2 } });
}

async function importLyrics(page: Page, file: string) {
  if (
    (await page
      .getByRole('button', { name: 'Lyric settings', exact: true })
      .getAttribute('aria-expanded')) !== 'true'
  ) {
    await page.getByRole('button', { name: 'Lyric settings', exact: true }).click();
  }
  await page.getByLabel('Import lyrics', { exact: true }).setInputFiles(fixture(file));
}

test.beforeEach(async ({ page, context }) => {
  const evidence = { errors: [] as string[], console: [] as string[] };
  const observe = (observedPage: Page) => {
    observations.set(observedPage, evidence);
    observedPage.on('pageerror', (error) => evidence.errors.push(error.message));
    observedPage.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        evidence.console.push(`${message.type()}: ${message.text()}`);
    });
  };
  observe(page);
  context.on('page', observe);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Music, in your light.' })).toBeVisible();
});

test.afterEach(async ({ page, browser, browserName }, testInfo) => {
  const evidence = observations.get(page);
  await testInfo.attach('browser-observations', {
    body: JSON.stringify(
      {
        browserName,
        browserVersion: browser.version(),
        nodeVersion: process.version,
        viewport: page.viewportSize(),
        ...evidence,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  if (!page.isClosed()) {
    const screenshot = testInfo.outputPath('final-state.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('final-state', { path: screenshot, contentType: 'image/png' });
  }
  expect(evidence?.errors ?? [], 'Uncaught application errors').toEqual([]);
});

test('local audio uses a real media clock for play, pause, seek and keyboard controls', async ({ page }) => {
  await importMedia(page, 'tone-a.wav');
  await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await expect
    .poll(() => media(page).evaluate((element: HTMLMediaElement) => element.duration))
    .toBeCloseTo(8, 1);
  expect(await media(page).evaluate((element: HTMLMediaElement) => element.paused)).toBe(true);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(page)).toBeGreaterThan(0.6);
  await expect(page.getByLabel('Elapsed time', { exact: true })).not.toHaveText('0:00');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedAt = await position(page);
  await page.waitForTimeout(350);
  expect(Math.abs((await position(page)) - pausedAt)).toBeLessThan(0.06);

  await moveRange(page.getByRole('slider', { name: 'Seek', exact: true }), 30);
  await expect.poll(() => position(page)).toBeCloseTo(3, 1);
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect.poll(() => media(page).evaluate((element: HTMLMediaElement) => element.volume)).toBe(0);
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  await expect
    .poll(() => media(page).evaluate((element: HTMLMediaElement) => element.volume))
    .toBeCloseTo(0.7, 1);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => position(page)).toBeCloseTo(0, 1);
  await page.keyboard.press('Space');
  await expect.poll(() => position(page)).toBeGreaterThan(0.5);
  await page.keyboard.press('Space');
  await expect.poll(() => media(page).evaluate((element: HTMLMediaElement) => element.paused)).toBe(true);
});

test('a real decoder failure stays visible until a new source is selected', async ({ page }, testInfo) => {
  await importMedia(page, 'corrupt-vp8.webm', 'tone-b.wav');
  await expect(page.getByRole('heading', { name: 'corrupt-vp8', exact: true })).toBeVisible();
  await expect(page.locator('.track-state')).toHaveText('Ready when you are');
  expect(await media(page).evaluate((element: HTMLMediaElement) => element.error)).toBeNull();
  await importLyrics(page, 'words.lrc');
  await page.getByRole('button', { name: 'Close lyric settings' }).click();
  const failedMedia = await media(page).elementHandle();
  if (!failedMedia) throw new Error('The imported video has no native media element.');
  const nativeEvents = await failedMedia.evaluateHandle((element: HTMLMediaElement) => {
    const events: { event: string; trusted: boolean; position: number; error: number | null }[] = [];
    for (const name of ['playing', 'error', 'pause', 'ended', 'seeked']) {
      element.addEventListener(name, (event) => {
        events.push({
          event: name,
          trusted: event.isTrusted,
          position: element.currentTime,
          error: element.error?.code ?? null,
        });
      });
    }
    return events;
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => failedMedia.evaluate((element: HTMLMediaElement) => element.error?.code)).toBe(3);
  await expect(page.getByRole('alert')).toContainText('Playback failed.');
  await expect(page.locator('.track-state')).toHaveText('error');
  const failedEvents = await nativeEvents.jsonValue();
  const playingIndex = failedEvents.findIndex((event) => event.event === 'playing' && event.trusted);
  const failureIndex = failedEvents.findIndex(
    (event) => event.event === 'error' && event.trusted && event.error === 3,
  );
  expect(playingIndex).toBeGreaterThanOrEqual(0);
  expect(failureIndex).toBeGreaterThan(playingIndex);

  await expect
    .poll(() =>
      nativeEvents.evaluate((events) =>
        events.some((event) => event.event === 'pause' && event.trusted && event.error === 3),
      ),
    )
    .toBe(true);
  const pausedAt = await position(page);
  await page.getByRole('button', { name: 'A quiet pulse begins', exact: true }).click();
  await page.waitForTimeout(350);
  await expect(page.getByRole('alert')).toContainText('Playback failed.');
  await expect(page.locator('.track-state')).toHaveText('error');
  await expect(page.getByRole('heading', { name: 'corrupt-vp8', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  expect(Math.abs((await position(page)) - pausedAt)).toBeLessThan(0.06);
  expect(await page.locator('.queue-track-title').allTextContents()).toEqual(['corrupt-vp8', 'tone-b']);
  await testInfo.attach('native-decoder-failure', {
    body: JSON.stringify({ events: await nativeEvents.jsonValue(), pausedAt }, null, 2),
    contentType: 'application/json',
  });

  await page.getByRole('button', { name: 'Select tone-b', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'tone-b', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => position(page)).toBeGreaterThan(0.4);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  expect(await media(page).evaluate((element: HTMLMediaElement) => element.error)).toBeNull();
  expect(
    await failedMedia.evaluate((element: HTMLMediaElement) => ({
      connected: element.isConnected,
      paused: element.paused,
      source: element.getAttribute('src'),
    })),
  ).toEqual({ connected: false, paused: true, source: null });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});

test('natural track endings, repeat and queue edits retire the previous media', async ({ page }) => {
  await importMedia(page, 'tone-a.wav', 'tone-b.wav');
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'tone-b', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous track', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const firstMedia = await media(page).elementHandle();
  if (!firstMedia) throw new Error('The first track has no native media element.');
  await seekNearEnd(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'tone-b', exact: true })).toBeVisible();
  await expect.poll(() => position(page)).toBeGreaterThan(0.3);
  expect(
    await firstMedia.evaluate((element: HTMLMediaElement) => ({
      paused: element.paused,
      source: element.getAttribute('src'),
    })),
  ).toEqual({ paused: true, source: null });
  await expect(media(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Repeat: off', exact: true }).click();
  await page.getByRole('button', { name: 'Repeat: queue', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await seekNearEnd(page);
  expect(await position(page)).toBeGreaterThan(7);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(page)).toBeLessThan(2);
  await expect(page.getByRole('heading', { name: 'tone-b', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Repeat: one', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await seekNearEnd(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => media(page).evaluate((element: HTMLMediaElement) => element.ended && element.paused))
    .toBe(true);
  await expect(page.getByRole('heading', { name: 'tone-b', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Repeat: off', exact: true }).click();
  await seekNearEnd(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await expect.poll(() => position(page)).toBeGreaterThan(0.3);
  await page.getByRole('button', { name: 'Select tone-b', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Move tone-b up', exact: true }).click();
  await expect(page.locator('.queue-select').first()).toHaveAccessibleName('Select tone-b');
  await page.getByRole('button', { name: 'Move tone-b down', exact: true }).click();
  await expect(page.locator('.queue-select').last()).toHaveAccessibleName('Select tone-b');
  const retired = await media(page).elementHandle();
  await page.getByRole('button', { name: 'Remove tone-b', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await expect(page.locator('.queue-track')).toHaveCount(1);
  expect(
    await retired?.evaluate((element: HTMLMediaElement) => element.paused && !element.hasAttribute('src')),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await seekNearEnd(page);
  expect(await position(page)).toBeGreaterThan(7);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(page)).toBeLessThan(2);
  await expect.poll(() => position(page)).toBeGreaterThan(0.3);
  await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove tone-a', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Music, in your light.' })).toBeVisible();
  await expect(media(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.queue-track')).toHaveCount(0);
});

test('LRC and WebVTT follow playback, preserve gaps and export real timed words', async ({
  page,
}, testInfo) => {
  await importMedia(page, 'tone-a.wav');
  await importLyrics(page, 'words.lrc');
  await expect(
    page.getByRole('button', { name: 'Light moves across the room', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Close lyric settings' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A quiet pulse begins', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await moveRange(page.getByRole('slider', { name: 'Seek', exact: true }), 45);
  await expect(page.locator('.lyric-line[aria-current="true"]')).toHaveCount(0);
  await expect(page.getByText('Between lines', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Lyric settings', exact: true }).click();
  await page.getByLabel('Lyric delay in seconds').fill('1');
  await page.getByRole('button', { name: 'Close lyric settings' }).click();
  await page.getByRole('button', { name: 'Every color finds its place', exact: true }).click();
  await expect.poll(() => position(page)).toBeCloseTo(6, 1);
  await expect(
    page.getByRole('button', { name: 'Every color finds its place', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  const desktop = testInfo.outputPath('desktop-lyrics.png');
  await page.screenshot({ path: desktop, fullPage: true });
  await testInfo.attach('desktop-lyrics', { path: desktop, contentType: 'image/png' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Lyric settings', exact: true }).click();
  await expect(page.getByLabel('Lyric delay in seconds')).toHaveValue('1');

  await importLyrics(page, 'words.vtt');
  await expect(page.getByLabel('Lyric delay in seconds')).toHaveValue('0');
  await page.getByRole('button', { name: 'Close lyric settings' }).click();
  await page.getByRole('button', { name: 'Shapes move with the sound', exact: true }).click();
  await expect.poll(() => position(page)).toBeCloseTo(3, 1);
  await expect(page.getByRole('button', { name: 'Shapes move with the sound', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await moveRange(page.getByRole('slider', { name: 'Seek', exact: true }), 55);
  await expect(page.locator('.lyric-line[aria-current="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lyric settings', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('tone-a.lrc');
  const path = await download.path();
  if (!path) throw new Error('The lyric export did not produce a downloaded file.');
  const text = await readFile(path, 'utf8');
  expect(text).toContain('[00:03.00]Shapes move with the sound');
  expect(text).toContain('[00:05.00]\n');
  await testInfo.attach('exported-lyrics', { body: text, contentType: 'text/plain' });
  await page
    .getByLabel('Import lyrics', { exact: true })
    .setInputFiles({ name: 'roundtrip.lrc', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.getByRole('button', { name: 'Close lyric settings' }).click();
  await expect(page.locator('.lyric-line[aria-current="true"]')).toHaveCount(0);
});

test('local video plays and appearance survives reload on desktop and narrow screens', async ({
  page,
}, testInfo) => {
  await importMedia(page, 'backdrop.webm', 'tone-a.wav');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((element: HTMLVideoElement) => element.videoWidth))
    .toBe(640);
  await expect.poll(() => position(page)).toBeGreaterThan(0.6);
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames),
    )
    .toBeGreaterThan(2);
  const video = await page.locator('video').elementHandle();
  const videoScreenshot = testInfo.outputPath('local-video.png');
  await page.screenshot({ path: videoScreenshot, fullPage: true });
  await testInfo.attach('local-video', { path: videoScreenshot, contentType: 'image/png' });
  await page.getByRole('button', { name: 'Select tone-a', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(
    await video?.evaluate((element: HTMLMediaElement) => element.paused && !element.hasAttribute('src')),
  ).toBe(true);
  await expect(page.locator('video')).toHaveCount(0);
  await importLyrics(page, 'words.lrc');
  await page.getByRole('button', { name: 'Close lyric settings' }).click();

  await page.getByRole('button', { name: 'Customize appearance' }).click();
  await page.getByRole('button', { name: 'Ember', exact: true }).click();
  await page.getByLabel('Your own font', { exact: true }).fill('Georgia');
  await page.getByLabel('Lyric animation', { exact: true }).selectOption('still');
  await moveRange(page.getByRole('slider', { name: /^Glass blur/ }), 12);
  await moveRange(page.getByRole('slider', { name: /^Glass opacity/ }), 35);
  await moveRange(page.getByRole('slider', { name: /^Lyric size/ }), 16);
  await page.getByRole('button', { name: 'Close appearance' }).click();
  await expect(page.getByRole('button', { name: 'Customize appearance' })).toBeFocused();
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-theme', 'ember');
  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'still');
  await expect
    .poll(() =>
      page
        .locator('.lyric-line')
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily),
    )
    .toContain('Georgia');
  await expect(page.locator('.lyric-line').first()).toHaveCSS('font-size', '44px');
  await expect(page.locator('.lyric-line').first()).toHaveCSS('transition-duration', '0s');
  await expect
    .poll(() =>
      page.locator('.listening-stage').evaluate((element) => getComputedStyle(element).backdropFilter),
    )
    .toContain('blur(12px)');
  await page.getByRole('button', { name: 'Customize appearance' }).click();
  await expect(page.getByLabel('Your own font', { exact: true })).toHaveValue('Georgia');
  await expect(page.getByRole('slider', { name: /^Glass blur/ })).toHaveValue('12');
  await expect(page.getByRole('slider', { name: /^Glass opacity/ })).toHaveValue('45');
  await expect(page.getByRole('slider', { name: /^Lyric size/ })).toHaveValue('44');
  await page.getByLabel('Lyric animation', { exact: true }).selectOption('flow');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('.ambient-orb')
      .first()
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration)),
  ).toBeLessThan(0.001);
  await page.getByRole('button', { name: 'Close appearance' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(page)).toBeGreaterThan(0.3);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Customize appearance' }).click();
  await expect(page.getByRole('complementary', { name: 'Appearance', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('cached app shell and imported media work after a real offline reload', async ({ page, context }) => {
  await importMedia(page, 'tone-a.wav');
  await importLyrics(page, 'words.lrc');
  await page.getByRole('button', { name: 'Close lyric settings' }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => position(page)).toBeGreaterThan(0.5);
    await expect(
      page.getByRole('button', { name: 'Light moves across the room', exact: true }),
    ).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  } finally {
    await context.setOffline(false);
  }
});

test('a partial import preserves successful files and dialog keyboard focus returns', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add your first track', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Add your first track', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Add music', exact: true }).first().click();
  await page.getByLabel('Import media files').setInputFiles([fixture('tone-a.wav'), fixture('invalid.wav')]);
  await expect(page.getByRole('alert')).toContainText('cannot play that file');
  await page.getByRole('button', { name: 'Close add music' }).click();
  await expect(page.locator('.queue-track')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(page)).toBeGreaterThan(0.3);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await importLyrics(page, 'invalid.lrc');
  await expect(page.getByRole('alert')).toContainText('No timed lyrics were found');
  await importLyrics(page, 'words.lrc');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Light moves across the room', exact: true })).toBeVisible();
});

test('closing a tab during import preserves only playable committed tracks on reopen', async ({
  page,
  context,
}, testInfo) => {
  const audio = await readFile(fixture('tone-a.wav'));
  const count = 64;
  await page.getByRole('button', { name: 'Add music', exact: true }).first().click();
  await page.getByLabel('Import media files').setInputFiles(
    Array.from({ length: count }, (_, index) => ({
      name: `batch-${String(index + 1).padStart(2, '0')}.wav`,
      mimeType: 'audio/wav',
      buffer: audio,
    })),
  );
  await expect
    .poll(() => page.locator('.queue-track').count(), { intervals: [10, 20, 20] })
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Cancel import and close', exact: true })).toBeVisible();
  const observedBeforeClose = await page.locator('.queue-track').count();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const titles = await reopened.locator('.queue-track-title').allTextContents();
  expect(titles.length).toBeGreaterThanOrEqual(observedBeforeClose);
  expect(titles.length).toBeLessThan(count);
  expect(new Set(titles).size).toBe(titles.length);
  for (const title of [titles[0], titles.at(-1)]) {
    if (!title) throw new Error('No imported track survived reopening.');
    await reopened.getByRole('button', { name: `Select ${title}`, exact: true }).click();
    await expect.poll(() => position(reopened)).toBeGreaterThan(0.3);
    await expect
      .poll(() => media(reopened).evaluate((element: HTMLMediaElement) => element.duration))
      .toBeCloseTo(8, 1);
    await reopened.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(media(reopened)).toHaveCount(1);
  }
  await testInfo.attach('interrupted-import', {
    body: JSON.stringify({ requested: count, observedBeforeClose, restoredTitles: titles }, null, 2),
    contentType: 'application/json',
  });
  const screenshot = testInfo.outputPath('reopened-import.png');
  await reopened.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('reopened-import', { path: screenshot, contentType: 'image/png' });
});

test('two windows preserve concurrent additions and converge on the saved selection', async ({
  page,
  context,
}) => {
  await importMedia(page, 'tone-a.wav');
  const peer = await context.newPage();
  await peer.goto('/');
  await expect(peer.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await Promise.all(
    [page, peer].map((window) =>
      window.getByRole('button', { name: 'Add music', exact: true }).first().click(),
    ),
  );
  await Promise.all([
    page.getByLabel('Import media files').setInputFiles(fixture('tone-b.wav')),
    peer.getByLabel('Import media files').setInputFiles(fixture('backdrop.webm')),
  ]);
  for (const window of [page, peer]) {
    await expect(window.getByRole('dialog')).not.toBeVisible();
    await expect(window.locator('.queue-track')).toHaveCount(3);
    expect((await window.locator('.queue-track-title').allTextContents()).sort()).toEqual([
      'backdrop',
      'tone-a',
      'tone-b',
    ]);
  }
  await Promise.all([
    page.getByRole('button', { name: 'Select tone-b', exact: true }).click(),
    peer.getByRole('button', { name: 'Select backdrop', exact: true }).click(),
  ]);
  await expect
    .poll(async () => {
      const titles = await Promise.all(
        [page, peer].map((window) => window.locator('.track-title').textContent()),
      );
      return titles[0] === titles[1] && ['tone-b', 'backdrop'].includes(titles[0] ?? '');
    })
    .toBe(true);
  await Promise.all([page.reload(), peer.reload()]);
  for (const window of [page, peer]) {
    await expect(window.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(window.locator('.queue-track')).toHaveCount(3);
    await expect(media(window)).toHaveCount(1);
  }
  expect(await page.locator('.track-title').textContent()).toBe(
    await peer.locator('.track-title').textContent(),
  );
});
