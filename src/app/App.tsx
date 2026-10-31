import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Code2,
  ListMusic,
  Plus,
  SlidersHorizontal,
  Sparkles,
  AudioLines,
  Monitor,
  Eye,
  X,
} from 'lucide-react';
import { BrowserUpdates } from './BrowserUpdates';
import { appearanceStyle } from './appearance';
import { BackdropView } from '../media/BackdropView';
import { useWallpaper } from '../desktop/useWallpaper';
import { presentationOwner, usePublishPresentation } from '../desktop/presentation';
import type { LyricDocument } from '../types';
import { ListeningSession } from './ListeningSession';
import { AddMusicDialog } from './AddMusicDialog';
import { AppearancePanel } from './AppearancePanel';
import { QueuePanel } from './QueuePanel';
import { MAX_TRACKS, type Appearance } from '../library/state';
import { useLibrary } from './useLibrary';
import { usePlayerVisibility } from './usePlayerVisibility';

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function App() {
  const { library, error, update } = useLibrary();
  const [adding, setAdding] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [playRequest, setPlayRequest] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [playing, setPlaying] = useState(false);
  const hidden = !usePlayerVisibility();
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const appearanceButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const wallpaper = useWallpaper();
  const publishPresentation = usePublishPresentation();
  const track = library.tracks.find((item) => item.id === library.activeId) ?? null;
  const appearance = library.appearance;

  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', install);
    return () => {
      window.removeEventListener('beforeinstallprompt', install);
    };
  }, []);

  const advance = useCallback(
    async (direction: -1 | 1, automatic: boolean) => {
      const previousId = library.activeId;
      let advanced = false;
      const saved = await update((current) => {
        if (automatic && current.activeId !== previousId) return current;
        const index = current.tracks.findIndex((item) => item.id === current.activeId);
        if (index < 0 || !current.tracks.length) return current;
        if (automatic && index === current.tracks.length - 1 && current.repeat === 'off') return current;
        const next = (index + direction + current.tracks.length) % current.tracks.length;
        advanced = true;
        return { ...current, activeId: current.tracks[next]?.id ?? null };
      });
      if (!saved || !advanced) return;
      if (saved.activeId === previousId) setRetry((count) => count + 1);
      setPlayRequest(saved.activeId);
    },
    [library.activeId, update],
  );

  const consumePlayRequest = useCallback(() => setPlayRequest(null), []);

  const changeAppearance = (patch: Partial<Appearance>) => {
    if (patch.customFont !== undefined && !/^[\p{L}\p{N} _+-]*$/u.test(patch.customFont)) {
      setNotice(
        'Use the installed font family name with letters, numbers, spaces, plus signs, underscores or hyphens.',
      );
      return;
    }
    void update((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }), {
      optimistic: true,
    });
  };

  const saveLyrics = async (id: string, lyrics: LyricDocument) =>
    Boolean(
      await update((current) =>
        current.tracks.some((item) => item.id === id)
          ? { ...current, lyrics: { ...current.lyrics, [id]: lyrics } }
          : current,
      ),
    );

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setNotice('Use your browser’s fullscreen command for a larger listening view.');
    } catch {
      setNotice('Fullscreen was blocked. Use your browser’s fullscreen command instead.');
    }
  };

  return (
    <div
      className="app"
      data-theme={appearance.theme}
      data-motion={appearance.motion}
      data-playing={playing}
      data-hidden={hidden}
      style={appearanceStyle(appearance)}
    >
      <div className="ambient-backdrop" aria-hidden="true">
        <div className="ambient-orb" />
        <div className="ambient-orb" />
        <div className="ambient-orb" />
      </div>
      {library.backdrop && (
        <BackdropView
          key={library.backdrop.id}
          id={library.backdrop.id}
          kind={library.backdrop.kind}
          playing={playing && !hidden}
        />
      )}
      <header className="app-header">
        <a
          className="brand"
          href="#"
          aria-label="On Sight Musica home"
          onClick={(event) => event.preventDefault()}
        >
          <span className="brand-symbol">
            <AudioLines size={26} />
          </span>
          <span className="brand-name">
            On Sight<span className="brand-tagline">MUSICA</span>
          </span>
        </a>
        <div className="header-center">
          <span className="live-dot" />
          SOUND MEETS YOUR SCREEN
        </div>
        <nav className="header-actions" aria-label="App actions">
          {!window.musicaDesktop && (
            <a
              className="icon-button"
              href={`?wallpaper=1&owner=${presentationOwner}`}
              target="_blank"
              rel="noopener"
              aria-label="Preview wallpaper"
              title="Preview wallpaper"
            >
              <Eye size={19} />
            </a>
          )}
          <button
            className={`secondary-button desktop-button ${wallpaper.state.enabled ? 'is-selected' : ''}`}
            aria-label={wallpaper.state.enabled ? 'Stop desktop wallpaper' : 'Start desktop wallpaper'}
            aria-pressed={wallpaper.state.enabled}
            disabled={wallpaper.pending}
            onClick={() => {
              if (!window.musicaDesktop)
                setNotice(
                  'Desktop wallpaper runs in the Windows or Mac app. Use Preview wallpaper here to see the layout. Get the desktop app from this project on GitHub.',
                );
              else if (!wallpaper.state.supported)
                setNotice(
                  'Desktop wallpaper is supported on Windows and macOS. This system can use the player and fullscreen view.',
                );
              else if (!wallpaper.state.enabled && track?.source !== 'local')
                setNotice(
                  'Choose a local song or video before starting desktop wallpaper. Streaming players stay visible in this window.',
                );
              else void wallpaper.setEnabled(!wallpaper.state.enabled);
            }}
          >
            <Monitor size={17} />
            <span>{wallpaper.state.enabled ? 'Desktop on' : 'Desktop'}</span>
          </button>
          {!window.musicaDesktop && (
            <button
              className="icon-button install-button"
              title="Install On Sight Musica"
              aria-label="Install On Sight Musica"
              onClick={async () => {
                if (installPrompt) {
                  try {
                    await installPrompt.prompt();
                    await installPrompt.userChoice;
                    setInstallPrompt(null);
                  } catch {
                    setNotice('Open your browser menu to install On Sight Musica.');
                  }
                } else
                  setNotice(
                    'Install from the browser menu in Chrome or Edge. On macOS Safari, choose File → Add to Dock. Use HTTPS or localhost.',
                  );
              }}
            >
              <ArrowDownToLine size={19} />
            </button>
          )}
          <a
            className="icon-button github-link"
            href="https://github.com/onsightmark/Custom-Music-Player-OS"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
          >
            <Code2 size={19} />
          </a>
          <button
            ref={appearanceButton}
            className={`icon-button ${appearanceOpen ? 'is-selected' : ''}`}
            aria-label="Customize appearance"
            aria-expanded={appearanceOpen}
            onClick={() => setAppearanceOpen(!appearanceOpen)}
          >
            <SlidersHorizontal size={19} />
          </button>
          <button ref={addButton} className="secondary-button header-add" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Add music
          </button>
        </nav>
      </header>
      {!window.musicaDesktop && <BrowserUpdates />}
      {(error || notice || wallpaper.state.error) && (
        <div className="app-notice" role="status">
          <span>{error || notice || wallpaper.state.error}</span>
          {notice && !error && (
            <button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          )}
        </div>
      )}
      <main className="app-body">
        <ListeningSession
          key={`${track?.id ?? 'empty'}-${retry}`}
          track={track}
          library={library}
          playRequest={playRequest}
          onPlayRequestConsumed={consumePlayRequest}
          suspended={adding && track?.source !== 'local'}
          onAdvance={advance}
          onLyrics={saveLyrics}
          onPlayingChange={setPlaying}
          onPresentation={publishPresentation}
          onVolume={(volume) => update((current) => ({ ...current, volume }), { optimistic: true })}
          onRepeat={() =>
            update((current) => ({
              ...current,
              repeat: current.repeat === 'off' ? 'queue' : current.repeat === 'queue' ? 'one' : 'off',
            }))
          }
          onToggleLyrics={() => changeAppearance({ showLyrics: !appearance.showLyrics })}
          onAdd={() => {
            setPlayRequest(null);
            setAdding(true);
          }}
          onFullscreen={() => void fullscreen()}
          onRetry={() => {
            setPlayRequest(null);
            setRetry((count) => count + 1);
          }}
        />
        {appearanceOpen ? (
          <AppearancePanel
            value={appearance}
            backdrop={library.backdrop}
            onBackdrop={async (backdrop, signal) =>
              Boolean(
                await update((current) => ({ ...current, backdrop: backdrop?.asset ?? null }), {
                  backdrop: backdrop ?? undefined,
                  signal,
                }),
              )
            }
            onChange={changeAppearance}
            onClose={() => {
              setAppearanceOpen(false);
              appearanceButton.current?.focus();
            }}
          />
        ) : (
          <QueuePanel
            tracks={library.tracks}
            activeId={library.activeId}
            onSelect={async (id) => {
              const saved = await update((current) =>
                current.tracks.some((track) => track.id === id) ? { ...current, activeId: id } : current,
              );
              if (!saved || saved.activeId !== id) return;
              if (id === library.activeId) setRetry((count) => count + 1);
              setPlayRequest(id);
            }}
            onMove={(id, direction) =>
              update((current) => {
                const tracks = [...current.tracks];
                const index = tracks.findIndex((item) => item.id === id);
                const next = index + direction;
                if (index < 0 || next < 0 || next >= tracks.length) return current;
                [tracks[index], tracks[next]] = [tracks[next]!, tracks[index]!];
                return { ...current, tracks };
              })
            }
            onRemove={(id) => {
              setPlayRequest(null);
              void update((current) => {
                const index = current.tracks.findIndex((item) => item.id === id);
                const tracks = current.tracks.filter((item) => item.id !== id);
                const lyrics = { ...current.lyrics };
                delete lyrics[id];
                return {
                  ...current,
                  tracks,
                  lyrics,
                  activeId:
                    current.activeId === id
                      ? (tracks[Math.min(index, tracks.length - 1)]?.id ?? null)
                      : current.activeId,
                };
              });
            }}
            onAdd={() => setAdding(true)}
            onShuffle={() => {
              const order = library.tracks.map((track) => track.id);
              for (let index = order.length - 1; index > 0; index -= 1) {
                const other = Math.floor(Math.random() * (index + 1));
                [order[index], order[other]] = [order[other]!, order[index]!];
              }
              const rank = new Map(order.map((id, index) => [id, index]));
              void update((current) => ({
                ...current,
                tracks: [...current.tracks].sort(
                  (left, right) => (rank.get(left.id) ?? order.length) - (rank.get(right.id) ?? order.length),
                ),
              }));
            }}
          />
        )}
      </main>
      <div className="app-bottom">
        <span>
          <Sparkles size={12} />
          OPEN SOURCE. PERSONAL BY DESIGN.
        </span>
        <span className="keyboard-note">
          <kbd>space</kbd> play / pause <kbd>←</kbd>
          <kbd>→</kbd> seek
        </span>
        <span>
          <ListMusic size={13} />
          {library.tracks.length} {library.tracks.length === 1 ? 'track' : 'tracks'} in your space
        </span>
      </div>
      {adding && (
        <AddMusicDialog
          fallbackFocus={addButton}
          available={MAX_TRACKS - library.tracks.length}
          onAdd={async (tracks, media, signal) => {
            const saved = await update(
              (current) => {
                if (current.tracks.length + tracks.length > MAX_TRACKS)
                  throw new Error('Your queue is full. Remove a track before adding another.');
                return {
                  ...current,
                  tracks: [...current.tracks, ...tracks],
                  activeId: current.activeId ?? tracks[0]?.id ?? null,
                };
              },
              { media, signal },
            );
            setPlayRequest(null);
            return Boolean(saved);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
