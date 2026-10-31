export type WallpaperState = {
  supported: boolean;
  enabled: boolean;
  suspended: boolean;
  error: string | null;
};

export type DesktopBridge = {
  platform: string;
  isPlayerVisible(): boolean;
  getWallpaperState(): Promise<WallpaperState>;
  setWallpaperEnabled(enabled: boolean): Promise<WallpaperState>;
  onWallpaperState(listener: (state: WallpaperState) => void): () => void;
};

declare global {
  interface Window {
    musicaDesktop?: DesktopBridge;
  }
}
