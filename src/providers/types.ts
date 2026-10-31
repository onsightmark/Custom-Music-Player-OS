export type ProviderSource =
  | { source: 'youtube'; url: string; externalId: string }
  | { source: 'soundcloud'; url: string; externalId: string }
  | { source: 'spotify'; url: string; externalId: string };

export type ProviderCapabilities = {
  controls: boolean;
  seek: boolean;
  volume: boolean;
  clock: boolean;
  lyrics: boolean;
  autoAdvance: boolean;
};

export const providerInfo = {
  youtube: {
    name: 'YouTube',
    note: 'Video stays visible in the official player. Playback pauses when this page is hidden.',
    capabilities: { controls: true, seek: true, volume: true, clock: true, lyrics: true, autoAdvance: true },
  },
  soundcloud: {
    name: 'SoundCloud',
    note: 'Plays through the official SoundCloud player. Availability depends on the track and your region.',
    capabilities: { controls: true, seek: true, volume: true, clock: true, lyrics: true, autoAdvance: true },
  },
  spotify: {
    name: 'Spotify',
    note: 'Opens in Spotify. Spotify playback stays in its app or website. On Sight Musica cannot control it, synchronize lyrics, or advance the queue automatically.',
    capabilities: {
      controls: false,
      seek: false,
      volume: false,
      clock: false,
      lyrics: false,
      autoAdvance: false,
    },
  },
} satisfies Record<
  ProviderSource['source'],
  { name: string; note: string; capabilities: ProviderCapabilities }
>;
