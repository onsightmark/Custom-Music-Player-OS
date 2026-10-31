import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getLocalMedia } from '../library/storage';
import type { PlayerSnapshot } from '../types';

type Props = {
  id: string;
  kind: 'image' | 'video';
  playing: boolean;
  clock?: PlayerSnapshot;
};

export function BackdropView({ id, kind, playing, clock }: Props) {
  const [loaded, setLoaded] = useState<{ id: string; url: string; error: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const playback = useRef({ playing, clock });
  const synchronize = useCallback(() => {
    const media = video.current;
    if (!media || media.readyState < 1) return;
    const { playing: shouldPlay, clock: actual } = playback.current;
    if (actual && Math.abs(media.currentTime - actual.position) > (shouldPlay ? 0.45 : 0.06))
      media.currentTime = actual.position;
    if (shouldPlay && media.paused) {
      void media.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoaded(
          (current) =>
            current && { ...current, error: 'Background playback was blocked. Reopen the view to retry.' },
        );
      });
    } else if (!shouldPlay && !media.paused) media.pause();
  }, []);

  useLayoutEffect(() => {
    playback.current = { playing, clock };
    synchronize();
  }, [playing, clock, synchronize]);

  useLayoutEffect(() => {
    const element = video.current;
    return () => {
      element?.pause();
      element?.removeAttribute('src');
      element?.load();
    };
  }, [loaded?.url]);

  useEffect(() => {
    let retired = false;
    let url = '';
    void getLocalMedia(id)
      .then((file) => {
        if (retired) return;
        url = URL.createObjectURL(file);
        setLoaded({ id, url, error: '' });
      })
      .catch((error: unknown) => {
        if (!retired)
          setLoaded({
            id,
            url: '',
            error: error instanceof Error ? error.message : 'The background could not load.',
          });
      });
    return () => {
      retired = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (loaded?.id !== id) return null;
  if (loaded.error)
    return (
      <p className="background-error" role="status">
        {loaded.error}
      </p>
    );
  return kind === 'video' ? (
    <video
      ref={video}
      className="custom-backdrop"
      src={loaded.url}
      muted
      loop={!clock}
      playsInline
      preload="metadata"
      onLoadedMetadata={synchronize}
      onError={() =>
        setLoaded({ ...loaded, error: 'This background video cannot be decoded on this device.' })
      }
      aria-label="Background video"
    />
  ) : (
    <img className="custom-backdrop" src={loaded.url} alt="Your imported background" />
  );
}
