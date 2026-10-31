import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Headphones, Plus, Triangle } from 'lucide-react';
import { LocalPlayer } from '../media/LocalPlayer';
import { providerInfo } from '../providers/types';
import type { LyricDocument, PlayerControls, PlayerSnapshot, Track } from '../types';
import type { Library } from '../library/state';
import { LyricsPanel } from './LyricsPanel';
import { Playback } from './Playback';
import { PlayerBar } from './PlayerBar';
import { usePlayerVisibility } from './usePlayerVisibility';

type SessionProps = {
  track: Track | null;
  library: Library;
  playRequest: string | null;
  suspended: boolean;
  onPlayRequestConsumed: () => void;
  onAdvance: (direction: -1 | 1, automatic: boolean) => void;
  onLyrics: (id: string, lyrics: LyricDocument) => Promise<boolean>;
  onVolume: (volume: number) => void;
  onRepeat: () => void;
  onToggleLyrics: () => void;
  onAdd: () => void;
  onFullscreen: () => void;
  onRetry: () => void;
  onPlayingChange: (playing: boolean) => void;
  onPresentation: (trackId: string | null, snapshot: PlayerSnapshot) => void;
};

export function ListeningSession(props: SessionProps) {
  const { track, library, suspended, onAdvance, onPlayingChange, playRequest, onPlayRequestConsumed } = props;
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>({
    status: track && track.source !== 'spotify' ? 'loading' : 'ready',
    position: 0,
    duration: null,
  });
  const visible = usePlayerVisibility();
  const controls = useRef<PlayerControls | null>(null);
  const ended = useRef(false);
  const resumeAt = useRef(0);
  const position = useRef(0);
  const canControl = Boolean(
    track &&
    track.source !== 'spotify' &&
    !suspended &&
    snapshot.status !== 'loading' &&
    snapshot.status !== 'error',
  );
  const isProvider = track && (track.source === 'youtube' || track.source === 'soundcloud');

  const onEnded = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    if (library.repeat === 'one') {
      controls.current?.seek(0);
      void controls.current?.play();
    } else onAdvance(1, true);
  }, [library.repeat, onAdvance]);

  const onSnapshot = useCallback(
    (next: PlayerSnapshot) => {
      position.current = next.position;
      if (next.status === 'playing') ended.current = false;
      if (next.status === 'ended') onEnded();
      setSnapshot(next);
    },
    [onEnded],
  );

  useEffect(() => {
    if (suspended) resumeAt.current = position.current;
  }, [suspended]);

  useEffect(() => {
    if (snapshot.status === 'ready' && controls.current && !suspended) {
      if (resumeAt.current > 0) {
        controls.current.seek(resumeAt.current);
        resumeAt.current = 0;
      }
    }
  }, [snapshot, suspended]);

  useEffect(() => {
    if (playRequest && playRequest !== track?.id) {
      onPlayRequestConsumed();
      return;
    }
    if (
      playRequest === track?.id &&
      controls.current &&
      !suspended &&
      snapshot.status !== 'loading' &&
      snapshot.status !== 'error'
    ) {
      onPlayRequestConsumed();
      void controls.current.play();
    }
  }, [playRequest, onPlayRequestConsumed, track?.id, suspended, snapshot]);

  useEffect(() => {
    onPlayingChange(snapshot.status === 'playing' && visible);
  }, [snapshot.status, visible, onPlayingChange]);

  const { onPresentation } = props;
  useEffect(() => {
    onPresentation(track?.source === 'local' ? track.id : null, snapshot);
  }, [track, snapshot, onPresentation]);

  const togglePlay = useCallback(() => {
    if (!canControl) return;
    if (snapshot.status === 'playing' || snapshot.status === 'buffering') controls.current?.pause();
    else {
      if (snapshot.status === 'ended') controls.current?.seek(0);
      void controls.current?.play();
    }
  }, [canControl, snapshot.status]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        (event.target instanceof Element &&
          event.target.closest('input, textarea, select, button, a, dialog, [contenteditable="true"]'))
      )
        return;
      if (event.code === 'Space' && canControl) {
        event.preventDefault();
        togglePlay();
      }
      if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && canControl) {
        event.preventDefault();
        controls.current?.seek(Math.max(0, position.current + (event.code === 'ArrowRight' ? 5 : -5)));
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [canControl, togglePlay]);

  const playing = snapshot.status === 'playing' && visible;
  return (
    <section className="listening-session" data-playing={playing}>
      <div className={`listening-stage glass-panel ${isProvider ? 'with-provider' : ''}`}>
        {track?.source === 'local' && (
          <LocalPlayer
            ref={controls}
            track={track}
            volume={library.volume}
            onSnapshot={onSnapshot}
            onEnded={onEnded}
            className={`local-media ${track.mediaType === 'video' ? 'local-video' : 'local-audio'}`}
          />
        )}
        {track?.source === 'local' && track.mediaType === 'video' && (
          <div className="stage-overlay" aria-hidden="true" />
        )}
        {track ? (
          <>
            <div className="track-heading">
              <div>
                <span className="track-source">
                  <span className="live-dot" />
                  {track.source === 'local'
                    ? 'ON YOUR DEVICE'
                    : providerInfo[track.source].name.toUpperCase()}
                </span>
                <h1 className="track-title">{track.title}</h1>
                <p className="track-artist">{track.artist}</p>
              </div>
              <span className="track-state" role="status">
                {track.source === 'spotify'
                  ? 'External player'
                  : suspended
                    ? 'Paused'
                    : snapshot.status === 'ready'
                      ? 'Ready when you are'
                      : snapshot.status}
              </span>
            </div>
            <div className="stage-content">
              {isProvider && (
                <div className="source-panel">
                  {suspended ? (
                    <div className="provider-suspended">Player paused while you add music.</div>
                  ) : (
                    <Playback
                      track={track}
                      controls={controls}
                      volume={library.volume}
                      onSnapshot={onSnapshot}
                    />
                  )}
                  <p className="provider-note">{providerInfo[track.source].note}</p>
                </div>
              )}
              {track.source === 'spotify' ? (
                <div className="spotify-handoff">
                  <div className="handoff-icon">
                    <Headphones size={48} />
                  </div>
                  <span className="eyebrow">YOUR SPOTIFY SHORTCUT</span>
                  <h2>Continue in Spotify.</h2>
                  <p>{providerInfo.spotify.note}</p>
                  <a className="primary-button" href={track.url} target="_blank" rel="noopener noreferrer">
                    Open in Spotify
                    <ArrowUpRight size={18} />
                  </a>
                  <span className="small-note">Come back and choose the next track when you're ready.</span>
                </div>
              ) : library.appearance.showLyrics ? (
                <LyricsPanel
                  track={track}
                  lyrics={library.lyrics[track.id]}
                  position={snapshot.position}
                  onLyrics={(lyrics) => props.onLyrics(track.id, lyrics)}
                  onSeek={(time) => controls.current?.seek(time)}
                />
              ) : (
                !isProvider && (
                  <div className="scene-art" aria-label="Lyrics are hidden">
                    <span />
                    <span />
                    <span />
                    <Headphones size={48} />
                  </div>
                )
              )}
            </div>
            {snapshot.error && (
              <div className="playback-error" role="alert">
                <p>{snapshot.error}</p>
                <button className="secondary-button retry-player" onClick={props.onRetry}>
                  Reload player
                </button>
                {track.source !== 'local' && (
                  <a href={track.url} target="_blank" rel="noopener noreferrer" className="text-button">
                    Open original <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            )}
            <div className="stage-footnote">
              <span>
                {track.source === 'local'
                  ? 'PRIVATE BY DEFAULT'
                  : track.source === 'spotify'
                    ? 'LINK ONLY · NO EMBED'
                    : 'OFFICIAL PLAYER'}
              </span>
              <span>
                {track.source === 'local' && track.mediaType === 'video'
                  ? 'VIDEO BACKDROP'
                  : 'MADE FOR YOUR MOMENT'}
              </span>
            </div>
          </>
        ) : (
          <div className="empty-stage">
            <span className="empty-kicker">
              <span className="live-dot" />A SPACE THAT SOUNDS LIKE YOU
            </span>
            <div className="scene-art" aria-hidden="true">
              <span />
              <span />
              <span />
              <Triangle size={78} strokeWidth={1} />
            </div>
            <h1 className="empty-title">
              Music,
              <br />
              <em>in your light.</em>
            </h1>
            <p className="empty-description">
              Your songs. Your words. Your atmosphere.
              <br />
              Make yourself at home.
            </p>
            <div className="empty-actions">
              <button className="primary-button" onClick={props.onAdd}>
                <Plus size={18} />
                Add your first track
              </button>
            </div>
            <div className="empty-sources">
              <span>LOCAL FILES</span>
              <span>YOUTUBE</span>
              <span>SOUNDCLOUD</span>
              <span>SPOTIFY LINKS ↗</span>
            </div>
          </div>
        )}
      </div>
      <PlayerBar
        track={track}
        snapshot={snapshot}
        volume={library.volume}
        repeat={library.repeat}
        showLyrics={library.appearance.showLyrics}
        canControl={canControl}
        onTogglePlay={togglePlay}
        onSeek={(time) => controls.current?.seek(time)}
        onPrevious={() => {
          if (position.current > 3 && canControl) controls.current?.seek(0);
          else props.onAdvance(-1, false);
        }}
        onNext={() => props.onAdvance(1, false)}
        onVolume={props.onVolume}
        onRepeat={props.onRepeat}
        onLyrics={props.onToggleLyrics}
        onFullscreen={props.onFullscreen}
      />
    </section>
  );
}
