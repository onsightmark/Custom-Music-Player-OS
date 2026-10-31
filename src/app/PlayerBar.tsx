import {
  Maximize,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { PlayerSnapshot, Track } from '../types';

type Props = {
  track: Track | null;
  snapshot: PlayerSnapshot;
  volume: number;
  repeat: 'off' | 'queue' | 'one';
  showLyrics: boolean;
  canControl: boolean;
  onTogglePlay: () => void;
  onSeek: (position: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolume: (volume: number) => void;
  onRepeat: () => void;
  onLyrics: () => void;
  onFullscreen: () => void;
};

function timeLabel(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(whole / 60) % 60).padStart(hours ? 2 : 1, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function PlayerBar(props: Props) {
  const playing = props.snapshot.status === 'playing' || props.snapshot.status === 'buffering';
  const duration = props.snapshot.duration;
  const position = Math.min(props.snapshot.position, duration ?? 0);
  return (
    <footer className="player-bar glass-panel" aria-label="Playback controls">
      <div className="transport-top">
        <div className="current-track">
          <div className={`mini-cover ${playing ? 'is-playing' : ''}`} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div>
            <strong>{props.track?.title || 'Your next favorite moment'}</strong>
            <span>{props.track?.artist || 'Add a track to begin'}</span>
          </div>
        </div>
        <div className="transport-buttons">
          <button
            className={`icon-button repeat-control ${props.repeat !== 'off' ? 'is-selected' : ''}`}
            aria-label={`Repeat: ${props.repeat}`}
            title={`Repeat: ${props.repeat}`}
            aria-pressed={props.repeat !== 'off'}
            onClick={props.onRepeat}
            disabled={!props.canControl}
          >
            {props.repeat === 'one' ? <Repeat1 /> : <Repeat />}
          </button>
          <button
            className="icon-button"
            aria-label="Previous track"
            onClick={props.onPrevious}
            disabled={!props.track}
          >
            <SkipBack fill="currentColor" />
          </button>
          <button
            className="play-button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={props.onTogglePlay}
            disabled={!props.canControl || props.snapshot.status === 'loading'}
          >
            {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          <button
            className="icon-button"
            aria-label="Next track"
            onClick={props.onNext}
            disabled={!props.track}
          >
            <SkipForward fill="currentColor" />
          </button>
          <button
            className={`icon-button lyrics-control ${props.showLyrics ? 'is-selected' : ''}`}
            aria-label="Toggle lyrics"
            aria-pressed={props.showLyrics}
            onClick={props.onLyrics}
            disabled={!props.canControl}
          >
            <Mic2 />
          </button>
        </div>
        <div className="volume-controls">
          <button
            className="icon-button"
            onClick={() => props.onVolume(props.volume > 0 ? 0 : 0.7)}
            aria-label={props.volume > 0 ? 'Mute' : 'Unmute'}
            disabled={!props.canControl}
          >
            {props.volume > 0 ? <Volume2 /> : <VolumeX />}
          </button>
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={props.volume}
            disabled={!props.canControl}
            onChange={(event) => props.onVolume(Number(event.target.value))}
          />
          <button
            className="icon-button fullscreen-control"
            aria-label="Fullscreen"
            onClick={props.onFullscreen}
          >
            <Maximize size={19} />
          </button>
        </div>
      </div>
      <div className="timeline">
        <span aria-label="Elapsed time">{timeLabel(props.snapshot.position)}</span>
        <input
          type="range"
          aria-label="Seek"
          aria-valuetext={`${timeLabel(position)} of ${timeLabel(duration)}`}
          min="0"
          max={duration || 1}
          step="0.1"
          value={position}
          disabled={!props.canControl || !duration}
          onChange={(event) => props.onSeek(Number(event.target.value))}
          style={{
            background: `linear-gradient(to right, var(--accent) ${duration ? (position / duration) * 100 : 0}%, rgba(255,255,255,.16) 0)`,
          }}
        />
        <span aria-label="Track duration">{timeLabel(duration)}</span>
      </div>
    </footer>
  );
}
