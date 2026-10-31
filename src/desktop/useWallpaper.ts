import { useEffect, useState } from 'react';
import type { WallpaperState } from './types';

export function useWallpaper() {
  const [state, setState] = useState<WallpaperState>({
    supported: false,
    enabled: false,
    suspended: false,
    error: null,
  });
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const bridge = window.musicaDesktop;
    if (!bridge) return;
    let alive = true;
    const unsubscribe = bridge.onWallpaperState(setState);
    void bridge
      .getWallpaperState()
      .then((next) => {
        if (alive) setState(next);
      })
      .catch((error: unknown) => {
        if (alive)
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : 'Desktop controls could not load.',
          }));
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const setEnabled = async (enabled: boolean) => {
    if (!window.musicaDesktop || pending) return;
    setPending(true);
    try {
      setState(await window.musicaDesktop.setWallpaperEnabled(enabled));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Desktop mode could not change.',
      }));
    } finally {
      setPending(false);
    }
  };
  return { state, pending, setEnabled };
}
