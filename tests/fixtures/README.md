# Browser journey fixtures

`tone-a.wav` and `tone-b.wav` are original, quiet, eight-second sine waves at 220 Hz and 330 Hz. They are mono 16-bit PCM at 16 kHz. `backdrop.webm` is an eight-second FFmpeg-generated moving test pattern with the second tone, encoded as VP8 and Vorbis. No commercial recording, artwork or lyrics is included. These generated fixtures, original LRC/VTT text and generators are covered by the repository's MIT license.

Regenerate the local media with Python 3 and FFmpeg installed:

```sh
python3 tests/fixtures/generate.py
```

The malformed files exercise real decoder and lyric-parser errors. The browser journeys import the real files through the UI, read the native media clock and use the app's controls; they do not replace browser media behavior.

## Playback failure after metadata import

`corrupt-vp8.webm` retains the valid container and initial three seconds of the
original `backdrop.webm` video. Its later encoded VP8 packets are damaged using
FFmpeg's [noise bitstream filter](https://ffmpeg.org/ffmpeg-bitstream-filters.html#noise).
The audio stream is omitted. This lets the actual browser import duration metadata,
start playback, and encounter a native decoder error without a synthetic event.
The journey checks the persistent error after a real media pause and lyric seek,
then selects an intact track to verify recovery.

From the repository root, reproduce it from the committed `backdrop.webm`:

```sh
ffmpeg -y -hide_banner -loglevel error -i tests/fixtures/backdrop.webm -map 0:v:0 -c copy -an -bsf:v "noise=amount=if(gte(pts*tb\,3)\,1\,0)" -fflags +bitexact tests/fixtures/corrupt-vp8.webm
```

The checked-in file was generated with FFmpeg 6.1.1 (`6.1.1-3ubuntu5`), is 255,005
bytes, and has SHA-256
`88258fe2c414c0816abef2bf552a5cad6c0ac4ac710a6fc5289b7be99443bcf9`.
Two generations from the same committed input produced identical bytes with
`+bitexact`; other FFmpeg versions may produce different container bytes.

## Optional real speech recognition journey

The opt-in speech test uses the eleven-second JFK inaugural-address excerpt used in the [official Transformers.js audio-processing guide](https://huggingface.co/docs/transformers.js/guides/node-audio-processing). Its words include “my fellow Americans” and “your country.” This is spoken public-domain material, not a song or a test of singing accuracy. The [archival recording's provenance and public-domain designation](https://commons.wikimedia.org/wiki/File:JFK_inaugural_address.ogg) identify the John F. Kennedy Presidential Library as the source. The [National Archives](https://www.archives.gov/milestone-documents/president-john-f-kennedys-inaugural-address) documents the address and date.

The speech file is downloaded on demand to an ignored artifact directory. The downloader pins Hugging Face dataset revision `159e0fd398b57d12a34e6a01e426e9e416ffce30` and requires SHA-256 `aa81c2552465568567e670f3823117e633900d16bd6202346a72f3c8464c74c8`. It is not part of the application or default browser suite.

```sh
python3 tests/fixtures/download_speech.py
npm run build
npm run test:e2e:transcription
```

On Windows, use `py` in place of `python3` if that is how Python is installed. Set `MUSICA_SPEECH_FIXTURE` to an existing copy of that exact WAV to avoid a second download. The test checks its checksum before starting. The actual browser then downloads the model and runtime and runs the app's on-device pipeline. Network access, roughly 60 MB of download and several minutes of CPU time may be required. The test fails with evidence when downloads or inference fail; it does not substitute transcript output.

The speech journey defaults to Chromium. Set `MUSICA_TRANSCRIPTION_BROWSER` to `firefox` or `webkit` to run the same journey in another installed Playwright engine. Certificate validation stays enabled.
