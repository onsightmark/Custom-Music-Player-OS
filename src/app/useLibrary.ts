import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyLibrary, type Library } from '../library/state';
import { readLibrary, writeLibrary, type LibraryChange, type LibraryWriteOptions } from '../library/storage';

type PendingChange = { change: LibraryChange; optimistic: boolean };
type UpdateOptions = LibraryWriteOptions & { optimistic?: boolean };

export function useLibrary() {
  const [saved, setSaved] = useState(() => ({ library: emptyLibrary(), error: '' }));
  const base = useRef(saved.library);
  const pending = useRef<PendingChange[]>([]);
  const channel = useRef<BroadcastChannel | null>(null);
  const alive = useRef(true);

  const display = useCallback((library: Library, error = '') => {
    if (!alive.current) return;
    if (library.revision >= base.current.revision) base.current = library;
    let next = base.current;
    for (const item of pending.current) {
      if (item.optimistic) {
        try {
          next = item.change(next);
        } catch (failure) {
          error = failure instanceof Error ? failure.message : 'This change could not be saved.';
        }
      }
    }
    setSaved({ library: next, error });
  }, []);

  const update = useCallback(
    async (
      change: LibraryChange,
      { media, backdrop, signal, optimistic = false }: UpdateOptions = {},
    ): Promise<Library | null> => {
      const item = { change, optimistic };
      pending.current.push(item);
      display(base.current);
      try {
        const library = await writeLibrary(change, { media, backdrop, signal });
        pending.current = pending.current.filter((entry) => entry !== item);
        display(library);
        channel.current?.postMessage(library.revision);
        return library;
      } catch (failure) {
        pending.current = pending.current.filter((entry) => entry !== item);
        display(
          base.current,
          signal?.aborted
            ? ''
            : failure instanceof Error
              ? failure.message
              : 'Your library could not be saved.',
        );
        return null;
      }
    },
    [display],
  );

  useEffect(() => {
    alive.current = true;
    const refresh = () => {
      void readLibrary()
        .then((library) => display(library))
        .catch((failure: unknown) => {
          display(
            base.current,
            failure instanceof Error ? failure.message : 'Your saved library could not be read.',
          );
        });
    };
    const connection =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('musica-library');
    channel.current = connection;
    if (connection) connection.onmessage = refresh;
    window.addEventListener('focus', refresh);
    refresh();
    return () => {
      alive.current = false;
      channel.current = null;
      connection?.close();
      window.removeEventListener('focus', refresh);
    };
  }, [display]);

  return { ...saved, update };
}
