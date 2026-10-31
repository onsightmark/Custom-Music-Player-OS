const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  session,
  shell,
  Tray,
} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { appId, productName } = require('../electron-builder.config.cjs');
const { createWallpaperController } = require('./wallpaper.cjs');

const appUrl = 'musica://app/index.html';
const dist = path.join(__dirname, '..', 'dist');
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://www.youtube.com https://s.ytimg.com https://w.soundcloud.com",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co",
  'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://w.soundcloud.com',
  "img-src 'self' data: blob: https://i.ytimg.com https://*.sndcdn.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
/** @type {Electron.BrowserWindow | null} */
let player = null;
/** @type {Electron.Tray | null} */
let tray = null;
/** @type {ReturnType<typeof createWallpaperController> | null} */
let wallpaper = null;
let quitting = false;

app.setName(productName);
app.setAppUserModelId(appId);
protocol.registerSchemesAsPrivileged([
  { scheme: 'musica', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** @param {string} raw */
function isAppPage(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'musica:' && url.host === 'app' && url.pathname === '/index.html';
  } catch {
    return false;
  }
}

/** @param {string} raw */
async function openExternal(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    ![
      'github.com',
      'www.youtube.com',
      'youtube.com',
      'youtu.be',
      'soundcloud.com',
      'open.spotify.com',
    ].includes(url.hostname)
  )
    return;
  try {
    await shell.openExternal(url.href);
  } catch {
    if (player)
      await dialog.showMessageBox(player, {
        type: 'error',
        message: 'The link could not open in your browser.',
        detail: url.href,
      });
  }
}

/** @param {Electron.BrowserWindow} window */
function secureWindow(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppPage(url)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

function showPlayer() {
  if (!player || player.isDestroyed()) return;
  if (player.isMinimized()) player.restore();
  player.show();
  player.focus();
}

function updateTray() {
  const enabled = wallpaper?.getState().enabled ?? false;
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open On Sight Musica', click: showPlayer },
      {
        label: enabled ? 'Stop desktop wallpaper' : 'Start desktop wallpaper',
        enabled: wallpaper?.getState().supported ?? false,
        click: () => {
          void wallpaper?.setEnabled(!enabled).then((state) => {
            if (!state.enabled) showPlayer();
          });
        },
      },
      { type: 'separator' },
      { label: 'Quit On Sight Musica', click: () => app.quit() },
    ]),
  );
}

/** @param {Electron.IpcMainInvokeEvent} event */
function assertPlayer(event) {
  if (
    !player ||
    event.sender !== player.webContents ||
    event.senderFrame !== player.webContents.mainFrame ||
    !isAppPage(event.senderFrame.url)
  )
    throw new Error('This action is available only from the music player.');
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showPlayer);
  app.on('activate', showPlayer);
  app.on('before-quit', () => {
    quitting = true;
    wallpaper?.dispose();
    tray?.destroy();
    tray = null;
  });
  app.on('window-all-closed', () => app.quit());

  app
    .whenReady()
    .then(async () => {
      protocol.handle('musica', async (request) => {
        const url = new URL(request.url);
        if (url.host !== 'app' || !['GET', 'HEAD'].includes(request.method))
          return new Response(null, { status: 403 });
        let decoded;
        try {
          decoded = decodeURIComponent(url.pathname);
        } catch {
          return new Response(null, { status: 400 });
        }
        const target = path.resolve(dist, `.${decoded}`);
        const relative = path.relative(dist, target);
        if (
          !relative ||
          relative.startsWith('..') ||
          path.isAbsolute(relative) ||
          decoded.includes('\\') ||
          decoded.includes('\0')
        )
          return new Response(null, { status: 403 });
        try {
          const resolved = await fs.realpath(target);
          const actualRelative = path.relative(dist, resolved);
          if (actualRelative.startsWith('..') || path.isAbsolute(actualRelative))
            return new Response(null, { status: 403 });
          const response = await net.fetch(pathToFileURL(resolved).href, { method: request.method });
          const headers = new Headers(response.headers);
          headers.set('Content-Security-Policy', contentSecurityPolicy);
          headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
          headers.set('X-Content-Type-Options', 'nosniff');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*'] },
        (details, callback) => {
          const isPlayerFrame =
            details.webContentsId === player?.webContents.id && details.resourceType === 'subFrame';
          if (isPlayerFrame) details.requestHeaders.Referer = `https://${appId}/`;
          callback({ requestHeaders: details.requestHeaders });
        },
      );

      wallpaper = createWallpaperController({
        url: appUrl,
        secureWindow,
        onState: (state) => {
          if (player && !player.isDestroyed()) {
            player.webContents.setBackgroundThrottling(!state.enabled);
            player.webContents.send('musica:wallpaper-state', state);
          }
          updateTray();
        },
      });
      player = new BrowserWindow({
        title: productName,
        width: 1440,
        height: 920,
        minWidth: 760,
        minHeight: 560,
        show: false,
        backgroundColor: '#0b1117',
        autoHideMenuBar: true,
        icon: path.join(dist, 'icon-192.png'),
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      secureWindow(player);
      wallpaper.watchExplorer(player);
      const visibility = () => {
        if (player)
          player.webContents.send('musica:player-visibility', player.isVisible() && !player.isMinimized());
      };
      player.on('hide', visibility);
      player.on('minimize', visibility);
      player.on('show', visibility);
      player.on('restore', visibility);
      player.webContents.on('dom-ready', visibility);
      player.on('close', (event) => {
        if (!quitting && wallpaper?.getState().enabled) {
          event.preventDefault();
          player?.hide();
        }
      });
      player.on('closed', () => {
        player = null;
        if (!quitting) app.quit();
      });
      player.webContents.on('render-process-gone', () => {
        void wallpaper?.setEnabled(false);
      });
      ipcMain.handle('musica:wallpaper-state', (event) => {
        if (event.senderFrame !== event.sender.mainFrame || !isAppPage(event.senderFrame.url)) {
          throw new Error('Desktop state is available only to On Sight Musica windows.');
        }
        return wallpaper?.getState();
      });
      ipcMain.handle('musica:wallpaper-enable', (event, enabled) => {
        assertPlayer(event);
        if (typeof enabled !== 'boolean') throw new TypeError('Desktop mode needs a boolean value.');
        return wallpaper?.setEnabled(enabled);
      });
      const image = nativeImage
        .createFromPath(path.join(dist, 'icon-192.png'))
        .resize({ width: 20, height: 20 });
      if (image.isEmpty()) throw new Error('The desktop icon is missing. Run npm run desktop:build.');
      tray = new Tray(image);
      tray.setToolTip(productName);
      tray.on('click', showPlayer);
      updateTray();
      await player.loadURL(appUrl);
      player.show();
    })
    .catch((error) => {
      dialog.showErrorBox(
        'On Sight Musica could not start',
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
}
