import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { prepareBackdrop } from '../media/background';
import type { PreparedBackdrop } from '../library/storage';
import type { Backdrop } from '../library/state';

type Props = {
  value: Backdrop | null;
  onSave: (backdrop: PreparedBackdrop | null, signal?: AbortSignal) => Promise<boolean>;
};

export function BackgroundSettings({ value, onSave }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  return (
    <fieldset className="settings-section background-settings">
      <legend>Background</legend>
      <p className="panel-note">
        Choose your own image or a muted looping video. Your files stay on this device.
      </p>
      <label className="secondary-button file-button">
        <ImagePlus size={16} />
        {busy ? 'Importing background…' : 'Choose image or video'}
        <input
          type="file"
          aria-label="Import background"
          accept=".png,.jpg,.jpeg,.webp,.avif,.gif,.mp4,.webm,.mov"
          disabled={busy}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            const task = new AbortController();
            pending.current = task;
            setBusy(true);
            setError('');
            try {
              const prepared = await prepareBackdrop(file, task.signal);
              if (!(await onSave(prepared, task.signal)) && !task.signal.aborted)
                setError('The background could not be saved. Check available device storage.');
            } catch (failure) {
              if (!task.signal.aborted)
                setError(
                  failure instanceof Error ? failure.message : 'The background could not be imported.',
                );
            } finally {
              if (!task.signal.aborted) setBusy(false);
              pending.current = null;
            }
          }}
        />
      </label>
      {value && (
        <div className="background-selection">
          <span>{value.fileName}</span>
          <button
            className="icon-button"
            aria-label="Remove background"
            disabled={busy}
            onClick={() => void onSave(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
