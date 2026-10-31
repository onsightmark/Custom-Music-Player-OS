import type { PreparedBackdrop } from '../library/storage';
import { prepareLocalMedia } from './files';

const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

export async function prepareBackdrop(file: File, signal: AbortSignal): Promise<PreparedBackdrop> {
  signal.throwIfAborted();
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const mimeType = imageTypes[extension];
  if (!mimeType) {
    const { track, bytes } = await prepareLocalMedia(file, signal);
    if (track.mediaType !== 'video') throw new Error('Choose an image or a video for your background.');
    return {
      asset: {
        id: track.id,
        fileName: track.fileName,
        mimeType: track.mimeType,
        size: track.size,
        kind: 'video',
      },
      bytes,
    };
  }
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Choose a non-empty image up to 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        image.onload = null;
        image.onerror = null;
        image.src = '';
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(new DOMException('Background import cancelled.', 'AbortError'));
      const timer = window.setTimeout(() => finish(new Error('This image took too long to open.')), 15_000);
      image.onload = () =>
        finish(
          image.naturalWidth * image.naturalHeight > 40_000_000
            ? new Error('Choose an image below 40 megapixels.')
            : undefined,
        );
      image.onerror = () => finish(new Error('This image could not be opened. Try PNG, JPEG or WebP.'));
      signal.addEventListener('abort', abort, { once: true });
      image.src = url;
    });
    signal.throwIfAborted();
    const bytes = await file.arrayBuffer();
    signal.throwIfAborted();
    return {
      asset: {
        id: crypto.randomUUID(),
        fileName: file.name.slice(0, 255),
        mimeType,
        size: file.size,
        kind: 'image',
      },
      bytes,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
