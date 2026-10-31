type YouTubeEvent = { data?: unknown };

export type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  cueVideoById(options: { videoId: string; startSeconds: number }): void;
  setVolume(percent: number): void;
  getPlayerState(): unknown;
  getCurrentTime(): unknown;
  getDuration(): unknown;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      playerVars: { origin: string; playsinline: number; controls: number; autoplay: number };
      events: {
        onReady(): void;
        onStateChange(event: YouTubeEvent): void;
        onError(event: YouTubeEvent): void;
        onAutoplayBlocked(): void;
      };
    },
  ) => YouTubePlayer;
};

export type SoundCloudWidget = {
  bind(name: string, listener: (data?: unknown) => void): void;
  load(
    url: string,
    options: { auto_play: boolean; single_active: boolean; show_artwork: boolean; callback(): void },
  ): void;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number): void;
  setVolume(percent: number): void;
  getDuration(callback: (duration: unknown) => void): void;
};

type SoundCloudApi = {
  Widget: ((iframe: HTMLIFrameElement) => SoundCloudWidget) & {
    Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      FINISH: string;
      SEEK: string;
      PLAY_PROGRESS: string;
      ERROR: string;
    };
  };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    SC?: SoundCloudApi;
  }
}

function sdkLoader<T>(src: string, read: () => T | undefined): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    const available = read();
    if (available) return Promise.resolve(available);
    if (pending) return pending;
    pending = new Promise<T>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      let settled = false;
      const clean = () => {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        script.onload = null;
        script.onerror = null;
      };
      const check = () => {
        const api = read();
        if (!api || settled) return;
        settled = true;
        clean();
        resolve(api);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        clean();
        script.remove();
        reject(
          new Error(
            'The player could not load. Check your connection or content blocker, then select the track again.',
          ),
        );
      };
      const timeout = window.setTimeout(fail, 15000);
      const poll = window.setInterval(check, 100);
      script.onload = check;
      script.onerror = fail;
      document.head.append(script);
    }).catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

export const loadYouTube = sdkLoader('https://www.youtube.com/iframe_api', () =>
  typeof window.YT?.Player === 'function' ? window.YT : undefined,
);

export const loadSoundCloud = sdkLoader('https://w.soundcloud.com/player/api.js', () =>
  typeof window.SC?.Widget === 'function' ? window.SC : undefined,
);

export function waitForSdk<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Player selection changed.', 'AbortError'));
      return;
    }
    const abort = () => reject(new DOMException('Player selection changed.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
