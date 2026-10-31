import { expect, test, type Page } from '@playwright/test';

const youtubeUrl = process.env.MUSICA_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
const soundCloudUrl = process.env.MUSICA_SOUNDCLOUD_URL ?? 'https://soundcloud.com/forss/flickermood';
const spotifyUrl = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

async function addLink(page: Page, url: string, title: string) {
  await page.getByRole('button', { name: 'Add music to queue', exact: true }).click();
  await page.getByLabel('Track link', { exact: true }).fill(url);
  await page.getByLabel(/Display title/).fill(title);
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

async function position(page: Page) {
  return Number(await page.getByRole('slider', { name: 'Seek', exact: true }).inputValue());
}

async function verifyPlayback(page: Page) {
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled({ timeout: 35000 });
  await play.click();
  await expect
    .poll(() => position(page), {
      timeout: 25000,
      message: 'The real provider clock must advance after playback starts.',
    })
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(play).toBeVisible();
  const pausedAt = await position(page);
  await page.waitForTimeout(1200);
  expect(await position(page), 'The provider clock must stop while paused.').toBeLessThan(pausedAt + 0.6);

  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toBeEnabled();
  const duration = Number(await seek.getAttribute('max'));
  expect(duration, 'The provider must report a finite recording duration.').toBeGreaterThan(5);
  const target = Math.min(20, duration / 3);
  const box = await seek.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('The seek control has no visible rectangle.');
  await seek.click({
    position: { x: Math.max(8, ((box.width - 16) * target) / duration + 8), y: box.height / 2 },
  });
  await expect
    .poll(async () => Math.abs((await position(page)) - target), {
      timeout: 15000,
      message: 'Seeking must change the actual provider clock.',
    })
    .toBeLessThan(Math.max(2, duration * 0.015));
  await play.click();
  const resumedAt = await position(page);
  await expect.poll(() => position(page), { timeout: 15000 }).toBeGreaterThan(resumedAt + 0.8);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('rejects lookalike provider domains and keeps Spotify as an explicit external handoff', async ({
  page,
  context,
}) => {
  const providerRequests: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host.endsWith('spotify.com') || host.endsWith('youtube.com') || host.endsWith('soundcloud.com'))
      providerRequests.push(host);
  });
  await page.getByRole('button', { name: 'Add music to queue', exact: true }).click();
  await page
    .getByLabel('Track link', { exact: true })
    .fill('https://youtube.com.example.org/watch?v=M7lc1UVf-VE');
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not supported');
  await page.getByRole('button', { name: 'Close add music', exact: true }).click();

  const pagesBefore = context.pages().length;
  await addLink(page, spotifyUrl, 'Spotify handoff');
  await page.getByRole('button', { name: 'Select Spotify handoff, opens in Spotify', exact: true }).click();
  await expect(page.getByRole('link', { name: /Open in Spotify/i })).toHaveAttribute('href', spotifyUrl);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'Seek', exact: true })).toBeDisabled();
  expect(context.pages()).toHaveLength(pagesBefore);
  expect(providerRequests, 'Adding or selecting a Spotify handoff must not contact a provider.').toEqual([]);
});

test('YouTube reports real playback, pause and seek and removes its player before a handoff', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await addLink(page, youtubeUrl, 'YouTube API demo');
  await expect(page.locator('iframe[src*="youtube.com/embed/"]')).toHaveCount(1, { timeout: 30000 });
  await verifyPlayback(page);
  await page.screenshot({ path: testInfo.outputPath('youtube-playing.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 360 });
  await page.getByRole('slider', { name: 'Seek', exact: true }).scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
    'YouTube must pause when its player scrolls out of view.',
  ).toBeVisible();
  const hiddenAt = await position(page);
  await page.waitForTimeout(1000);
  expect(await position(page)).toBeLessThan(hiddenAt + 0.6);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[aria-label="YouTube player"]').scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
    'Returning to the player must not resume playback automatically.',
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add music to queue', exact: true }).click();
  await expect(
    page.locator('iframe[src*="youtube.com/embed/"]'),
    'A dialog must not cover a mounted YouTube player.',
  ).toHaveCount(0);
  await page.getByLabel('Track link', { exact: true }).fill(spotifyUrl);
  await page.getByLabel(/Display title/).fill('External destination');
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  const seek = page.getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toBeEnabled({ timeout: 35000 });
  await expect(
    page.getByRole('button', { name: 'Play', exact: true }),
    'Restoring the YouTube position after a dialog must preserve paused playback.',
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const duration = Number(await seek.getAttribute('max'));
  const box = await seek.boundingBox();
  if (!box) throw new Error('The seek control has no visible rectangle.');
  const target = Math.max(0, duration - 4);
  await seek.click({ position: { x: ((box.width - 16) * target) / duration + 8, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(page), { timeout: 15000 }).toBeGreaterThan(duration - 8);
  await expect(
    page.getByRole('link', { name: /Open in Spotify/i }),
    'The real video ended event must advance the queue without opening a popup.',
  ).toBeVisible({ timeout: 25000 });
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('SoundCloud reports real playback and survives repeated source retirement', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await addLink(page, soundCloudUrl, 'SoundCloud API demo');
  await verifyPlayback(page);
  await page.screenshot({ path: testInfo.outputPath('soundcloud-playing.png'), fullPage: true });
  await addLink(page, spotifyUrl, 'External destination');
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page
      .getByRole('button', { name: 'Select External destination, opens in Spotify', exact: true })
      .click();
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.getByRole('button', { name: 'Select SoundCloud API demo', exact: true }).click();
    await expect(page.locator('iframe[src*="w.soundcloud.com/player/"]')).toHaveCount(1);
    await expect.poll(() => position(page), { timeout: 25000 }).toBeGreaterThan(1);
  }
  await page
    .getByRole('button', { name: 'Select External destination, opens in Spotify', exact: true })
    .click();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});
