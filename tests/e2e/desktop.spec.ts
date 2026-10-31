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
    const configuredExecutable = process.env.MUSICA_DESKTOP_EXECUTABLE;
    if (configuredExecutable !== undefined && !configuredExecutable.trim())
      throw new Error('MUSICA_DESKTOP_EXECUTABLE must name a packaged application executable.');
    const executablePath = configuredExecutable ? resolve(configuredExecutable) : undefined;
    const profile = await mkdtemp(join(tmpdir(), 'musica-desktop-e2e-'));
    const instances: RunningPlayer[] = [];
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    const desktop = {
      profile,
      async launch() {
        const args = [...(executablePath ? [] : [resolve('desktop/main.cjs')]), `--user-data-dir=${profile}`];
        if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
        const app = await playwright._electron.launch({ executablePath, args, timeout: 30_000 });
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
        const runtime = await app.evaluate(({ app }) => ({
          platform: process.platform,
          versions: process.versions,
          isPackaged: app.isPackaged,
          executable: process.execPath,
          applicationPath: app.getAppPath(),
        }));
        await testInfo.attach(`runtime-${instances.length - 1}`, {
          body: JSON.stringify(runtime, null, 2),
          contentType: 'application/json',
        });
        expect(runtime.isPackaged).toBe(Boolean(executablePath));
        if (executablePath) expect(await realpath(runtime.executable)).toBe(await realpath(executablePath));
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

type WindowsRect = [number, number, number, number];

type WindowsDesktopNode = {
  handle: string;
  className: string;
  role: string;
  parent: string;
  dpiContext: string;
  dpiName: string;
  process: number;
  thread: number;
  depth: number;
  visible: boolean;
  layered: boolean;
  transparent: boolean;
  noRedirectionBitmap: boolean;
  sameDpiAsParent: boolean;
  sameDpiAsWallpaper: boolean;
  layeredAlpha: number | null;
  rect: WindowsRect | null;
  clientRect: WindowsRect | null;
  clientScreenRect: WindowsRect | null;
};

type WindowsDesktopSnapshot = {
  applicationProcess: number;
  truncated: boolean;
  playerExists: boolean;
  wallpaperExists: boolean;
  probeDpiName: string;
  primaryDisplayRect: WindowsRect;
  processDpi: { context: string; name: string; awareness: number };
  nodes: WindowsDesktopNode[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWindowsRect(value: unknown): value is WindowsRect {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isSafeInteger);
}

function isWindowsNode(value: unknown): value is WindowsDesktopNode {
  return (
    isRecord(value) &&
    ['handle', 'className', 'role', 'parent', 'dpiContext', 'dpiName'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    ['process', 'thread', 'depth'].every(
      (key) => typeof value[key] === 'number' && Number.isSafeInteger(value[key]),
    ) &&
    [
      'visible',
      'layered',
      'transparent',
      'noRedirectionBitmap',
      'sameDpiAsParent',
      'sameDpiAsWallpaper',
    ].every((key) => typeof value[key] === 'boolean') &&
    ['rect', 'clientRect', 'clientScreenRect'].every(
      (key) => value[key] === null || isWindowsRect(value[key]),
    ) &&
    (value.layeredAlpha === null ||
      (typeof value.layeredAlpha === 'number' && value.layeredAlpha >= 0 && value.layeredAlpha <= 255))
  );
}

function isWindowsSnapshot(value: unknown): value is WindowsDesktopSnapshot {
  return (
    isRecord(value) &&
    typeof value.applicationProcess === 'number' &&
    typeof value.truncated === 'boolean' &&
    typeof value.playerExists === 'boolean' &&
    typeof value.wallpaperExists === 'boolean' &&
    typeof value.probeDpiName === 'string' &&
    isWindowsRect(value.primaryDisplayRect) &&
    isRecord(value.processDpi) &&
    typeof value.processDpi.context === 'string' &&
    typeof value.processDpi.name === 'string' &&
    typeof value.processDpi.awareness === 'number' &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isWindowsNode)
  );
}

async function captureWindowsDesktop(
  app: ElectronApplication,
  testInfo: TestInfo,
  phase: string,
  previousWallpaper?: string,
) {
  let evidence;
  let data: WindowsDesktopSnapshot | null = null;
  try {
    const handles = await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const handle = (window: Electron.BrowserWindow | undefined) => {
        if (!window) return '';
        const bytes = window.getNativeWindowHandle();
        const value = bytes.length === 8 ? bytes.readBigUInt64LE() : BigInt(bytes.readUInt32LE());
        return `0x${value.toString(16).toUpperCase()}`;
      };
      return {
        process: process.pid,
        player: handle(windows.find((window) => !window.webContents.getURL().includes('wallpaper=1'))),
        wallpaper: handle(windows.find((window) => window.webContents.getURL().includes('wallpaper=1'))),
      };
    });
    evidence = execFileSync(
      'pwsh',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        resolve('tests/e2e/desktop-shell-diagnostics.ps1'),
        '-ApplicationProcess',
        String(handles.process),
        '-PlayerHandle',
        handles.player,
        '-WallpaperHandle',
        handles.wallpaper || previousWallpaper || '',
      ],
      { encoding: 'utf8', timeout: 15_000, maxBuffer: 128 * 1024, windowsHide: true },
    ).trim();
    const parsed: unknown = JSON.parse(evidence);
    if (!isWindowsSnapshot(parsed))
      throw new Error('The Windows desktop probe returned an invalid snapshot.');
    data = parsed;
  } catch (error) {
    evidence = JSON.stringify({
      diagnosticError: error instanceof Error ? error.message.slice(0, 1200) : 'The desktop probe failed.',
    });
  }
  await testInfo.attach(`windows-desktop-${phase}`, { body: evidence, contentType: 'application/json' });
  return { raw: evidence, data };
}

