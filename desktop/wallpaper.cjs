const { BrowserWindow, powerMonitor, screen } = require('electron');
const path = require('node:path');

/** @typedef {import('../src/desktop/types').WallpaperState} WallpaperState */
/** @typedef {typeof import('../native/build/Release/wallpaper.node')} WindowsDesktop */

/**
 * @param {{url: string, secureWindow: (window: Electron.BrowserWindow) => void, onState: (state: WallpaperState) => void}} options
 */
function createWallpaperController({ url, secureWindow, onState }) {
  /** @type {Electron.BrowserWindow | null} */
  let window = null;
  /** @type {WindowsDesktop | null} */
  let native = null;
  let generation = 0;
  let operation = Promise.resolve();
  let disposed = false;
  /** @type {Set<string>} */
  const interruptions = new Set();
  /** @type {WallpaperState} */
  let state = {
    supported: process.platform === 'win32' || process.platform === 'darwin',
    enabled: false,
    suspended: false,
    error: null,
  };

  function publish() {
    onState({ ...state });
  }

  /** @param {string | null} [error] */
  function stop(error = null) {
    generation += 1;
    const previous = window;
    window = null;
    state = { ...state, enabled: false, suspended: false, error };
    if (previous && !previous.isDestroyed()) previous.destroy();
    publish();
  }

  async function start() {
    if (!state.supported) {
      state = { ...state, error: 'Desktop wallpaper is available in the Windows and macOS desktop app.' };
      publish();
      return { ...state };
    }
    const currentGeneration = ++generation;
    try {
      if (process.platform === 'win32' && !native) {
        native = require('../native/build/Release/wallpaper.node');
      }
      const display = screen.getPrimaryDisplay();
      const createCandidate = () => {
        const candidate = new BrowserWindow({
          ...display.bounds,
          title: 'On Sight Musica Desktop',
          show: false,
          frame: false,
          thickFrame: false,
          focusable: false,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          skipTaskbar: true,
          hasShadow: false,
          backgroundColor: '#0b1117',
          ...(process.platform === 'darwin' ? { type: 'desktop' } : {}),
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
          },
        });
        window = candidate;
        return candidate.getNativeWindowHandle();
      };
      if (native) native.createWindow(createCandidate);
      else createCandidate();
      const candidate = window;
      if (!candidate) throw new Error('The desktop window could not be created.');
      candidate.webContents.setAudioMuted(true);
      candidate.setIgnoreMouseEvents(true);
      secureWindow(candidate);
      candidate.on('closed', () => {
        if (window === candidate) stop('The desktop window closed. Turn desktop mode on to reconnect.');
      });
      candidate.webContents.on('render-process-gone', () => {
        if (window === candidate) stop('The desktop renderer stopped. Turn desktop mode on to reconnect.');
      });
      const timeout = setTimeout(() => {
        if (window === candidate)
          stop('The desktop window took too long to load. Turn desktop mode on to retry.');
      }, 15_000);
      try {
        await candidate.loadURL(`${url}?wallpaper=1`);
      } finally {
        clearTimeout(timeout);
      }
      if (currentGeneration !== generation || candidate.isDestroyed()) return { ...state };
      if (native) native.attach(candidate.getNativeWindowHandle());
      state = { ...state, enabled: true, suspended: interruptions.size > 0, error: null };
      if (!state.suspended) candidate.showInactive();
      publish();
    } catch (error) {
      if (currentGeneration === generation) {
        stop(error instanceof Error ? error.message : 'The desktop window could not start.');
      }
    }
    return { ...state };
  }

  /** @param {boolean} enabled */
  function setEnabled(enabled) {
    const result = operation.then(async () => {
      if (disposed) return { ...state };
      if (!enabled) stop();
      else if (!state.enabled) await start();
      return { ...state };
    });
    operation = result.then(() => {});
    return result;
  }

  /** @param {string} reason @param {boolean} interrupted */
  function interrupt(reason, interrupted) {
    if (interrupted) interruptions.add(reason);
    else interruptions.delete(reason);
    if (!state.enabled || !window || window.isDestroyed()) return;
    state = { ...state, suspended: interruptions.size > 0 };
    if (state.suspended) window.hide();
    else if (native && !native.isAttached(window.getNativeWindowHandle())) {
      stop('Windows restarted the desktop. Turn desktop mode on to reconnect.');
      return;
    } else window.showInactive();
    publish();
  }

  const sleep = () => interrupt('sleep', true);
  const wake = () => interrupt('sleep', false);
  const lock = () => interrupt('lock', true);
  const unlock = () => interrupt('lock', false);
  const changedDisplays = () => {
    if (window) stop('Your display layout changed. Turn desktop mode on to fit the primary display.');
  };
  powerMonitor.on('suspend', sleep);
  powerMonitor.on('resume', wake);
  powerMonitor.on('lock-screen', lock);
  powerMonitor.on('unlock-screen', unlock);
  screen.on('display-added', changedDisplays);
  screen.on('display-removed', changedDisplays);
  screen.on('display-metrics-changed', changedDisplays);

  return {
    getState: () => ({ ...state }),
    setEnabled,
    /** @param {Electron.BrowserWindow} player */
    watchExplorer(player) {
      if (process.platform !== 'win32') return;
      try {
        native = require('../native/build/Release/wallpaper.node');
        if (native) {
          player.hookWindowMessage(native.taskbarMessage, () => {
            if (window) stop('Windows restarted the desktop. Turn desktop mode on to reconnect.');
          });
        }
      } catch {
        state = {
          ...state,
          error:
            'The Windows desktop module is missing. Run npm run desktop:native or reinstall the desktop app.',
        };
      }
    },
    dispose() {
      disposed = true;
      stop();
      powerMonitor.removeListener('suspend', sleep);
      powerMonitor.removeListener('resume', wake);
      powerMonitor.removeListener('lock-screen', lock);
      powerMonitor.removeListener('unlock-screen', unlock);
      screen.removeListener('display-added', changedDisplays);
      screen.removeListener('display-removed', changedDisplays);
      screen.removeListener('display-metrics-changed', changedDisplays);
    },
  };
}

module.exports = { createWallpaperController };
