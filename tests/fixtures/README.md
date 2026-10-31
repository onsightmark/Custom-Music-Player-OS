# Browser journey fixtures

`tone-a.wav` and `tone-b.wav` are original, quiet, eight-second sine waves at 220 Hz and 330 Hz. They are mono 16-bit PCM at 16 kHz. `backdrop.webm` is an eight-second FFmpeg-generated moving test pattern with the second tone, encoded as VP8 and Vorbis. No commercial recording, artwork or lyrics is included. These generated fixtures, original LRC/VTT text and generators are covered by the repository's MIT license.

Regenerate the local media with Python 3 and FFmpeg installed:

```sh
python3 tests/fixtures/generate.py
```

The malformed files exercise real decoder and lyric-parser errors. The browser journeys import the real files through the UI, read the native media clock and use the app's controls; they do not replace browser media behavior.

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
