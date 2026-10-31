const { contextBridge, ipcRenderer } = require('electron');

/** @typedef {import('../src/desktop/types').WallpaperState} WallpaperState */

let playerVisible = false;
ipcRenderer.on('musica:player-visibility', (_event, visible) => {
  playerVisible = visible === true;
  window.dispatchEvent(new CustomEvent('musica-player-visibility', { detail: playerVisible }));
});

contextBridge.exposeInMainWorld('musicaDesktop', {
  platform: process.platform,
  isPlayerVisible: () => playerVisible,
  getWallpaperState: () => ipcRenderer.invoke('musica:wallpaper-state'),
  /** @param {boolean} enabled */
  setWallpaperEnabled: (enabled) => ipcRenderer.invoke('musica:wallpaper-enable', enabled),
  /** @param {(state: WallpaperState) => void} listener */
  onWallpaperState: (listener) => {
    /** @param {Electron.IpcRendererEvent} _event @param {WallpaperState} state */
    const receive = (_event, state) => listener(state);
    ipcRenderer.on('musica:wallpaper-state', receive);
    return () => ipcRenderer.removeListener('musica:wallpaper-state', receive);
  },
});
