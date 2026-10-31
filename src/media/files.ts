import type { LocalTrack } from '../types';
import { MAX_MEDIA_BYTES, type PreparedMedia } from '../library/storage';

const mediaTypes: Record<string, { mime: string; kind: 'audio' | 'video' }> = {
  mp3: { mime: 'audio/mpeg', kind: 'audio' },
  wav: { mime: 'audio/wav', kind: 'audio' },
  m4a: { mime: 'audio/mp4', kind: 'audio' },
  aac: { mime: 'audio/aac', kind: 'audio' },
  ogg: { mime: 'audio/ogg', kind: 'audio' },
  oga: { mime: 'audio/ogg', kind: 'audio' },
  flac: { mime: 'audio/flac', kind: 'audio' },
  mp4: { mime: 'video/mp4', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
};

function inspectMedia(file: Blob, kind: 'audio' | 'video', signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Import cancelled.', 'AbortError'));
      return;
    }
    const media = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      media.onloadedmetadata = null;
      media.onerror = null;
      media.pause();
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(url);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Import cancelled.', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('The file could not be read in time. Try a smaller file or another format.'));
    }, 15_000);
    media.onloadedmetadata = () => {
      const duration = media.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400) {
        reject(new Error('Choose a recording with a valid duration of less than 24 hours.'));
        return;
      }
      resolve(duration);
    };
    media.onerror = () => {
      cleanup();
      reject(
        new Error('This browser cannot play that file. Try MP3, WAV, MP4 or WebM with a supported codec.'),
      );
    };
    signal?.addEventListener('abort', abort, { once: true });
    media.preload = 'metadata';
    media.src = url;
    media.load();
  });
}

export async function prepareLocalMedia(file: File, signal?: AbortSignal): Promise<PreparedMedia> {
  if (!file.size || file.size > MAX_MEDIA_BYTES) {
    throw new Error('Choose a non-empty audio or video file up to 200 MB.');
  }
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const detected = mediaTypes[extension];
  if (!detected || (file.type && !/^(audio|video)\//.test(file.type))) {
    throw new Error('Choose an MP3, WAV, M4A, AAC, OGG, FLAC, MP4, WebM or MOV file.');
  }
  const mimeType = file.type || detected.mime;
  const mediaType = mimeType.startsWith('audio/') ? 'audio' : detected.kind;
  const blob = file.type ? file : file.slice(0, file.size, mimeType);
  const duration = await inspectMedia(blob, mediaType, signal);
  signal?.throwIfAborted();
  const track: LocalTrack = {
    id: crypto.randomUUID(),
    title:
      file.name
        .replace(/\.[^.]+$/, '')
        .trim()
        .slice(0, 200) || 'Untitled recording',
    artist: 'Local file',
    source: 'local',
    fileName: file.name.slice(0, 255),
    mimeType,
    size: file.size,
    mediaType,
    duration,
  };
  const bytes = await blob.arrayBuffer();
  signal?.throwIfAborted();
  return { track, bytes };
}
