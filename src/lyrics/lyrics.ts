import type { LyricCue, LyricDocument } from '../types';

export const MAX_LYRIC_BYTES = 1024 * 1024;
export const MAX_LYRIC_CUES = 5000;

function cueTime(value: string): number {
  const parts = value.replace(',', '.').split(':');
  const hasHours = parts.length === 3;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  const time = hours * 3600 + minutes * 60 + seconds;
  if (
    !Number.isFinite(time) ||
    hours < 0 ||
    minutes < 0 ||
    seconds < 0 ||
    seconds >= 60 ||
    (hasHours && minutes >= 60) ||
    time > 86_400
  ) {
    throw new Error('Lyrics contain an invalid timestamp. Use minutes:seconds or hours:minutes:seconds.');
  }
  return time;
}

function cleanCueText(text: string): string {
  return text
    .replace(/<\/?(?:b|i|u|c(?:\.[^\s>]*)?|v(?:\s[^>]*)?|lang(?:\s[^>]*)?)>/gi, '')
    .replace(/<\d{2}:\d{2}(?::\d{2})?\.\d{3}>/g, '')
    .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (_, entity: string) => {
      const entities: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        nbsp: ' ',
        lrm: '\u200e',
        rlm: '\u200f',
      };
      return entities[entity] ?? '';
    })
    .trim();
}

export function parseLyrics(text: string, format: 'lrc' | 'vtt'): LyricDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_LYRIC_BYTES) {
    throw new Error('Lyrics must be smaller than 1 MB.');
  }
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const cues: LyricCue[] = [];
  let offset = 0;
  if (format === 'lrc') {
    for (const line of lines) {
      const offsetMatch = /^\[offset:([+-]?\d+)\]\s*$/i.exec(line.trim());
      if (offsetMatch) {
        offset = -Number(offsetMatch[1]) / 1000;
        if (!Number.isFinite(offset) || Math.abs(offset) > 60)
          throw new Error('The lyric offset must be within 60 seconds.');
        continue;
      }
      const timestamps = [...line.matchAll(/\[(\d{1,4}:\d{2}(?:[.,]\d{1,3})?)\]/g)];
      if (!timestamps.length) continue;
      const lyric = line.replace(/\[\d{1,4}:\d{2}(?:[.,]\d{1,3})?\]/g, '').trim();
      if (lyric.length > 1000) throw new Error('Each lyric line must be 1,000 characters or fewer.');
      for (const match of timestamps) {
        cues.push({ start: cueTime(match[1] ?? ''), end: null, text: lyric });
        if (cues.length > MAX_LYRIC_CUES) throw new Error('Lyrics can contain up to 5,000 timed lines.');
      }
    }
    cues.sort((a, b) => a.start - b.start);
    for (let index = cues.length - 1; index > 0; index -= 1) {
      const current = cues[index];
      const previous = cues[index - 1];
      if (current && previous && current.start === previous.start) {
        previous.text = [previous.text, current.text].filter(Boolean).join('\n');
        if (previous.text.length > 1000)
          throw new Error('Combined lyrics at one timestamp exceed 1,000 characters.');
        cues.splice(index, 1);
      }
    }
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      if (cue) cue.end = cues[index + 1]?.start ?? null;
    }
  } else {
    if (!/^WEBVTT(?:[ \t].*)?$/.test(lines[0] ?? ''))
      throw new Error('A WebVTT file must begin with WEBVTT.');
    const blocks = lines
      .slice(1)
      .join('\n')
      .split(/\n[ \t]*\n/);
    for (const block of blocks) {
      const blockLines = block.trim().split('\n');
      if (!blockLines[0] || /^(NOTE(?:\s|$)|STYLE$|REGION$)/.test(blockLines[0])) continue;
      const timingIndex = blockLines.findIndex((line) => line.includes('-->'));
      if (timingIndex < 0) continue;
      const match =
        /^((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})[ \t]+-->[ \t]+((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})(?:[ \t].*)?$/.exec(
          blockLines[timingIndex] ?? '',
        );
      if (!match) throw new Error('A WebVTT cue has an invalid timing line.');
      const start = cueTime(match[1] ?? '');
      const end = cueTime(match[2] ?? '');
      const lyric = cleanCueText(blockLines.slice(timingIndex + 1).join('\n'));
      if (end <= start) throw new Error('Every WebVTT cue must end after it starts.');
      if (lyric.length > 1000) throw new Error('Each lyric cue must be 1,000 characters or fewer.');
      cues.push({ start, end, text: lyric });
      if (cues.length > MAX_LYRIC_CUES) throw new Error('Lyrics can contain up to 5,000 timed lines.');
    }
    cues.sort((a, b) => a.start - b.start);
    for (let index = 1; index < cues.length; index += 1) {
      const previous = cues[index - 1];
      const current = cues[index];
      if (previous && current && previous.end !== null && previous.end > current.start) {
        throw new Error(
          'Overlapping WebVTT cues are not supported. Combine simultaneous lyrics into one cue.',
        );
      }
    }
  }
  if (!cues.some((cue) => cue.text))
    throw new Error(
      'No timed lyrics were found. Choose an LRC or WebVTT file with lyric text and timestamps.',
    );
  return { cues, offset, source: 'import' };
}

export async function importLyrics(file: File): Promise<LyricDocument> {
  if (!file.size || file.size > MAX_LYRIC_BYTES)
    throw new Error('Choose a non-empty LRC or WebVTT file up to 1 MB.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension !== 'lrc' && extension !== 'vtt')
    throw new Error('Lyrics must use the .lrc or .vtt extension.');
  return parseLyrics(await file.text(), extension);
}

export function activeCueIndex(document: LyricDocument, position: number): number {
  const time = position - document.offset;
  let low = 0;
  let high = document.cues.length - 1;
  let active = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = document.cues[middle];
    if (cue && cue.start <= time) {
      active = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  const cue = document.cues[active];
  return cue && cue.text && (cue.end === null || time < cue.end) ? active : -1;
}

export function exportLrc(document: LyricDocument): string {
  const lines = [`[offset:${Math.round(-document.offset * 1000)}]`];
  for (let index = 0; index < document.cues.length; index += 1) {
    const cue = document.cues[index];
    if (!cue) continue;
    const times = [{ time: cue.start, text: cue.text.replace(/\n/g, ' / ') }];
    const next = document.cues[index + 1];
    if (cue.end !== null && (!next || cue.end < next.start)) times.push({ time: cue.end, text: '' });
    for (const entry of times) {
      const centiseconds = Math.round(entry.time * 100);
      const minutes = Math.floor(centiseconds / 6000)
        .toString()
        .padStart(2, '0');
      const seconds = Math.floor((centiseconds % 6000) / 100)
        .toString()
        .padStart(2, '0');
      const fraction = (centiseconds % 100).toString().padStart(2, '0');
      lines.push(`[${minutes}:${seconds}.${fraction}]${entry.text}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
