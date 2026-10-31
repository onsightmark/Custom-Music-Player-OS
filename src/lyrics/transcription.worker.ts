import {
  env,
  AutomaticSpeechRecognitionPipeline,
  AutoProcessor,
  AutoTokenizer,
  WhisperForConditionalGeneration,
  type PretrainedModelOptions,
} from '@huggingface/transformers';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type { LyricCue } from '../types';

const modelRevision = '2575352d61be1bf7225cf8f8b268a4678025fc58';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.remotePathTemplate = `{model}/resolve/${modelRevision}/`;
const wasm = env.backends.onnx.wasm;
if (!wasm) throw new Error('WebAssembly transcription is unavailable in this browser.');
wasm.numThreads = 1;
wasm.wasmPaths = {
  mjs: new URL(wasmModuleUrl, self.location.href).href,
  wasm: new URL(wasmBinaryUrl, self.location.href).href,
};

async function transcribe(data: unknown) {
  if (
    !data ||
    typeof data !== 'object' ||
    !('audio' in data) ||
    !(data.audio instanceof Float32Array) ||
    !data.audio.length ||
    data.audio.length > 16_000 * 600 ||
    data.audio.some((sample) => !Number.isFinite(sample))
  ) {
    throw new Error('The recording could not be prepared for local transcription.');
  }
  const duration = data.audio.length / 16_000;
  self.postMessage({
    type: 'progress',
    stage: 'downloading',
    progress: null,
    message: 'Loading Whisper tiny.en. Model files are cached on this device.',
  });
  const modelId = 'onnx-community/whisper-tiny.en';
  const options: PretrainedModelOptions = {
    revision: modelRevision,
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (event) => {
      if (event.status === 'progress') {
        self.postMessage({
          type: 'progress',
          stage: 'downloading',
          progress: event.progress,
          message: `Downloading ${event.file}`,
        });
      }
    },
  };
  const [model, tokenizer, processor] = await Promise.all([
    WhisperForConditionalGeneration.from_pretrained(modelId, options),
    AutoTokenizer.from_pretrained(modelId, options),
    AutoProcessor.from_pretrained(modelId, options),
  ]);
  const transcriber = new AutomaticSpeechRecognitionPipeline({
    task: 'automatic-speech-recognition',
    model,
    tokenizer,
    processor,
  });
  self.postMessage({
    type: 'progress',
    stage: 'transcribing',
    progress: null,
    message: 'Estimating English words and timing on your device…',
  });
  const result = await transcriber(data.audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    max_new_tokens: 448,
    do_sample: false,
  });
  const output = Array.isArray(result) ? result[0] : result;
  const cues: LyricCue[] = [];
  for (const chunk of output?.chunks ?? []) {
    const start = chunk.timestamp[0];
    const rawEnd = chunk.timestamp[1];
    const text = chunk.text.trim();
    if (typeof start !== 'number' || !Number.isFinite(start) || start < 0 || start >= duration || !text)
      continue;
    const end = typeof rawEnd === 'number' && Number.isFinite(rawEnd) ? Math.min(rawEnd, duration) : duration;
    if (end <= start || text.length > 1000) continue;
    cues.push({ start, end, text });
  }
  cues.sort((a, b) => a.start - b.start);
  for (let index = cues.length - 1; index > 0; index -= 1) {
    const current = cues[index];
    const previous = cues[index - 1];
    if (current && previous && current.start === previous.start) {
      previous.text = `${previous.text} ${current.text}`;
      previous.end = Math.max(previous.end ?? duration, current.end ?? duration);
      cues.splice(index, 1);
    }
  }
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (cue) cue.end = Math.min(cue.end ?? duration, cues[index + 1]?.start ?? duration);
  }
  await transcriber.dispose();
  if (!cues.length)
    throw new Error(
      'The model did not find usable timed words. Singing and background music can reduce accuracy. Try importing an LRC file.',
    );
  self.postMessage({ type: 'complete', cues });
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  void transcribe(event.data).catch((error: unknown) => {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error
          ? `Local transcription failed: ${error.message.slice(0, 300)}`
          : 'Local transcription failed. Check your connection for the model download, then try again.',
    });
  });
});
