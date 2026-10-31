import type { LocalTrack } from '../types';
import { emptyLibrary, MAX_TRACKS, parseLibrary, type Backdrop, type Library } from './state';

export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 1024 * 1024 * 1024;
export type PreparedMedia = { track: LocalTrack; bytes: ArrayBuffer };
export type PreparedBackdrop = { asset: Backdrop; bytes: ArrayBuffer };
export type LibraryChange = (library: Library) => Library;
export type LibraryWriteOptions = {
  media?: PreparedMedia;
  backdrop?: PreparedBackdrop;
  signal?: AbortSignal;
};

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('musica-library', 1);
    let expired = false;
    const timer = window.setTimeout(() => {
      expired = true;
      reject(new Error('Local storage did not open. Close other On Sight Musica windows and try again.'));
    }, 10_000);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('library');
      request.result.createObjectStore('files');
    };
    request.onsuccess = () => {
      window.clearTimeout(timer);
      const database = request.result;
      if (expired) {
        database.close();
        return;
      }
      if (!database.objectStoreNames.contains('library') || !database.objectStoreNames.contains('files')) {
        database.close();
        reject(new Error('Local storage has an unsupported format. Your saved data has not been changed.'));
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('This browser could not open your library. Check its privacy and storage settings.'));
    };
  });
}

function restore(value: unknown): Library {
  if (value === undefined) return emptyLibrary();
  if (typeof value !== 'string')
    throw new Error('Your saved library could not be read. Your saved data has not been changed.');
  return parseLibrary(value);
}

export async function readLibrary(): Promise<Library> {
  const database = await openLibrary();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('library', 'readonly').objectStore('library').get('current');
      request.onsuccess = () => {
        try {
          resolve(restore(request.result));
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () =>
        reject(new Error('Your saved library could not be read. Try reloading On Sight Musica.'));
    });
  } finally {
    database.close();
  }
}

export async function writeLibrary(
  change: LibraryChange,
  { media, backdrop, signal }: LibraryWriteOptions = {},
): Promise<Library> {
  signal?.throwIfAborted();
  const database = await openLibrary();
  try {
    signal?.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(['library', 'files'], 'readwrite');
      const state = transaction.objectStore('library');
      const files = transaction.objectStore('files');
      const request = state.get('current');
      let next: Library;
      let failure: unknown;
      const abort = () => transaction.abort();
      signal?.addEventListener('abort', abort, { once: true });
      request.onsuccess = () => {
        try {
          const previous = restore(request.result);
          next = { ...change(previous), revision: previous.revision + 1 };
          if (next.tracks.length > MAX_TRACKS)
            throw new Error('Your queue is full. Remove a track before adding another.');
          const localTracks = next.tracks.filter((track) => track.source === 'local');
          if (
            localTracks.reduce((total, track) => total + track.size, next.backdrop?.size ?? 0) >
            MAX_LIBRARY_BYTES
          ) {
            throw new Error(
              'The local library is full. Remove a local track before importing another. The limit is 1 GB.',
            );
          }
          const json = JSON.stringify(next);
          parseLibrary(json);
          const previousIds = new Set(
            previous.tracks.filter((track) => track.source === 'local').map((track) => track.id),
          );
          for (const track of localTracks) {
            if (!previousIds.has(track.id) && track.id !== media?.track.id)
              throw new Error('A local track is missing its file. Import it again.');
          }
          if (media) {
            const track = localTracks.find((track) => track.id === media.track.id);
            if (!track || media.bytes.byteLength !== track.size || track.size > MAX_MEDIA_BYTES)
              throw new Error('The imported file could not be saved with its track.');
            files.put({ bytes: media.bytes, mimeType: track.mimeType }, track.id);
          }
          if (next.backdrop && next.backdrop.id !== previous.backdrop?.id) {
            if (
              next.backdrop.id !== backdrop?.asset.id ||
              backdrop.bytes.byteLength !== next.backdrop.size ||
              backdrop.asset.mimeType !== next.backdrop.mimeType
            )
              throw new Error('The background is missing its file. Import it again.');
            files.put({ bytes: backdrop.bytes, mimeType: next.backdrop.mimeType }, next.backdrop.id);
          }
          if (previous.backdrop && previous.backdrop.id !== next.backdrop?.id)
            files.delete(previous.backdrop.id);
          const nextIds = new Set(localTracks.map((track) => track.id));
          for (const id of previousIds) if (!nextIds.has(id)) files.delete(id);
          state.put(json, 'current');
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        signal?.removeEventListener('abort', abort);
        resolve(next);
      };
      transaction.onabort = () => {
        signal?.removeEventListener('abort', abort);
        reject(
          signal?.aborted
            ? new DOMException('Import cancelled.', 'AbortError')
            : (failure ??
                new Error(
                  'This change could not be saved. Free browser storage or check private-browsing restrictions, then try again.',
                )),
        );
      };
    });
  } finally {
    database.close();
  }
}

export async function getLocalMedia(id: string): Promise<Blob> {
  const database = await openLibrary();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('files', 'readonly').objectStore('files').get(id);
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (
          !value ||
          typeof value !== 'object' ||
          !('bytes' in value) ||
          !(value.bytes instanceof ArrayBuffer) ||
          !value.bytes.byteLength ||
          value.bytes.byteLength > MAX_MEDIA_BYTES ||
          !('mimeType' in value) ||
          typeof value.mimeType !== 'string' ||
          !/^(audio|video|image)\/[\w.+-]+$/.test(value.mimeType)
        ) {
          reject(
            new Error(
              'This local file is no longer in browser storage. Remove the track and import the file again.',
            ),
          );
          return;
        }
        resolve(new Blob([value.bytes], { type: value.mimeType }));
      };
      request.onerror = () =>
        reject(new Error('The browser could not read this local file. Try importing it again.'));
    });
  } finally {
    database.close();
  }
}
