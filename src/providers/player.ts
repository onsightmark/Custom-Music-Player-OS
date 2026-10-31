import type { PlayerControls, PlayerSnapshot } from '../types';
import { mountSoundCloud } from './soundcloud';
import type { ProviderCapabilities, ProviderSource } from './types';
import { mountYouTube } from './youtube';

export type EmbeddedSource = Exclude<ProviderSource, { source: 'spotify' }>;

export type ProviderController = {
  controls: PlayerControls;
  capabilities: ProviderCapabilities;
  destroy(): void;
};

export type MountOptions = {
  host: HTMLElement;
  track: EmbeddedSource;
  signal: AbortSignal;
  onSnapshot(snapshot: PlayerSnapshot): void;
};

export async function mountProvider(options: MountOptions): Promise<ProviderController> {
  options.signal.throwIfAborted();
  options.onSnapshot({ status: 'loading', position: 0, duration: null });
  return options.track.source === 'youtube' ? mountYouTube(options) : mountSoundCloud(options);
}
