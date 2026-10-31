import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { mountProvider, type EmbeddedSource, type ProviderController } from '../providers/player';
import type { PlayerControls, PlayerSnapshot } from '../types';

type Props = {
  track: EmbeddedSource;
  controls: RefObject<PlayerControls | null>;
  volume: number;
  onSnapshot: (snapshot: PlayerSnapshot) => void;
};

export function Playback({ track, controls, volume, onSnapshot }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onSnapshot);
  const latestVolume = useRef(volume);
  const { source, url, externalId } = track;
  useLayoutEffect(() => {
    report.current = onSnapshot;
    latestVolume.current = volume;
  }, [volume, onSnapshot]);
  useLayoutEffect(() => {
    controls.current?.setVolume(volume);
  }, [controls, volume]);

  useEffect(() => {
    if (!host.current) return;
    const task = new AbortController();
    let controller: ProviderController | null = null;
    let latest: PlayerSnapshot = { status: 'loading', position: 0, duration: null };
    void mountProvider({
      host: host.current,
      track: { source, url, externalId },
      signal: task.signal,
      onSnapshot: (snapshot) => {
        if (!task.signal.aborted) {
          latest = snapshot;
          report.current(snapshot);
        }
      },
    })
      .then((mounted) => {
        if (task.signal.aborted) {
          mounted.destroy();
          return;
        }
        controller = mounted;
        controls.current = mounted.controls;
        mounted.controls.setVolume(latestVolume.current);
        report.current({ ...latest });
      })
      .catch((error: unknown) => {
        if (!task.signal.aborted)
          report.current({
            status: 'error',
            position: 0,
            duration: null,
            error: error instanceof Error ? error.message : 'The streaming player could not load.',
          });
      });
    return () => {
      task.abort();
      controller?.destroy();
      controls.current = null;
    };
  }, [source, url, externalId, controls]);

  return (
    <div
      className={`provider-player provider-${track.source}`}
      ref={host}
      aria-label={`${track.source === 'youtube' ? 'YouTube' : 'SoundCloud'} player`}
    />
  );
}
