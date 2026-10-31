import type { ProviderSource } from './providers/types';

export type LocalSource = {
  source: 'local';
  fileName: string;
  mimeType: string;
  size: number;
  mediaType: 'audio' | 'video';
  duration: number;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
} & (LocalSource | ProviderSource);

export type LocalTrack = Track & LocalSource;

export type PlayerSnapshot = {
  status: 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'blocked' | 'error';
  position: number;
  duration: number | null;
  error?: string;
};

export type PlayerControls = {
  play: () => void | Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
};

export type LyricCue = {
  start: number;
  end: number | null;
  text: string;
};

export type LyricDocument = {
  cues: LyricCue[];
  offset: number;
  source: 'import' | 'transcription';
};
