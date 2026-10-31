import type { LyricDocument, Track } from '../types';
import { parseProviderUrl } from '../providers/urls';

export type Appearance = {
  theme: 'aurora' | 'midnight' | 'ember';
  font: 'sans' | 'serif' | 'mono' | 'rounded';
  customFont: string;
  fontSize: number;
  fontWeight: number;
  glass: number;
  blur: number;
  motion: 'flow' | 'fade' | 'still';
  showLyrics: boolean;
};

export type Backdrop = {
  id: string;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video';
  size: number;
};

export type Library = {
  version: 1;
  revision: number;
  tracks: Track[];
  activeId: string | null;
  lyrics: Record<string, LyricDocument>;
  appearance: Appearance;
  backdrop: Backdrop | null;
  volume: number;
  repeat: 'off' | 'queue' | 'one';
};

export const MAX_TRACKS = 200;
export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'aurora',
  font: 'sans',
  customFont: '',
  fontSize: 48,
  fontWeight: 600,
  glass: 35,
  blur: 24,
  motion: 'flow',
  showLyrics: true,
};

export function emptyLibrary(): Library {
  return {
    version: 1,
    revision: 0,
    tracks: [],
    activeId: null,
    lyrics: {},
    appearance: { ...DEFAULT_APPEARANCE },
    backdrop: null,
    volume: 0.7,
    repeat: 'off',
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function validTrack(value: unknown): value is Track {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.id) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 200 ||
    typeof value.artist !== 'string' ||
    value.artist.length > 200
  )
    return false;
  if (value.source === 'local') {
    return (
      typeof value.fileName === 'string' &&
      value.fileName.length <= 255 &&
      typeof value.mimeType === 'string' &&
      /^(audio|video)\/[\w.+-]+$/.test(value.mimeType) &&
      finite(value.size, 1, 200 * 1024 * 1024) &&
      finite(value.duration, 0.001, 86_400) &&
      (value.mediaType === 'audio' || value.mediaType === 'video')
    );
  }
  if (typeof value.url !== 'string') return false;
  try {
    const source = parseProviderUrl(value.url);
    return (
      source.source === value.source && source.externalId === value.externalId && source.url === value.url
    );
  } catch {
    return false;
  }
}

function validLyrics(value: unknown): value is LyricDocument {
  if (
    !record(value) ||
    !Array.isArray(value.cues) ||
    value.cues.length > 5000 ||
    !finite(value.offset, -60, 60) ||
    (value.source !== 'import' && value.source !== 'transcription')
  )
    return false;
  let previousEnd = -1;
  let previousStart = -1;
  return value.cues.every((cue: unknown) => {
    if (
      !record(cue) ||
      !finite(cue.start, 0, 86_400) ||
      cue.start <= previousStart ||
      cue.start < previousEnd ||
      typeof cue.text !== 'string' ||
      cue.text.length > 1000 ||
      !(cue.end === null || (finite(cue.end, cue.start, 86_400) && cue.end > cue.start))
    )
      return false;
    previousStart = cue.start;
    previousEnd = cue.end === null ? cue.start : cue.end;
    return true;
  });
}

export function parseLibrary(raw: string): Library {
  if (raw.length > 4 * 1024 * 1024) throw new Error('The saved library exceeds the supported size.');
  const value: unknown = JSON.parse(raw);
  if (
    !record(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    !finite(value.revision, 0, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(value.tracks) ||
    value.tracks.length > MAX_TRACKS ||
    !value.tracks.every(validTrack) ||
    !record(value.lyrics) ||
    !record(value.appearance) ||
    !finite(value.volume, 0, 1) ||
    typeof value.repeat !== 'string' ||
    !['off', 'queue', 'one'].includes(value.repeat)
  ) {
    throw new Error('The saved library has an unsupported format.');
  }
  const ids = new Set(value.tracks.map((track) => track.id));
  if (
    ids.size !== value.tracks.length ||
    !(value.activeId === null || (typeof value.activeId === 'string' && ids.has(value.activeId))) ||
    Object.entries(value.lyrics).some(([id, lyrics]) => !ids.has(id) || !validLyrics(lyrics))
  ) {
    throw new Error('The saved queue or lyrics are invalid.');
  }
  const a = value.appearance;
  if (
    typeof a.theme !== 'string' ||
    !['aurora', 'midnight', 'ember'].includes(a.theme) ||
    typeof a.font !== 'string' ||
    !['sans', 'serif', 'mono', 'rounded'].includes(a.font) ||
    typeof a.motion !== 'string' ||
    !['flow', 'fade', 'still'].includes(a.motion) ||
    typeof a.showLyrics !== 'boolean' ||
    typeof a.customFont !== 'string' ||
    a.customFont.length > 80 ||
    !/^[\p{L}\p{N} _+-]*$/u.test(a.customFont) ||
    !finite(a.fontSize, 28, 80) ||
    !finite(a.fontWeight, 400, 800) ||
    !finite(a.glass, 10, 85) ||
    !finite(a.blur, 0, 40)
  ) {
    throw new Error('The saved appearance settings are invalid.');
  }
  const backdrop = value.backdrop ?? null;
  if (
    backdrop !== null &&
    (!record(backdrop) ||
      typeof backdrop.id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(backdrop.id) ||
      ids.has(backdrop.id) ||
      typeof backdrop.fileName !== 'string' ||
      backdrop.fileName.length > 255 ||
      typeof backdrop.mimeType !== 'string' ||
      !(
        (backdrop.kind === 'image' && /^image\/(png|jpeg|webp|avif|gif)$/.test(backdrop.mimeType)) ||
        (backdrop.kind === 'video' && /^video\/[\w.+-]+$/.test(backdrop.mimeType))
      ) ||
      !finite(backdrop.size, 1, (backdrop.kind === 'image' ? 20 : 200) * 1024 * 1024))
  ) {
    throw new Error('The saved background is invalid.');
  }
  value.backdrop = backdrop;
  return value as Library;
}
