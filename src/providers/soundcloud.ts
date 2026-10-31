import type { PlayerSnapshot } from '../types';
import type { MountOptions, ProviderController } from './player';
import { loadSoundCloud, waitForSdk, type SoundCloudWidget } from './sdk';
import { providerInfo } from './types';

type SoundCloudSlot = {
  iframe: HTMLIFrameElement;
  widget: SoundCloudWidget;
  eventsBound: boolean;
  handlers: Map<string, (data?: unknown) => void>;
  retire?: () => void;
};

let slot: SoundCloudSlot | undefined;

export async function mountSoundCloud({
  host,
  track,
  signal,
  onSnapshot,
}: MountOptions): Promise<ProviderController> {
  const api = await waitForSdk(loadSoundCloud(), signal);
  signal.throwIfAborted();
  slot?.retire?.();
  if (!slot) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}`;
    iframe.title = 'SoundCloud player';
    iframe.width = '100%';
    iframe.height = '166';
    iframe.allow = 'autoplay';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.style.border = '0';
    slot = { iframe, widget: api.Widget(iframe), eventsBound: false, handlers: new Map() };
  }
  const owner = slot;
  const { iframe, widget } = owner;

  return new Promise<ProviderController>((resolve, reject) => {
    let active = true;
    let ready = false;
    let playTimeout: number | undefined;
    let snapshot: PlayerSnapshot = { status: 'loading', position: 0, duration: null };
    const events = api.Widget.Events;

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
    const destroy = () => {
      if (!active) return;
      active = false;
      window.clearTimeout(readyTimeout);
      window.clearTimeout(playTimeout);
      signal.removeEventListener('abort', abort);
      owner.handlers.clear();
      if (ready && iframe.isConnected) widget.pause();
      iframe.onload = null;
      iframe.remove();
      owner.retire = undefined;
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
    const updatePosition = (data: unknown) => {
      if (!active || typeof data !== 'object' || data === null || !('currentPosition' in data)) return;
      const milliseconds = data.currentPosition;
      if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) {
        fail(new Error('SoundCloud returned an invalid playback clock. Select the track again.'));
        return;
      }
      snapshot = { ...snapshot, position: milliseconds / 1000 };
    };
    const readyTimeout = window.setTimeout(
      () =>
        fail(
          new Error(
            'SoundCloud did not become ready. The track may be unavailable or blocked. Open it on SoundCloud to check.',
          ),
        ),
      15000,
    );
    signal.addEventListener('abort', abort, { once: true });
    owner.retire = abort;

    try {
      widget.load(track.url, {
        auto_play: false,
        single_active: true,
        show_artwork: true,
        callback() {
          if (!active) return;
          ready = true;
          owner.handlers.set(events.PLAY, (data) => {
            window.clearTimeout(playTimeout);
            updatePosition(data);
            publish('playing');
          });
          owner.handlers.set(events.PAUSE, (data) => {
            window.clearTimeout(playTimeout);
            updatePosition(data);
            publish('paused');
          });
          owner.handlers.set(events.PLAY_PROGRESS, (data) => {
            updatePosition(data);
            if (active) onSnapshot(snapshot);
          });
          owner.handlers.set(events.SEEK, (data) => {
            updatePosition(data);
            if (active) onSnapshot(snapshot);
          });
          owner.handlers.set(events.FINISH, (data) => {
            window.clearTimeout(playTimeout);
            updatePosition(data);
            publish('ended');
          });
          owner.handlers.set(events.ERROR, () =>
            fail(
              new Error('SoundCloud could not play this track. Open it on SoundCloud to check availability.'),
            ),
          );
          if (!owner.eventsBound) {
            for (const event of owner.handlers.keys()) {
              widget.bind(event, (data) => owner.handlers.get(event)?.(data));
            }
            owner.eventsBound = true;
          }
          widget.getDuration((duration) => {
            if (!active) return;
            if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
              fail(new Error('SoundCloud returned an invalid track duration.'));
              return;
            }
            snapshot = { ...snapshot, duration: duration > 0 ? duration / 1000 : null };
            onSnapshot(snapshot);
          });
          window.clearTimeout(readyTimeout);
          publish('ready');
          resolve({
            capabilities: providerInfo.soundcloud.capabilities,
            controls: {
              play() {
                if (!active) return;
                widget.play();
                window.clearTimeout(playTimeout);
                playTimeout = window.setTimeout(() => {
                  if (snapshot.status !== 'playing')
                    publish('blocked', 'Playback did not start. Press Play inside the SoundCloud player.');
                }, 5000);
              },
              pause() {
                window.clearTimeout(playTimeout);
                if (active) widget.pause();
              },
              seek(seconds) {
                if (active) widget.seekTo(seconds * 1000);
              },
              setVolume(volume) {
                if (active) widget.setVolume(volume * 100);
              },
            },
            destroy,
          });
        },
      });
      host.replaceChildren(iframe);
    } catch (error) {
      fail(error instanceof Error ? error : new Error('SoundCloud could not create its player.'));
    }
  });
}
