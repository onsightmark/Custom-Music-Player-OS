import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { LocalTrack, PlayerControls, PlayerSnapshot } from '../types';
import { getLocalMedia } from '../library/storage';

type LocalPlayerProps = {
  track: LocalTrack;
  volume: number;
  onSnapshot: (snapshot: PlayerSnapshot) => void;
  onEnded: () => void;
  className?: string;
};

export const LocalPlayer = forwardRef<PlayerControls, LocalPlayerProps>(function LocalPlayer(
  { track, volume, onSnapshot, onEnded, className },
  ref,
) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const report = useRef({ onSnapshot, onEnded });
  const status = useRef<PlayerSnapshot['status']>('loading');
  const generation = useRef(0);
  const volumeRef = useRef(volume);

  useLayoutEffect(() => {
    report.current = { onSnapshot, onEnded };
    volumeRef.current = volume;
    if (mediaRef.current) mediaRef.current.volume = volume;
  }, [onSnapshot, onEnded, volume]);

  useImperativeHandle(
    ref,
    () => ({
      async play() {
        const media = mediaRef.current;
        const current = generation.current;
        const statusAtRequest = status.current;
        if (!media?.src || statusAtRequest === 'error') return;
        try {
          await media.play();
        } catch (error) {
          if (generation.current !== current || status.current === 'error') return;
          if (error instanceof DOMException && error.name === 'AbortError') return;
          status.current =
            error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'error';
          report.current.onSnapshot({
            status: status.current,
            position: media.currentTime,
            duration: Number.isFinite(media.duration) ? media.duration : null,
            error:
              status.current === 'blocked'
                ? 'Your browser requires a click on Play before audio can start.'
                : 'This file could not start playing. Try another supported format.',
          });
        }
      },
      pause() {
        mediaRef.current?.pause();
      },
      seek(seconds) {
        const media = mediaRef.current;
        if (
          media &&
          !media.error &&
          status.current !== 'error' &&
          Number.isFinite(seconds) &&
          Number.isFinite(media.duration)
        ) {
          media.currentTime = Math.max(0, Math.min(seconds, media.duration));
          status.current = media.ended ? 'ended' : media.paused ? 'paused' : 'playing';
          report.current.onSnapshot({
            status: status.current,
            position: media.currentTime,
            duration: media.duration,
          });
        }
      },
      setVolume(nextVolume) {
        if (mediaRef.current && Number.isFinite(nextVolume)) {
          mediaRef.current.volume = Math.max(0, Math.min(1, nextVolume));
        }
      },
    }),
    [],
  );

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    let retired = false;
    let objectUrl: string | undefined;
    let frame = 0;
    let lastSample = 0;
    generation.current += 1;
    status.current = 'loading';
    report.current.onSnapshot({ status: 'loading', position: 0, duration: null });

    const publish = (nextStatus = status.current, error?: string) => {
      if (retired || ((status.current === 'error' || media.error) && !error)) return;
      status.current = nextStatus;
      report.current.onSnapshot({
        status: nextStatus,
        position: Number.isFinite(media.currentTime) ? media.currentTime : 0,
        duration: Number.isFinite(media.duration) ? media.duration : null,
        ...(error ? { error } : {}),
      });
    };
    const sample = (now: number) => {
      if (
        retired ||
        media.paused ||
        media.ended ||
        media.error ||
        status.current === 'error' ||
        document.hidden
      ) {
        frame = 0;
        return;
      }
      if (now - lastSample >= 80) {
        publish();
        lastSample = now;
      }
      frame = requestAnimationFrame(sample);
    };
    const startSampling = () => {
      if (!frame && !document.hidden && !media.error && status.current !== 'error')
        frame = requestAnimationFrame(sample);
    };
    const loaded = () => {
      window.clearTimeout(loadTimer);
      publish(media.paused ? 'ready' : 'playing');
    };
    const playing = () => {
      publish('playing');
      startSampling();
    };
    const paused = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      publish(media.ended ? 'ended' : 'paused');
    };
    const ended = () => {
      if (media.error || status.current === 'error') return;
      paused();
      report.current.onEnded();
    };
    const update = () => {
      if (status.current !== 'error' && status.current !== 'blocked') publish();
    };
    const waiting = () => publish(media.paused ? 'paused' : 'buffering');
    const failed = () => {
      window.clearTimeout(loadTimer);
      cancelAnimationFrame(frame);
      frame = 0;
      media.pause();
      publish(
        'error',
        'Playback failed. Check your audio output and reload the player. If it still fails, try another supported format.',
      );
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!media.paused) {
        publish();
        startSampling();
      }
    };
    const events: [keyof HTMLMediaElementEventMap, EventListener][] = [
      ['loadedmetadata', loaded],
      ['playing', playing],
      ['pause', paused],
      ['ended', ended],
      ['timeupdate', update],
      ['seeked', update],
      ['waiting', waiting],
      ['error', failed],
    ];
    for (const [event, handler] of events) media.addEventListener(event, handler);
    document.addEventListener('visibilitychange', visibility);
    const loadTimer = window.setTimeout(
      () => publish('error', 'The local file took too long to load. Remove the track and import it again.'),
      20_000,
    );
    void getLocalMedia(track.id)
      .then((blob) => {
        if (retired) return;
        objectUrl = URL.createObjectURL(blob);
        media.volume = volumeRef.current;
        media.src = objectUrl;
        media.load();
      })
      .catch((error: unknown) => {
        window.clearTimeout(loadTimer);
        publish('error', error instanceof Error ? error.message : 'The local file could not be loaded.');
      });

    return () => {
      retired = true;
      generation.current += 1;
      window.clearTimeout(loadTimer);
      cancelAnimationFrame(frame);
      for (const [event, handler] of events) media.removeEventListener(event, handler);
      document.removeEventListener('visibilitychange', visibility);
      media.pause();
      media.removeAttribute('src');
      media.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [track.id, track.mediaType]);

  const setMedia = useCallback((media: HTMLMediaElement | null) => {
    mediaRef.current = media;
  }, []);

  return track.mediaType === 'video' ? (
    <video ref={setMedia} className={className} playsInline preload="metadata" aria-label={track.title} />
  ) : (
    <audio ref={setMedia} className={className} preload="metadata" aria-label={track.title} />
  );
});
