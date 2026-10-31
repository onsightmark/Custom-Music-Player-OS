import type { LyricCue, LyricDocument } from '../types';

export const TRANSCRIPTION_MAX_SECONDS = 600;
export const TRANSCRIPTION_MAX_BYTES = 50 * 1024 * 1024;

export type TranscriptionProgress = {
  stage: 'decoding' | 'downloading' | 'transcribing';
  progress: number | null;
  message: string;
};

type TranscriptionOptions = {
  duration: number;
  signal: AbortSignal;
  onProgress: (progress: TranscriptionProgress) => void;
};

let busy = false;

async function prepareAudio(file: Blob, signal: AbortSignal): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, 1, 16_000);
  const bytes = await file.arrayBuffer();
  signal.throwIfAborted();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes);
  } catch {
    throw new Error(
      'This browser cannot decode this recording for transcription. Try a WAV or MP3 audio file.',
    );
  }
  signal.throwIfAborted();
  if (
    !Number.isFinite(decoded.duration) ||
    decoded.duration > TRANSCRIPTION_MAX_SECONDS ||
    !decoded.length ||
    decoded.numberOfChannels > 8
  ) {
    throw new Error('The decoded recording exceeds the transcription limits. Use a shorter audio file.');
  }
  const audio = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const samples = decoded.getChannelData(channel);
    for (let index = 0; index < audio.length; index += 1) {
      audio[index] = (audio[index] ?? 0) + (samples[index] ?? 0) / decoded.numberOfChannels;
    }
  }
  return audio;
}

export async function transcribeFile(
  file: Blob,
  { duration, signal, onProgress }: TranscriptionOptions,
): Promise<LyricDocument> {
  signal.throwIfAborted();
  if (busy) throw new Error('A transcription is still stopping. Try again in a moment.');
  if (
    !file.size ||
    file.size > TRANSCRIPTION_MAX_BYTES ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > TRANSCRIPTION_MAX_SECONDS
  ) {
    throw new Error('Local transcription supports recordings up to 10 minutes and 50 MB.');
  }
  busy = true;
  try {
    onProgress({ stage: 'decoding', progress: null, message: 'Preparing audio on your device…' });
    const audio = await prepareAudio(file, signal);
    const decodedDuration = audio.length / 16_000;
    signal.throwIfAborted();
    return await new Promise<LyricDocument>((resolve, reject) => {
      const worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), { type: 'module' });
      const finish = () => {
        window.clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        worker.terminate();
      };
      const abort = () => {
        finish();
        reject(new DOMException('Transcription cancelled.', 'AbortError'));
      };
      const timer = window.setTimeout(() => {
        finish();
        reject(new Error('Transcription exceeded 10 minutes. Try a shorter recording on a faster device.'));
      }, 600_000);
      signal.addEventListener('abort', abort, { once: true });
      worker.onerror = (event) => {
        event.preventDefault();
        finish();
        reject(
          new Error(
            'The local transcription worker failed. Check your browser supports WebAssembly and try a shorter file.',
          ),
        );
      };
      worker.onmessageerror = () => {
        finish();
        reject(new Error('The transcription worker returned unreadable data. Try again.'));
      };
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data;
        if (!message || typeof message !== 'object' || !('type' in message)) return;
        if (
          message.type === 'progress' &&
          'stage' in message &&
          'message' in message &&
          'progress' in message
        ) {
          if (
            (message.stage === 'downloading' || message.stage === 'transcribing') &&
            typeof message.message === 'string' &&
            (message.progress === null ||
              (typeof message.progress === 'number' &&
                Number.isFinite(message.progress) &&
                message.progress >= 0 &&
                message.progress <= 100))
          ) {
            onProgress({
              stage: message.stage,
              message: message.message.slice(0, 200),
              progress: message.progress,
            });
          }
        } else if (message.type === 'error' && 'message' in message && typeof message.message === 'string') {
          finish();
          reject(new Error(message.message.slice(0, 400)));
        } else if (message.type === 'complete' && 'cues' in message) {
          finish();
          const cues: LyricCue[] = [];
          if (!Array.isArray(message.cues) || !message.cues.length || message.cues.length > 5000) {
            reject(
              new Error('The model did not return usable timed words. Import a corrected LRC file instead.'),
            );
            return;
          }
          for (const cue of message.cues) {
            const previous = cues.at(-1);
            if (
              !cue ||
              typeof cue !== 'object' ||
              typeof cue.start !== 'number' ||
              !Number.isFinite(cue.start) ||
              cue.start < 0 ||
              cue.start > decodedDuration ||
              typeof cue.end !== 'number' ||
              !Number.isFinite(cue.end) ||
              cue.end <= cue.start ||
              cue.end > decodedDuration ||
              typeof cue.text !== 'string' ||
              !cue.text.trim() ||
              cue.text.length > 1000 ||
              (previous && (previous.start >= cue.start || (previous.end ?? 0) > cue.start))
            ) {
              reject(
                new Error('The model returned invalid lyric timing. Import a corrected LRC file instead.'),
              );
              return;
            }
            cues.push({ start: cue.start, end: cue.end, text: cue.text });
          }
          resolve({ cues, offset: 0, source: 'transcription' });
        }
      };
      worker.postMessage({ audio }, [audio.buffer]);
    });
  } finally {
    busy = false;
  }
}
