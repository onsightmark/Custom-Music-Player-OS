import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowUpRight, FileAudio, Link, LoaderCircle, Plus, X } from 'lucide-react';
import type { Track } from '../types';
import { prepareLocalMedia } from '../media/files';
import type { PreparedMedia } from '../library/storage';
import { parseProviderUrl } from '../providers/urls';
import { providerInfo } from '../providers/types';

type Props = {
  available: number;
  onAdd: (tracks: Track[], media?: PreparedMedia, signal?: AbortSignal) => Promise<boolean>;
  onClose: () => void;
  fallbackFocus: RefObject<HTMLButtonElement | null>;
};

export function AddMusicDialog({ available, onAdd, onClose, fallbackFocus }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const task = useRef<AbortController | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    const fallback = fallbackFocus.current;
    element?.showModal();
    return () => {
      task.current?.abort();
      element?.close();
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
      else fallback?.focus();
    };
  }, [fallbackFocus]);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length || task.current) return;
    if (files.length > available) {
      setError(`There is room for ${available} more tracks. The queue holds 200 tracks.`);
      return;
    }
    const controller = new AbortController();
    task.current = controller;
    let imported = 0;
    setError('');
    try {
      for (const file of Array.from(files)) {
        setBusy(`Importing ${file.name}`);
        const media = await prepareLocalMedia(file, controller.signal);
        if (!(await onAdd([media.track], media, controller.signal))) {
          controller.signal.throwIfAborted();
          throw new Error(
            'The file could not be saved. Check your queue limit and browser storage, then try again.',
          );
        }
        imported += 1;
      }
      controller.signal.throwIfAborted();
      onClose();
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          `${failure instanceof Error ? failure.message : 'The file could not be imported.'}${imported ? ` ${imported} ${imported === 1 ? 'track was' : 'tracks were'} added and kept in your queue.` : ''}`,
        );
    } finally {
      task.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  };

  return (
    <dialog
      ref={dialog}
      className="add-dialog glass-panel"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="add-title"
    >
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">BUILD YOUR SESSION</span>
          <h2 id="add-title">Bring your music.</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={busy ? 'Cancel import and close' : 'Close add music'}
        >
          <X />
        </button>
      </div>
      <label className={`file-drop ${busy ? 'is-busy' : ''}`}>
        {busy ? <LoaderCircle className="spinner" size={30} /> : <FileAudio size={30} />}
        <strong>{busy || 'Choose audio or video'}</strong>
        <span>MP3, WAV, FLAC, M4A, MP4, WebM and more. Up to 200 MB per file.</span>
        <span className="small-note">
          Files stay in this browser. Each completed import is saved, even if you cancel later files. Codec
          support depends on your browser.
        </span>
        <input
          type="file"
          aria-label="Import media files"
          accept="audio/*,video/*,.flac,.m4a,.mov"
          multiple
          disabled={Boolean(busy) || available === 0}
          onChange={(event) => {
            void importFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </label>
      <div className="dialog-divider">
        <span>or paste a track link</span>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          try {
            if (!available) throw new Error('Your queue is full. Remove a track before adding another.');
            const source = parseProviderUrl(url);
            setBusy('Adding track…');
            const added = await onAdd([
              {
                ...source,
                id: crypto.randomUUID(),
                title: title.trim() || `${providerInfo[source.source].name} · ${source.externalId}`,
                artist: providerInfo[source.source].name,
              },
            ]);
            if (added) onClose();
            else setError('The track could not be saved. Check browser storage and try again.');
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'That link could not be added.');
          } finally {
            setBusy('');
          }
        }}
      >
        <label className="input-label">
          Track link
          <div className="input-with-icon">
            <Link size={17} />
            <input
              type="url"
              required
              maxLength={2048}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              disabled={Boolean(busy)}
            />
          </div>
        </label>
        <label className="input-label">
          Display title <span>optional</span>
          <input
            className="text-input"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give this track a name"
            disabled={Boolean(busy)}
          />
        </label>
        <p className="provider-help">
          YouTube and SoundCloud play here through their official players. Spotify links open in Spotify{' '}
          <ArrowUpRight size={13} />.
        </p>
        <button className="primary-button add-submit" disabled={Boolean(busy) || !available}>
          <Plus size={18} />
          Add to queue
        </button>
      </form>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <p className="privacy-note">
        Opening a streaming track contacts that provider. Imported media stays on this device.
      </p>
    </dialog>
  );
}
