import { expect, test as base, type ElectronApplication, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type RunningPlayer = { app: ElectronApplication; player: Page; closed: boolean };
type DesktopSession = { launch: () => Promise<RunningPlayer>; profile: string };
const nativePlatform = process.platform === 'win32' || process.platform === 'darwin';
const fixture = (name: string) => resolve('tests/fixtures', name);

const test = base.extend<{ desktop: DesktopSession }>({
  desktop: async ({ playwright }, runFixture, testInfo) => {
    const profile = await mkdtemp(join(tmpdir(), 'musica-desktop-e2e-'));
    const instances: RunningPlayer[] = [];
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    const desktop = {
      profile,
      async launch() {
        const args = [resolve('desktop/main.cjs'), `--user-data-dir=${profile}`];
        if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
        const app = await playwright._electron.launch({ args, timeout: 30_000 });
        const observe = (page: Page) => {
          page.on('pageerror', (error) => errors.push(error.message));
          page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
          });
        };
        app.on('window', observe);
        await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
        const player = await app.firstWindow();
        observe(player);
        const instance = { app, player, closed: false };
        app.once('close', () => {
          instance.closed = true;
        });
        instances.push(instance);
        await expect(player.locator('.app')).toBeVisible();
        await expect.poll(() => player.evaluate(() => window.musicaDesktop?.isPlayerVisible())).toBe(true);
        return instance;
      },
    };
    try {
      await runFixture(desktop);
    } finally {
      for (const [index, instance] of instances.entries()) {
        if (!instance.closed) {
          for (const [windowIndex, page] of instance.app.windows().entries()) {
            if (!page.isClosed()) {
              const filename = testInfo.outputPath(`window-${index}-${windowIndex}.png`);
              await page.screenshot({ path: filename });
              await testInfo.attach(`window-${index}-${windowIndex}`, {
                path: filename,
                contentType: 'image/png',
              });
            }
          }
          await testInfo.attach(`runtime-${index}`, {
            body: JSON.stringify(
              await instance.app.evaluate(() => ({ platform: process.platform, versions: process.versions })),
              null,
              2,
            ),
            contentType: 'application/json',
          });
          await instance.app.context().tracing.stop({ path: testInfo.outputPath(`trace-${index}.zip`) });
          await instance.app.close();
        }
      }
      await testInfo.attach('renderer-observations', {
        body: JSON.stringify({ errors, consoleErrors }, null, 2),
        contentType: 'application/json',
      });
      await rm(profile, { recursive: true, force: true });
      expect(errors, 'Uncaught desktop renderer errors').toEqual([]);
    }
  },
});

async function importMedia(player: Page, ...names: string[]) {
  await player.getByRole('button', { name: 'Add music', exact: true }).first().click();
  await player.getByLabel('Import media files').setInputFiles(names.map(fixture));
  await expect(player.getByRole('dialog')).not.toBeVisible();
  await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

async function importLyrics(player: Page) {
  await player.getByRole('button', { name: 'Lyric settings', exact: true }).click();
  await player.getByLabel('Import lyrics', { exact: true }).setInputFiles(fixture('words.lrc'));
  await player.getByRole('button', { name: 'Close lyric settings' }).click();
}

const position = (player: Page) =>
  player.locator('.local-media').evaluate((media: HTMLMediaElement) => media.currentTime);

async function captureWindowsDesktop(testInfo: TestInfo, phase: string) {
  let evidence;
  try {
    evidence = execFileSync(
      'pwsh',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        resolve('tests/e2e/desktop-shell-diagnostics.ps1'),
      ],
      { encoding: 'utf8', timeout: 15_000, maxBuffer: 128 * 1024, windowsHide: true },
    ).trim();
    JSON.parse(evidence);
  } catch (error) {
    evidence = JSON.stringify({
      diagnosticError: error instanceof Error ? error.message.slice(0, 1200) : 'The desktop probe failed.',
    });
  }
  await testInfo.attach(`windows-desktop-${phase}`, { body: evidence, contentType: 'application/json' });
  return evidence;
}

