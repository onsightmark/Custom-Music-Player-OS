import type { ProviderSource } from './types';

export function parseProviderUrl(input: string): ProviderSource {
  if (input.length > 2048) throw new Error('The link is too long. Paste a direct song or video link.');
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Paste a full HTTPS link from YouTube, Spotify, or SoundCloud.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Use a secure HTTPS link without a username, password, or custom port.');
  }

  const host = url.hostname.toLowerCase();
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if ((host === 'youtu.be' || host === 'www.youtu.be') && parts.length === 1) id = parts[0] ?? null;
    else if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (parts.length === 2 && ['shorts', 'embed', 'live'].includes(parts[0] ?? ''))
      id = parts[1] ?? null;
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
      throw new Error('Use a direct YouTube video link. Channels and playlists are not supported.');
    }
    return { source: 'youtube', externalId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }

  if (host === 'open.spotify.com') {
    const match = /^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    const id = match?.[1];
    if (!id)
      throw new Error('Use a Spotify track link. Albums, playlists, and shortened links are not supported.');
    return { source: 'spotify', externalId: id, url: `https://open.spotify.com/track/${id}` };
  }

  if (host === 'soundcloud.com' || host === 'www.soundcloud.com') {
    if (url.searchParams.has('secret_token'))
      throw new Error('Private SoundCloud links are not supported. Use a public song link.');
    const match = /^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    const artist = match?.[1];
    const song = match?.[2];
    const reserved = new Set(['sets', 'likes', 'tracks', 'reposts', 'albums', 'popular-tracks']);
    if (
      !artist ||
      !song ||
      reserved.has(song.toLowerCase()) ||
      ['discover', 'you', 'search', 'charts'].includes(artist.toLowerCase())
    ) {
      throw new Error(
        'Use a public SoundCloud song link, such as soundcloud.com/artist/song. Playlists and private links are not supported.',
      );
    }
    const externalId = `${artist}/${song}`;
    return { source: 'soundcloud', externalId, url: `https://soundcloud.com/${externalId}` };
  }

  throw new Error(
    'This source is not supported. Use a direct YouTube, Spotify, or SoundCloud link, or import a local file.',
  );
}
