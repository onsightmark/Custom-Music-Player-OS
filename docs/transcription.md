# Local transcription and timed lyrics

On Sight Musica can estimate English words and their timing from a local recording. It uses
Whisper tiny.en through Transformers.js in a browser worker. Your recording stays
on your device. Transcription never reads audio from YouTube, Spotify or SoundCloud.

The model was trained for speech. Singing, background music, accents and overlapping
voices can produce missing or incorrect words. Silence can produce invented text.
Treat the result as an editable draft, not verified lyrics. Export the LRC file,
correct it in a text editor and import it again when the result needs repair.

## Processing and limits

Transcription starts only after you choose it in the lyrics panel. The first run
downloads the English model and the WebAssembly runtime. The quantized encoder and
merged decoder total about 41 MB, with tokenizer and runtime downloads in addition.
The browser can cache these files for later use. Cache eviction and offline
availability depend on the browser; a previous download does not guarantee an
offline run will succeed.

On Sight Musica decodes the selected file locally, mixes its channels to mono at 16 kHz and
transfers that audio to one worker. The worker uses one WebAssembly thread and
processes overlapping 30-second segments. It returns timestamped text to the app.
There is no transcription server, API key or automatic upload fallback.

| Limit                         | Value                                                 |
| ----------------------------- | ----------------------------------------------------- |
| Input file                    | 50 MB                                                 |
| Recording duration            | 10 minutes                                            |
| Concurrent transcription jobs | One per app window                                    |
| Worker lifetime               | Up to 10 minutes                                      |
| Model                         | `onnx-community/whisper-tiny.en`, quantized to 8 bits |
| Model revision                | `2575352d61be1bf7225cf8f8b268a4678025fc58`            |
| Processing                    | Browser WebAssembly worker                            |
| Output                        | Estimated English text and segment timing             |

The worker pins the model, tokenizer discovery and processor files to the same
immutable revision. Its download path is pinned as well as the loader options,
because Transformers.js 4.3.2 discovers tokenizer files before applying those
options. The inference test verifies the revision on the model repository's
download requests.

Cancel stops the worker and its inference or downloads. Browser audio decoding has
no cancellation API. If cancellation happens during decoding, On Sight Musica discards the
result as soon as decoding returns and does not start the worker. The file and
duration limits bound this work. A new job waits until that decoding has finished.

Model requests go to Hugging Face and its file delivery hosts. The WebAssembly
runtime ships with On Sight Musica and comes from the same origin as the app. Hugging Face
and its file delivery hosts receive ordinary download requests, including the connecting IP address.
They receive no recording, lyrics, file name or transcription result from On Sight Musica.

## Lyric files

On Sight Musica imports `.lrc` and `.vtt` files up to 1 MB, with at most 5,000 cues. A cue can
contain up to 1,000 characters. It renders imported content as text.

LRC supports repeated timestamps on one line and metadata tags. Lines at the same
timestamp combine into one cue. Empty timed lines create instrumental gaps. WebVTT
supports multiline cues, explicit end times and basic cue text formatting. On Sight Musica
rejects overlapping WebVTT cues because the lyric view has one active cue.

The display offset is measured in seconds. Positive values delay lyrics and
negative values show them earlier. LRC's `[offset]` tag uses the opposite sign in
milliseconds; import and export convert it. The allowed offset is 60 seconds in
either direction. Lyric timing follows the active source's observed media clock.
It does not run an independent timer while playback is paused.

LRC export preserves cue gaps with empty timed lines. LRC cannot preserve every
WebVTT feature, and export flattens multiline text into one line separated by `/`.

## Sources

- [Transformers.js pipeline and model revision options](https://huggingface.co/docs/transformers.js/en/pipelines).
- [Speech recognition output and timestamp options](https://huggingface.co/docs/transformers.js/en/api/pipelines).
- [Browser workers in the official React tutorial](https://huggingface.co/docs/transformers.js/en/tutorials/react).
- [Pinned model files](https://huggingface.co/onnx-community/whisper-tiny.en/tree/2575352d61be1bf7225cf8f8b268a4678025fc58/onnx).
- [Whisper model limitations](https://github.com/openai/whisper/blob/main/model-card.md).
- [Browser audio decoding](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData).