function checkWindowsPlacement(before: WindowsDesktopSnapshot, after: WindowsDesktopSnapshot) {
  expect(before.truncated).toBe(false);
  expect(after.truncated).toBe(false);
  expect(after.playerExists).toBe(true);
  expect(after.wallpaperExists).toBe(true);
  expect(after.applicationProcess).toBe(before.applicationProcess);
  expect(after.processDpi).toEqual(before.processDpi);
  expect(after.processDpi.name).not.toBe('UNKNOWN');
  expect(before.probeDpiName).toBe('PER_MONITOR_AWARE_V2');
  expect(after.probeDpiName).toBe('PER_MONITOR_AWARE_V2');
  expect(after.primaryDisplayRect).toEqual(before.primaryDisplayRect);
  const previousPlayer = before.nodes.find((node) => node.role === 'player');
  const player = after.nodes.find((node) => node.role === 'player');
  const wallpaper = after.nodes.find((node) => node.role === 'wallpaper');
  const parent = after.nodes.find((node) => node.handle === wallpaper?.parent);
  if (!previousPlayer || !player || !wallpaper || !parent)
    throw new Error('The native snapshot is missing a player, wallpaper, or desktop parent.');
  expect(player.handle).toBe(previousPlayer.handle);
  expect(player.dpiContext).toBe(previousPlayer.dpiContext);
  expect(player.dpiName).toBe(previousPlayer.dpiName);
  expect(player.thread).toBe(previousPlayer.thread);
  expect(wallpaper.process).toBe(after.applicationProcess);
  expect(wallpaper.thread).toBe(player.thread);
  expect(wallpaper.visible).toBe(true);
  expect(wallpaper.transparent).toBe(true);
  expect(wallpaper.sameDpiAsParent).toBe(true);
  expect(parent.sameDpiAsWallpaper).toBe(true);
  expect(wallpaper.dpiName).not.toBe('UNKNOWN');
  expect(wallpaper.depth).toBe(parent.depth + 1);
  expect(wallpaper.rect, 'The wallpaper outer bounds must cover the primary display').toEqual(
    after.primaryDisplayRect,
  );
  expect(wallpaper.clientScreenRect, 'The drawable wallpaper must reach every outer window edge').toEqual(
    wallpaper.rect,
  );
  const [left, top, right, bottom] = after.primaryDisplayRect;
  expect(right).toBeGreaterThan(left);
  expect(bottom).toBeGreaterThan(top);
  expect(wallpaper.clientRect).toEqual([0, 0, right - left, bottom - top]);
  if (parent.className === 'Progman') {
    expect(parent.noRedirectionBitmap).toBe(true);
    expect(wallpaper.layered).toBe(true);
    expect(wallpaper.layeredAlpha).toBe(255);
    const siblings = after.nodes.filter((node) => node.parent === parent.handle);
    const icons = siblings.find((node) => node.className === 'SHELLDLL_DefView');
    const worker = siblings.find((node) => node.className === 'WorkerW');
    if (!icons || !worker) throw new Error('The raised desktop is missing its icons or wallpaper layer.');
    expect(icons.layered).toBe(true);
    expect(worker.visible).toBe(true);
    expect(siblings.indexOf(icons)).toBeLessThan(siblings.indexOf(wallpaper));
    expect(siblings.indexOf(wallpaper)).toBeLessThan(siblings.indexOf(worker));
  } else {
    expect(parent.className).toBe('WorkerW');
    expect(
      after.nodes.some((node) => node.parent === parent.handle && node.className === 'SHELLDLL_DefView'),
    ).toBe(false);
    const icons = after.nodes.find((node) => node.className === 'SHELLDLL_DefView');
    const iconHost = after.nodes.find((node) => node.handle === icons?.parent);
    if (!iconHost) throw new Error('The desktop icon host is missing from the native snapshot.');
    expect(after.nodes.indexOf(iconHost)).toBeLessThan(after.nodes.indexOf(parent));
  }
  return wallpaper.handle;
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

test('imported media and lyrics survive a real desktop application restart', async ({
  desktop,
}, testInfo) => {
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
  await first.app.context().tracing.stop({ path: testInfo.outputPath('trace-before-restart.zip') });
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
      process.platform === 'win32' ? await captureWindowsDesktop(app, testInfo, 'before-enable') : null;
    await player.getByRole('button', { name: 'Start desktop wallpaper', exact: true }).click();
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
        const afterDesktop = await captureWindowsDesktop(app, testInfo, 'after-failure');
        console.info(`Windows desktop before enable: ${beforeDesktop?.raw.slice(0, 16_000)}`);
        console.info(`Windows desktop after failure: ${afterDesktop.raw.slice(0, 16_000)}`);
      }
      throw error;
    }
    const wallpaper = app.windows().find((page) => page.url().includes('wallpaper=1'));
    if (!wallpaper) throw new Error('The enabled desktop has no real wallpaper renderer.');
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
    let wallpaperHandle: string | undefined;
    if (process.platform === 'win32') {
      const afterDesktop = await captureWindowsDesktop(app, testInfo, 'after-show');
      if (!beforeDesktop?.data || !afterDesktop.data)
        throw new Error('Windows desktop diagnostics must succeed to verify native placement and DPI.');
      wallpaperHandle = checkWindowsPlacement(beforeDesktop.data, afterDesktop.data);
      const attachment = await app.evaluate(
        ({ app, BrowserWindow }, source) => {
          const { createRequire } = process.getBuiltinModule('node:module');
          const { join } = process.getBuiltinModule('node:path');
          const packageFile = app.isPackaged ? join(app.getAppPath(), 'package.json') : source.packageFile;
          const addon = app.isPackaged
            ? join(app.getAppPath(), 'native/build/Release/wallpaper.node')
            : source.addon;
          const native: unknown = createRequire(packageFile)(addon);
          if (
            !native ||
            typeof native !== 'object' ||
            !('isAttached' in native) ||
            typeof native.isAttached !== 'function'
          )
            throw new Error('The loaded Windows addon has no attachment probe.');
          const window = BrowserWindow.getAllWindows().find((item) =>
            item.webContents.getURL().includes('wallpaper=1'),
          );
          if (!window) throw new Error('The Windows wallpaper window disappeared.');
          const attached: unknown = native.isAttached(window.getNativeWindowHandle());
          if (typeof attached !== 'boolean')
            throw new Error('The Windows addon returned an invalid attachment result.');
          return { attached, addon, packageFile };
        },
        { packageFile: resolve('package.json'), addon: resolve('native/build/Release/wallpaper.node') },
      );
      await testInfo.attach('windows-native-addon', {
        body: JSON.stringify(attachment, null, 2),
        contentType: 'application/json',
      });
      expect(attachment.attached).toBe(true);
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
    if (process.platform === 'win32') {
      const composite = await app.evaluate(async ({ desktopCapturer, screen }) => {
        const display = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: display.size.width, height: display.size.height },
        });
        const source = sources.find((item) => item.display_id === String(display.id));
        if (!source || source.thumbnail.isEmpty())
          throw new Error('Windows did not provide a primary desktop capture.');
        return source.thumbnail.toPNG().toString('base64');
      });
      await testInfo.attach('windows-desktop-composite', {
        body: Buffer.from(composite, 'base64'),
        contentType: 'image/png',
      });
      const shownDesktop = await captureWindowsDesktop(app, testInfo, 'after-controller-hide');
      if (!beforeDesktop?.data || !shownDesktop.data)
        throw new Error('The visible wallpaper must have a readable native desktop placement.');
      checkWindowsPlacement(beforeDesktop.data, shownDesktop.data);
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => !item.webContents.getURL().includes('wallpaper=1'))
        ?.show(),
    );
    await player.getByRole('button', { name: 'Stop desktop wallpaper', exact: true }).click();
    await expect.poll(() => wallpaper.isClosed()).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect((await player.evaluate(() => window.musicaDesktop?.getWallpaperState()))?.enabled).toBe(false);
    if (process.platform === 'win32') {
      const stoppedDesktop = await captureWindowsDesktop(app, testInfo, 'after-stop', wallpaperHandle);
      if (!beforeDesktop?.data || !stoppedDesktop.data)
        throw new Error('The stopped desktop must have readable native cleanup evidence.');
      expect(stoppedDesktop.data.wallpaperExists).toBe(false);
      expect(stoppedDesktop.data.processDpi).toEqual(beforeDesktop.data.processDpi);
      expect(stoppedDesktop.data.nodes.find((node) => node.role === 'player')?.dpiContext).toBe(
        beforeDesktop.data.nodes.find((node) => node.role === 'player')?.dpiContext,
      );
    }
  },
);
