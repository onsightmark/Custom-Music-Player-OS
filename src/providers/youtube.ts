import type { PlayerSnapshot } from '../types';
import type { MountOptions, ProviderController } from './player';
import { loadYouTube, waitForSdk, type YouTubePlayer } from './sdk';
import { providerInfo } from './types';

const youtubeErrors: Record<number, string> = {
  2: 'YouTube rejected this video link.',
  5: 'This browser cannot play the YouTube video.',
  100: 'This video is private, removed, or unavailable.',
  101: 'The video owner disabled playback in other apps. Open it on YouTube instead.',
  150: 'The video owner disabled playback in other apps. Open it on YouTube instead.',
  153: 'YouTube could not identify this player. Use the installed On Sight Musica app or open the web app over HTTP or HTTPS.',
};

export async function mountYouTube({
  host,
  track,
  signal,
  onSnapshot,
}: MountOptions): Promise<ProviderController> {
  const api = await waitForSdk(loadYouTube(), signal);
  signal.throwIfAborted();
  return new Promise<ProviderController>((resolve, reject) => {
    const element = document.createElement('div');
    host.replaceChildren(element);
    let player: YouTubePlayer | null = null;
    let active = true;
    let ready = false;
    let visibleRatio = 0;
    let progressTimer: number | undefined;
    let bufferingTimer: number | undefined;
    let seekTimer: number | undefined;
    let snapshot: PlayerSnapshot = { status: 'loading', position: 0, duration: null };

    const visible = () => {
      if (document.hidden || window.musicaDesktop?.isPlayerVisible() === false) return false;
      const rect = host.getBoundingClientRect();
      return rect.width >= 200 && rect.height >= 200 && visibleRatio > 0.5;
    };
    const publish = (status: PlayerSnapshot['status'], error?: string) => {
      if (!active) return;
      snapshot = {
        status,
        position: snapshot.position,
        duration: snapshot.duration,
        ...(error ? { error } : {}),
      };
      onSnapshot(snapshot);
    };
    const clock = () => {
      if (!active || !ready || !player) return;
      const position = player.getCurrentTime();
      const duration = player.getDuration();
      if (
        typeof position !== 'number' ||
        !Number.isFinite(position) ||
        position < 0 ||
        typeof duration !== 'number' ||
        !Number.isFinite(duration) ||
        duration < 0
      ) {
        fail(new Error('YouTube returned an invalid playback clock. Select the track again.'));
        return;
      }
      snapshot = { ...snapshot, position, duration: duration > 0 ? duration : null };
      onSnapshot(snapshot);
    };
    const stopProgress = () => {
      window.clearInterval(progressTimer);
      progressTimer = undefined;
    };
    const pauseIfHidden = () => {
      if (
        active &&
        ready &&
        !visible() &&
        (snapshot.status === 'playing' || snapshot.status === 'buffering')
      ) {
        player?.pauseVideo();
        stopProgress();
        window.clearTimeout(bufferingTimer);
        publish('paused');
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visibleRatio = entries.at(-1)?.intersectionRatio ?? 0;
        pauseIfHidden();
      },
      { threshold: [0, 0.5, 1] },
    );
    const destroy = () => {
      if (!active) return;
      active = false;
      window.clearTimeout(readyTimeout);
      window.clearTimeout(seekTimer);
      window.clearTimeout(bufferingTimer);
      stopProgress();
      observer.disconnect();
      document.removeEventListener('visibilitychange', pauseIfHidden);
      window.removeEventListener('musica-player-visibility', pauseIfHidden);
      signal.removeEventListener('abort', abort);
      const retired = player;
      player = null;
      try {
        retired?.destroy();
      } finally {
        host.replaceChildren();
      }
    };
    const abort = () => {
      destroy();
      reject(new DOMException('Player selection changed.', 'AbortError'));
    };
    const fail = (error: Error) => {
      publish('error', error.message);
      destroy();
      reject(error);
    };
    const readyTimeout = window.setTimeout(
      () =>
        fail(new Error('YouTube did not become ready. Check your connection or open this video on YouTube.')),
      15000,
    );
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('visibilitychange', pauseIfHidden);
    window.addEventListener('musica-player-visibility', pauseIfHidden);
    observer.observe(host);

    try {
      player = new api.Player(element, {
        width: '100%',
        height: '100%',
        videoId: track.externalId,
        playerVars: { origin: window.location.origin, playsinline: 1, controls: 1, autoplay: 0 },
        events: {
          onReady() {
            if (!active || !player) return;
            ready = true;
            window.clearTimeout(readyTimeout);
            const iframe = player.getIframe();
            iframe.title = 'YouTube video player';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.style.minWidth = '200px';
            iframe.style.minHeight = '200px';
            iframe.style.border = '0';
            publish('ready');
            clock();
            resolve({
              capabilities: providerInfo.youtube.capabilities,
              controls: {
                play() {
                  if (!active || !player) return;
                  if (!visible()) {
                    publish('blocked', 'Keep the YouTube player visible, then press Play.');
                    return;
                  }
                  player.playVideo();
                },
                pause() {
                  player?.pauseVideo();
                },
                seek(seconds) {
                  if (!active || !player) return;
                  window.clearTimeout(seekTimer);
                  const state = player.getPlayerState();
                  if (state === 1 || state === 2 || state === 3) {
                    player.seekTo(seconds, true);
                    seekTimer = window.setTimeout(clock, 250);
                  } else {
                    player.cueVideoById({ videoId: track.externalId, startSeconds: seconds });
                  }
                },
                setVolume(volume) {
                  player?.setVolume(volume * 100);
                },
              },
              destroy,
            });
          },
          onStateChange(event) {
            if (!active || !ready) return;
            stopProgress();
            window.clearTimeout(bufferingTimer);
            switch (event.data) {
              case -1:
                if (snapshot.status !== 'blocked') publish('ready');
                break;
              case 5:
                publish('ready');
                clock();
                break;
              case 0:
                clock();
                publish('ended');
                break;
              case 1:
                publish('playing');
                pauseIfHidden();
                if (snapshot.status === 'playing') progressTimer = window.setInterval(clock, 250);
                break;
              case 2:
                clock();
                if (snapshot.status !== 'blocked') publish('paused');
                break;
              case 3:
                publish('buffering');
                pauseIfHidden();
                if (snapshot.status === 'buffering')
                  bufferingTimer = window.setTimeout(() => {
                    player?.pauseVideo();
                    publish(
                      'blocked',
                      'YouTube is still loading the video. Check your connection, then press Play or open the original.',
                    );
                  }, 15000);
                break;
            }
          },
          onError(event) {
            const message = typeof event.data === 'number' ? youtubeErrors[event.data] : undefined;
            fail(
              new Error(
                message ?? 'YouTube could not play this video. Open it on YouTube to check availability.',
              ),
            );
          },
          onAutoplayBlocked() {
            stopProgress();
            window.clearTimeout(bufferingTimer);
            publish('blocked', 'Your browser blocked playback. Press Play in the YouTube player.');
          },
        },
      });
    } catch (error) {
      fail(error instanceof Error ? error : new Error('YouTube could not create its player.'));
    }
  });
}
