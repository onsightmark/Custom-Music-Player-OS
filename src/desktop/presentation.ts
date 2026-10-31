import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerSnapshot } from '../types';

const channelName = 'musica-presentation';
function windowOwner() {
  try {
    const saved = sessionStorage.getItem('musica-window');
    if (saved && /^[a-f0-9-]{36}$/i.test(saved)) return saved;
    const id = crypto.randomUUID();
    sessionStorage.setItem('musica-window', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export const presentationOwner = windowOwner();

type Presentation = {
  type: 'clock';
  owner: string;
  trackId: string | null;
  snapshot: PlayerSnapshot;
  sentAt: number;
};

export function usePublishPresentation() {
  const channel = useRef<BroadcastChannel | null>(null);
  const audienceUntil = useRef(0);
  const latest = useRef<Presentation>({
    type: 'clock',
    owner: presentationOwner,
    trackId: null,
    snapshot: { status: 'ready', position: 0, duration: null },
    sentAt: Date.now(),
  });

  const publish = useCallback((trackId: string | null, snapshot: PlayerSnapshot) => {
    latest.current = { type: 'clock', owner: presentationOwner, trackId, snapshot, sentAt: Date.now() };
    if (audienceUntil.current > Date.now()) channel.current?.postMessage(latest.current);
  }, []);

  useEffect(() => {
    const connection = new BroadcastChannel(channelName);
    channel.current = connection;
    connection.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (
        !data ||
        typeof data !== 'object' ||
        !('type' in data) ||
        data.type !== 'watch' ||
        !('owner' in data)
      )
        return;
      if (data.owner !== presentationOwner && !(data.owner === null && window.musicaDesktop)) return;
      audienceUntil.current = Date.now() + 10_000;
      connection.postMessage({ ...latest.current, sentAt: Date.now() });
    };
    return () => {
      connection.postMessage({ type: 'closed', owner: presentationOwner });
      connection.close();
      channel.current = null;
    };
  }, []);
  return publish;
}

function readPresentation(value: unknown): Presentation | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    value.type !== 'clock' ||
    !('owner' in value) ||
    typeof value.owner !== 'string' ||
    !('trackId' in value) ||
    !(value.trackId === null || typeof value.trackId === 'string') ||
    !('sentAt' in value) ||
    typeof value.sentAt !== 'number' ||
    !Number.isFinite(value.sentAt) ||
    !('snapshot' in value) ||
    !value.snapshot ||
    typeof value.snapshot !== 'object'
  )
    return null;
  const s = value.snapshot;
  if (
    !('status' in s) ||
    typeof s.status !== 'string' ||
    !['loading', 'ready', 'playing', 'paused', 'buffering', 'ended', 'blocked', 'error'].includes(s.status) ||
    !('position' in s) ||
    typeof s.position !== 'number' ||
    !Number.isFinite(s.position) ||
    s.position < 0 ||
    s.position > 86_400 ||
    !('duration' in s) ||
    !(
      s.duration === null ||
      (typeof s.duration === 'number' &&
        Number.isFinite(s.duration) &&
        s.duration >= 0 &&
        s.duration <= 86_400)
    )
  )
    return null;
  return value as Presentation;
}

export function usePresentation() {
  const [current, setCurrent] = useState<Presentation | null>(null);
  useEffect(() => {
    const owner = new URL(location.href).searchParams.get('owner');
    const connection = new BroadcastChannel(channelName);
    const watch = () => connection.postMessage({ type: 'watch', owner });
    let lastReceived = 0;
    connection.onmessage = ({ data }: MessageEvent<unknown>) => {
      const next = readPresentation(data);
      if (next && (owner === null || next.owner === owner)) {
        lastReceived = Date.now();
        setCurrent(next);
      }
      if (
        data &&
        typeof data === 'object' &&
        'type' in data &&
        data.type === 'closed' &&
        'owner' in data &&
        (owner === null || data.owner === owner)
      ) {
        setCurrent(null);
        watch();
      }
    };
    watch();
    const heartbeat = window.setInterval(() => {
      if (lastReceived && Date.now() - lastReceived > 10_000) setCurrent(null);
      watch();
    }, 2500);
    return () => {
      clearInterval(heartbeat);
      connection.close();
    };
  }, []);
  return current;
}
