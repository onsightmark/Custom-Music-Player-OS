import { useEffect, useState, type CSSProperties } from 'react';
import { AudioLines, Disc3, Maximize2 } from 'lucide-react';
import { useLibrary } from '../app/useLibrary';
import { appearanceStyle } from '../app/appearance';
import { activeCueIndex } from '../lyrics/lyrics';
import { BackdropView } from '../media/BackdropView';
import { usePresentation } from './presentation';
import './wallpaper.css';

export function WallpaperView() {
  const { library, error } = useLibrary();
  const presentation = usePresentation();
  const [hidden, setHidden] = useState(document.hidden);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const track = library.tracks.find((item) => item.id === presentation?.trackId && item.source === 'local');
  const lyrics = track ? library.lyrics[track.id] : undefined;
  const position = presentation?.snapshot.position ?? 0;
  const index = lyrics ? activeCueIndex(lyrics, position) : -1;
  const next = lyrics?.cues.findIndex((cue) => cue.start + lyrics.offset > position) ?? -1;
  const anchor = index >= 0 ? index : next >= 0 ? next : (lyrics?.cues.length ?? 1) - 1;
  const start = Math.max(0, anchor - 1);
  const playing = Boolean(track && presentation?.snapshot.status === 'playing' && !hidden);
  const activeVideo = track?.source === 'local' && track.mediaType === 'video' ? track : null;
  const nextTracks = track
    ? library.tracks.slice(library.tracks.findIndex((item) => item.id === track.id) + 1).slice(0, 4)
    : [];
  const a = library.appearance;

  return (
    <main
      className="app wallpaper-view"
      data-theme={a.theme}
      data-motion={a.motion}
      data-playing={playing}
      data-hidden={hidden}
      style={appearanceStyle(a)}
    >
      <div className="ambient-backdrop" aria-hidden="true">
        <div className="ambient-orb" />
        <div className="ambient-orb" />
        <div className="ambient-orb" />
      </div>
      {activeVideo ? (
        <BackdropView
          key={activeVideo.id}
          id={activeVideo.id}
          kind="video"
          playing={playing}
          clock={presentation?.snapshot}
        />
      ) : (
        library.backdrop && (
          <BackdropView
            key={library.backdrop.id}
            id={library.backdrop.id}
            kind={library.backdrop.kind}
            playing={playing}
          />
        )
      )}
      <div className="wallpaper-shade" aria-hidden="true" />
      <div className="wallpaper-topline">
        <AudioLines size={22} />
        <span>
          ON SIGHT <strong>MUSICA</strong>
        </span>
        <span className="wallpaper-mode">{window.musicaDesktop ? 'DESKTOP' : 'WALLPAPER PREVIEW'}</span>
      </div>
      <section className="wallpaper-content" aria-label="Desktop lyrics">
        <div className="wallpaper-song">
          <span className="eyebrow">{track ? 'NOW PLAYING' : 'YOUR DESKTOP, YOUR SOUND'}</span>
          <h1>{track?.title ?? 'On Sight Musica'}</h1>
          <p>{track?.artist ?? 'Play a local song in the player to bring this view to life.'}</p>
        </div>
        {track && lyrics && a.showLyrics ? (
          <div className="wallpaper-lyrics">
            {lyrics.cues.slice(start, start + 4).map((cue, offset) => (
              <p
                key={`${cue.start}-${start + offset}`}
                className={`lyric-line ${start + offset === index ? 'is-current' : ''}`}
                aria-current={start + offset === index ? 'true' : undefined}
                style={{ '--line-distance': Math.abs(start + offset - anchor) } as CSSProperties}
              >
                {cue.text || '♪'}
              </p>
            ))}
          </div>
        ) : (
          <div className="wallpaper-disc" aria-hidden="true">
            <Disc3 strokeWidth={0.6} />
            <span />
          </div>
        )}
        {track && !lyrics && (
          <p className="wallpaper-hint">Import timed lyrics or transcribe your file in the player.</p>
        )}
      </section>
      <aside className="wallpaper-queue glass-panel" aria-label="Desktop queue">
        <span className="panel-kicker">UP NEXT</span>
        {nextTracks.length ? (
          <ol>
            {nextTracks.map((nextTrack) => (
              <li key={nextTrack.id}>
                <AudioLines size={18} />
                <span>
                  <strong>{nextTrack.title}</strong>
                  <small>{nextTrack.artist || nextTrack.source}</small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>{track ? 'The rest of this moment is yours.' : 'Add your songs in the player.'}</p>
        )}
        <div className="wallpaper-status">
          <span className="live-dot" />
          {track
            ? presentation?.snapshot.status === 'playing'
              ? 'Listening'
              : 'Paused'
            : 'Waiting for local music'}
        </div>
      </aside>
      {(error || fullscreenError) && (
        <p className="wallpaper-error" role="alert">
          {error || fullscreenError}
        </p>
      )}
      {!window.musicaDesktop && (
        <button
          className="secondary-button wallpaper-fullscreen"
          onClick={async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await document.documentElement.requestFullscreen();
            } catch {
              setFullscreenError('Use your browser fullscreen command to expand this preview.');
            }
          }}
        >
          <Maximize2 size={16} /> Fullscreen preview
        </button>
      )}
    </main>
  );
}
