import { useEffect, useRef, useState } from 'react';
import { Download, FileText, LoaderCircle, SlidersHorizontal, Sparkles, Upload, X } from 'lucide-react';
import { activeCueIndex, exportLrc, importLyrics } from '../lyrics/lyrics';
import { getLocalMedia } from '../library/storage';
import type { LyricDocument, Track } from '../types';

type Props = {
  track: Track;
  lyrics?: LyricDocument;
  position: number;
  onLyrics: (lyrics: LyricDocument) => Promise<boolean>;
  onSeek: (position: number) => void;
};

export function LyricsPanel({ track, lyrics, position, onLyrics, onSeek }: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const index = lyrics ? activeCueIndex(lyrics, position) : -1;
  const next = lyrics?.cues.findIndex((cue) => cue.start + lyrics.offset > position) ?? -1;
  const anchor = index >= 0 ? index : next >= 0 ? next : (lyrics?.cues.length ?? 1) - 1;
  const start = Math.max(0, anchor - 2);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  const transcribe = async () => {
    if (track.source !== 'local' || controller.current) return;
    const task = new AbortController();
    controller.current = task;
    setError('');
    setProgress('Preparing your audio…');
    try {
      const [{ transcribeFile }, file] = await Promise.all([
        import('../lyrics/transcription'),
        getLocalMedia(track.id),
      ]);
      task.signal.throwIfAborted();
      const document = await transcribeFile(file, {
        duration: track.duration,
        signal: task.signal,
        onProgress: (event) => {
          if (!task.signal.aborted && alive.current) setProgress(event.message);
        },
      });
      task.signal.throwIfAborted();
      if (alive.current && !(await onLyrics(document)) && alive.current)
        setError('The transcript was created but could not be saved. Free browser storage and try again.');
    } catch (failure) {
      if (!task.signal.aborted && alive.current)
        setError(failure instanceof Error ? failure.message : 'Transcription could not finish.');
    } finally {
      controller.current = null;
      if (alive.current) setProgress(null);
    }
  };

  return (
    <section className={`lyrics-panel ${lyrics ? 'has-lyrics' : ''}`} aria-label="Lyrics">
      <div className="lyrics-heading">
        <span className="panel-kicker">
          <span className="live-dot" />
          {lyrics?.source === 'transcription' ? 'ESTIMATED TRANSCRIPT' : 'LYRICS'}
        </span>
        <button
          className="icon-button"
          aria-label="Lyric settings"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen(!toolsOpen)}
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>
      {lyrics ? (
        <div className="lyrics-window" aria-label="Timed lyrics">
          {lyrics.cues.slice(start, start + 5).map((cue, offset) => (
            <button
              type="button"
              className={`lyric-line ${start + offset === index ? 'is-current' : ''}`}
              aria-current={start + offset === index ? 'true' : undefined}
              style={{ '--line-distance': Math.abs(start + offset - anchor) } as React.CSSProperties}
              key={`${cue.start}-${start + offset}`}
              onClick={() => onSeek(Math.max(0, cue.start + lyrics.offset))}
            >
              {cue.text || '♪'}
            </button>
          ))}
          <p className="lyric-caption">
            {index < 0 ? 'Between lines' : 'Click a line to jump to that moment'}
            {lyrics.source === 'transcription' ? ' · AI estimates can miss words' : ''}
          </p>
        </div>
      ) : (
        <div className="lyrics-empty">
          <div className="listening-orb" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="eyebrow">SETTLE INTO THE SOUND</span>
          <h2>
            A little space
            <br />
            to <em>listen.</em>
          </h2>
          <p>Add timed lyrics to bring every line into view.</p>
          <button className="secondary-button" onClick={() => setToolsOpen(true)}>
            <FileText size={16} />
            Add lyrics
          </button>
        </div>
      )}
      {(toolsOpen || progress) && (
        <div className="lyric-tools glass-panel">
          <div className="panel-heading">
            <strong>Words & timing</strong>
            <button
              className="icon-button"
              onClick={() => setToolsOpen(false)}
              aria-label="Close lyric settings"
              disabled={Boolean(progress)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="lyric-import-actions">
            <label className="secondary-button file-button">
              <Upload size={15} />
              Import LRC / VTT
              <input
                type="file"
                accept=".lrc,.vtt"
                aria-label="Import lyrics"
                disabled={Boolean(progress)}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setError('');
                  try {
                    const document = await importLyrics(file);
                    if (alive.current && !(await onLyrics(document)) && alive.current)
                      setError('The lyrics could not be saved.');
                  } catch (failure) {
                    if (alive.current)
                      setError(failure instanceof Error ? failure.message : 'The lyrics could not be read.');
                  }
                }}
              />
            </label>
            {lyrics && (
              <button
                className="secondary-button"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([exportLrc(lyrics)], { type: 'text/plain;charset=utf-8' }),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${track.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'lyrics'}.lrc`;
                  a.click();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download size={15} />
                Export
              </button>
            )}
          </div>
          {lyrics && (
            <label className="offset-control">
              Lyric delay{' '}
              <input
                key={lyrics.offset}
                aria-label="Lyric delay in seconds"
                type="number"
                min="-60"
                max="60"
                step="0.1"
                defaultValue={lyrics.offset}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  const raw = event.currentTarget.value.trim();
                  const offset = Number(raw);
                  if (raw && Number.isFinite(offset) && offset >= -60 && offset <= 60)
                    void onLyrics({ ...lyrics, offset });
                  else event.currentTarget.value = String(lyrics.offset);
                }}
              />
              <span>seconds</span>
            </label>
          )}
          {track.source === 'local' && (
            <div className="transcription-tools">
              <p>
                Generate an estimated English transcript on this device. The first run downloads a speech
                model and runtime, roughly 60 MB. Audio stays here. Up to 10 minutes and 50 MB. Singing may be
                inaccurate.
              </p>
              <label className="toggle-setting">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={Boolean(progress)}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>I have permission to transcribe this file.</span>
              </label>
              {progress ? (
                <div className="transcription-progress" role="status">
                  <LoaderCircle className="spinner" size={16} />
                  <span>{progress}</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      controller.current?.abort();
                      setProgress('Cancelling…');
                    }}
                    disabled={progress === 'Cancelling…'}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="secondary-button" disabled={!consent} onClick={() => void transcribe()}>
                  <Sparkles size={15} />
                  Transcribe on device
                </button>
              )}
            </div>
          )}
          {track.source !== 'local' && (
            <p className="panel-note">
              Import a timed lyric file you have permission to use. Streaming audio is not available for
              transcription.
            </p>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