test('desktop shell isolates content and reports actual native window visibility', async ({ desktop }) => {
  const { app, player } = await desktop.launch();
  await expect(player).toHaveTitle(/On Sight Musica/);
  expect(player.url()).toBe('musica://app/index.html');
  expect(await player.evaluate(() => 'require' in window || 'process' in window)).toBe(false);
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  expect(await realpath(userData)).toBe(await realpath(desktop.profile));
  const resources = await player.evaluate(async () => {
    const app = await fetch(location.href);
    const outside = await fetch('musica://app/%2e%2e%2felectron-builder.config.cjs');
    return { policy: app.headers.get('Content-Security-Policy'), outside: outside.status };
  });
  expect(resources.policy).toContain("object-src 'none'");
  expect(resources.outside).toBe(403);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await expect.poll(() => player.evaluate(() => window.musicaDesktop?.isPlayerVisible())).toBe(false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await expect.poll(() => player.evaluate(() => window.musicaDesktop?.isPlayerVisible())).toBe(true);
  await player.reload();
  await expect.poll(() => player.evaluate(() => window.musicaDesktop?.isPlayerVisible())).toBe(true);
  await expect(player.locator('.app')).toBeVisible();
});

test('imported media and lyrics survive a real desktop application restart', async ({ desktop }) => {
  const first = await desktop.launch();
  await importMedia(first.player, 'tone-a.wav');
  await importLyrics(first.player);
  await first.player.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(first.player)).toBeGreaterThan(0.5);
  await expect(first.player.locator('.lyric-line[aria-current="true"]')).toHaveText(
    'Light moves across the room',
  );
  await first.player.getByRole('button', { name: 'Pause', exact: true }).click();
  const stopped = await position(first.player);
  await first.player.waitForTimeout(350);
  expect(Math.abs((await position(first.player)) - stopped)).toBeLessThan(0.06);
  await first.app.context().tracing.stop();
  await first.app.close();
  const second = await desktop.launch();
  await expect(second.player.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
  await expect(second.player.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await second.player.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(second.player)).toBeGreaterThan(0.4);
  await expect(second.player.locator('.lyric-line[aria-current="true"]')).toHaveText(
    'Light moves across the room',
  );
  await second.player.getByRole('button', { name: 'Pause', exact: true }).click();
  await second.player.getByRole('button', { name: 'A quiet pulse begins', exact: true }).click();
  await expect.poll(() => position(second.player)).toBeCloseTo(2, 1);
});

test(
  nativePlatform
    ? 'native desktop wallpaper mirrors local lyrics and video with one audio owner'
    : 'Linux reports wallpaper unavailable without creating a substitute window',
  async ({ desktop }, testInfo) => {
    const { app, player } = await desktop.launch();
    const initial = await player.evaluate(() => window.musicaDesktop?.getWallpaperState());
    expect(initial?.supported).toBe(nativePlatform);
    await importMedia(player, 'tone-a.wav', 'tone-b.wav', 'backdrop.webm');
    await importLyrics(player);
    if (!nativePlatform) {
      await player.getByRole('button', { name: 'Start desktop wallpaper', exact: true }).click();
      await expect(player.locator('.app-notice[role="status"]')).toContainText(
        'supported on Windows and macOS',
      );
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
      expect((await player.evaluate(() => window.musicaDesktop?.getWallpaperState()))?.enabled).toBe(false);
      return;
    }
    await player.getByRole('button', { name: 'Customize appearance', exact: true }).click();
    await player.getByLabel('Import background', { exact: true }).setInputFiles(fixture('backdrop.webm'));
    await expect(player.getByRole('button', { name: 'Remove background', exact: true })).toBeVisible();
    await player.getByRole('button', { name: 'Close appearance', exact: true }).click();
    const beforeDesktop =
      process.platform === 'win32' ? await captureWindowsDesktop(testInfo, 'before-enable') : null;
    const newWindow = app.waitForEvent('window');
    await player.getByRole('button', { name: 'Start desktop wallpaper', exact: true }).click();
    const wallpaper = await newWindow;
    try {
      await expect
        .poll(
          () =>
            player.evaluate(async () => {
              const state = await window.musicaDesktop?.getWallpaperState();
              return { enabled: state?.enabled, error: state?.error };
            }),
          {
            message:
              'The actual OS must attach its wallpaper window; a missing shell is an acceptance failure.',
          },
        )
        .toEqual({ enabled: true, error: null });
    } catch (error) {
      if (process.platform === 'win32') {
        const afterDesktop = await captureWindowsDesktop(testInfo, 'after-failure');
        console.info(`Windows desktop before enable: ${beforeDesktop?.slice(0, 16_000)}`);
        console.info(`Windows desktop after failure: ${afterDesktop.slice(0, 16_000)}`);
      }
      throw error;
    }
    await expect(wallpaper.getByRole('heading', { name: 'tone-a', exact: true })).toBeVisible();
    await expect(wallpaper.locator('audio, iframe')).toHaveCount(0);
    expect(
      await wallpaper
        .getByLabel('Background video', { exact: true })
        .evaluate((video: HTMLVideoElement) => video.muted),
    ).toBe(true);
    const nativeWindow = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().includes('wallpaper=1'),
      );
      if (!window) throw new Error('No native wallpaper window exists.');
      return {
        id: window.id,
        mediaId: window.getMediaSourceId(),
        muted: window.webContents.isAudioMuted(),
        focusable: window.isFocusable(),
      };
    });
    expect(nativeWindow.muted).toBe(true);
    expect(nativeWindow.focusable).toBe(false);
    if (process.platform === 'win32') {
      const attached = await app.evaluate(({ BrowserWindow }, addon) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node native addons use CommonJS loading inside Electron's main-process evaluator.
        const native: { isAttached: (handle: Buffer) => boolean } = require(addon);
        const window = BrowserWindow.getAllWindows().find((item) =>
          item.webContents.getURL().includes('wallpaper=1'),
        );
        if (!window) throw new Error('The Windows wallpaper window disappeared.');
        return native.isAttached(window.getNativeWindowHandle());
      }, resolve('native/build/Release/wallpaper.node'));
      expect(attached).toBe(true);
    } else {
      const windowId = Number(nativeWindow.mediaId.split(':')[1]);
      if (!Number.isSafeInteger(windowId) || windowId <= 0 || windowId > 0xffff_ffff)
        throw new Error('The macOS wallpaper window has no capture ID.');
      const script = `
import CoreGraphics
import Foundation

guard let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]],
      let window = windows.first(where: {
        ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == CGWindowID(${windowId})
      }),
      let layer = (window[kCGWindowLayer as String] as? NSNumber)?.intValue else {
  throw NSError(domain: "OnSightMusicaDesktopE2E", code: 1, userInfo: [
    NSLocalizedDescriptionKey: "Core Graphics did not report the actual wallpaper window layer."
  ])
}
let observation: [String: Int] = [
  "windowId": ${windowId},
  "layer": layer,
  "desktopIconLayer": Int(CGWindowLevelForKey(.desktopIconWindow))
]
let data = try JSONSerialization.data(withJSONObject: observation)
print(String(decoding: data, as: UTF8.self))
`;
      const observation: unknown = JSON.parse(
        execFileSync('/usr/bin/swift', ['-e', script], { encoding: 'utf8', timeout: 30_000 }),
      );
      if (
        !observation ||
        typeof observation !== 'object' ||
        !('windowId' in observation) ||
        !('layer' in observation) ||
        typeof observation.layer !== 'number' ||
        !('desktopIconLayer' in observation) ||
        typeof observation.desktopIconLayer !== 'number'
      )
        throw new Error('The macOS window probe did not return valid layer measurements.');
      expect(observation.windowId).toBe(windowId);
      expect(observation.layer).toBeLessThan(observation.desktopIconLayer);
      await testInfo.attach('macos-window-layer', {
        body: JSON.stringify(observation),
        contentType: 'application/json',
      });
    }
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => position(player)).toBeGreaterThan(0.4);
    await expect(wallpaper.locator('.lyric-line[aria-current="true"]')).toHaveText(
      'Light moves across the room',
    );
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await player.getByRole('button', { name: 'A quiet pulse begins', exact: true }).click();
    await expect.poll(() => position(player)).toBeCloseTo(2, 1);
    await expect(wallpaper.locator('.lyric-line[aria-current="true"]')).toHaveText('A quiet pulse begins');
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => !item.webContents.getURL().includes('wallpaper=1'))
        ?.close(),
    );
    await expect.poll(() => player.evaluate(() => window.musicaDesktop?.isPlayerVisible())).toBe(false);
    await expect.poll(() => position(player)).toBeGreaterThan(2.5);
    await expect
      .poll(() =>
        player
          .getByLabel('Background video', { exact: true })
          .evaluate((video: HTMLVideoElement) => video.paused),
      )
      .toBe(true);
    await expect
      .poll(() =>
        wallpaper
          .getByLabel('Background video', { exact: true })
          .evaluate((video: HTMLVideoElement) => video.paused),
      )
      .toBe(false);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => !item.webContents.getURL().includes('wallpaper=1'))
        ?.show(),
    );
    await player.getByRole('button', { name: 'Select backdrop', exact: true }).click();
    await expect(wallpaper.getByRole('heading', { name: 'backdrop', exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => !item.webContents.getURL().includes('wallpaper=1'))
        ?.hide(),
    );
    await expect
      .poll(() => wallpaper.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth))
      .toBe(640);
    await expect
      .poll(() =>
        wallpaper
          .locator('video')
          .evaluate((video: HTMLVideoElement) => video.getVideoPlaybackQuality().totalVideoFrames),
      )
      .toBeGreaterThan(2);
    expect(await wallpaper.locator('video').evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
    const audible = await Promise.all(
      [player, wallpaper].map((page) =>
        page
          .locator('audio, video')
          .evaluateAll(
            (elements) =>
              elements.filter(
                (element) =>
                  element instanceof HTMLMediaElement &&
                  !element.paused &&
                  !element.muted &&
                  element.volume > 0,
              ).length,
          ),
      ),
    );
    expect(audible.reduce((sum, count) => sum + count, 0)).toBe(1);
    const screenshot = testInfo.outputPath('native-wallpaper.png');
    await wallpaper.screenshot({ path: screenshot });
    await testInfo.attach('native-wallpaper', { path: screenshot, contentType: 'image/png' });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => !item.webContents.getURL().includes('wallpaper=1'))
        ?.show(),
    );
    await player.getByRole('button', { name: 'Stop desktop wallpaper', exact: true }).click();
    await expect.poll(() => wallpaper.isClosed()).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect((await player.evaluate(() => window.musicaDesktop?.getWallpaperState()))?.enabled).toBe(false);
  },
);
