import type { MouseEventHandler } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  ExternalLink,
  ListMusic,
  Music2,
  Plus,
  Shuffle,
  Video,
  X,
} from 'lucide-react';
import { providerInfo } from '../providers/types';
import type { Track } from '../types';

type QueuePanelProps = {
  tracks: Track[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdd: MouseEventHandler<HTMLButtonElement>;
  onShuffle: () => void;
};

export function QueuePanel({
  tracks,
  activeId,
  onSelect,
  onMove,
  onRemove,
  onAdd,
  onShuffle,
}: QueuePanelProps) {
  return (
    <aside className="queue-panel glass-panel" aria-label="Queue">
      <div className="queue-header">
        <div>
          <p className="panel-kicker">THE LISTENING ROOM</p>
          <h2>
            Up next <span className="queue-count">{tracks.length}</span>
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onShuffle}
          disabled={tracks.length < 2}
          aria-label="Shuffle queue"
          title="Shuffle queue"
        >
          <Shuffle size={17} aria-hidden="true" />
        </button>
      </div>

      {tracks.length === 0 ? (
        <div className="queue-empty">
          <span className="queue-empty-icon">
            <ListMusic size={28} aria-hidden="true" />
          </span>
          <h3>A queue of your own.</h3>
          <p>Add a song link or a file from your device to start listening.</p>
          <button type="button" className="secondary-button" onClick={onAdd}>
            <Plus size={16} aria-hidden="true" /> Add music
          </button>
        </div>
      ) : (
        <ol className="queue-list">
          {tracks.map((track, index) => {
            const active = track.id === activeId;
            const sourceLabel = track.source === 'local' ? 'Local file' : providerInfo[track.source].name;
            const TrackIcon =
              track.source === 'youtube' || (track.source === 'local' && track.mediaType === 'video')
                ? Video
                : track.source === 'soundcloud'
                  ? Cloud
                  : track.source === 'spotify'
                    ? ExternalLink
                    : Music2;
            const duration =
              track.source === 'local'
                ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60)
                    .toString()
                    .padStart(2, '0')}`
                : null;

            return (
              <li key={track.id} className={`queue-track${active ? ' is-active' : ''}`}>
                <button
                  type="button"
                  className="queue-select"
                  onClick={() => onSelect(track.id)}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`Select ${track.title}${track.source === 'spotify' ? ', opens in Spotify' : ''}`}
                >
                  <span className={`queue-artwork queue-artwork-${track.source}`} aria-hidden="true">
                    <TrackIcon size={20} />
                  </span>
                  <span className="queue-track-copy">
                    <span className="queue-track-title">{track.title}</span>
                    <span className="queue-track-meta">{track.artist || sourceLabel}</span>
                    <span className="queue-source">
                      {sourceLabel}
                      {track.source === 'spotify' ? ' · External' : duration ? ` · ${duration}` : ''}
                    </span>
                  </span>
                  <span className="queue-track-index" aria-hidden="true">
                    {active ? '●' : (index + 1).toString().padStart(2, '0')}
                  </span>
                </button>
                <div className="queue-actions" role="group" aria-label={`Actions for ${track.title}`}>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => onMove(track.id, -1)}
                    aria-label={`Move ${track.title} up`}
                    title="Move up"
                  >
                    <ArrowUp size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === tracks.length - 1}
                    onClick={() => onMove(track.id, 1)}
                    aria-label={`Move ${track.title} down`}
                    title="Move down"
                  >
                    <ArrowDown size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onRemove(track.id)}
                    aria-label={`Remove ${track.title}`}
                    title="Remove from queue"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="queue-footer">
        <span>{tracks.length ? 'Your order. Your atmosphere.' : 'Ready when you are.'}</span>
        <button
          type="button"
          className="icon-button"
          onClick={onAdd}
          aria-label="Add music to queue"
          title="Add music"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
