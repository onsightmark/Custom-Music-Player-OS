# Architecture

On Sight Musica has one TypeScript and React player. A browser serves it as a
static web app. Electron adds a native desktop wallpaper window on Windows and
macOS. The wallpaper displays the active player's scene without becoming another
playback session.

There is no application backend, media proxy or shared playback server. Each
installation owns its queue, imported media, lyrics and appearance.

## Why this stack

The existing player already owns media, provider controls and lyric timing.
Keeping that implementation avoids separate web and native playback behavior.
Electron supplies a consistent Chromium runtime and the native windows required
by the desktop view. Its distribution size and update maintenance are costs of
that choice. A wrapper cannot change a provider's streaming rules.

A browser-only app cannot place a live window behind desktop icons. Tauri would
introduce another language and system-webview differences into the existing
player. The Windows-only native module stays limited to window placement. macOS
uses Electron's desktop window type.

## Owners

| Path                               | Responsibility                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `src/types.ts`                     | Track, lyric and observed playback contracts                                        |
| `src/library/`                     | Validated durable state and atomic persistence of metadata and imported bytes       |
| `src/app/useLibrary.ts`            | React library state, pending UI changes and refreshes from other windows            |
| `src/app/ListeningSession.tsx`     | The selected source and the only active audio session                               |
| `src/app/Playback.tsx`             | Mount and cleanup of the selected embedded provider                                 |
| `src/media/`                       | Local file inspection, media-element events and cleanup                             |
| `src/providers/`                   | Official provider integration, supported URLs and capabilities                      |
| `src/lyrics/`                      | Timed lyric input and opt-in local transcription                                    |
| `src/app/` presentation components | Queue, controls, lyrics and appearance interactions                                 |
| `src/desktop/`                     | Read-only wallpaper presentation and communication with the active player           |
| `desktop/`                         | Electron lifecycle, privileged IPC, local application serving and wallpaper windows |
| `native/`                          | Windows desktop-window attachment                                                   |
| `src/styles.css`                   | Responsive layout, typography, glass effects and motion                             |
| `tests/e2e/`                       | Journeys through the real running application                                       |

## Playback and wallpaper

The queue stores track identity. Playback reports the observed position and
status of the current source. Controls send commands to that source. They do not
advance a separate simulated audio clock. Switching tracks retires the previous
media owner and its callbacks before a new source plays.

The native wallpaper opens a dedicated read-only renderer. It reads the shared
library and receives small playback messages with a track ID, observed snapshot
and timestamp. It derives lyric position from that message and resolves the
matching local media by ID. It does not mount the player application, provider
SDKs or an independent audible media element.

Desktop window creation, placement and destruction belong to Electron. The
preload exposes named wallpaper operations and player visibility. IPC validates
both the sender and the payload. The renderer has no Node integration. Remote provider frames
must not receive the privileged bridge.

Local audio can use a separate imported image or muted video backdrop. Local
video can supply its own backdrop. The wallpaper never extracts or hides a
provider stream to simulate local media.

## Provider capabilities

Local audio and video provide the custom playback experience. Users can import
timed lyrics or start transcription for local media they supply.

YouTube and SoundCloud keep their official players visible and unobscured. The
app does not extract their audio or video for transcription or wallpaper. Region,
account, embedding and autoplay restrictions remain provider decisions.

Spotify is an external handoff. It supplies no in-app clock, automatic completion,
synchronized lyrics or video. Official references and the exact supported URL
forms belong in [the provider guide](providers.md).

## Durable state

IndexedDB stores the library metadata and imported media. Each write transaction
reads the latest saved state before applying its change. An import saves the file
and its metadata together. Removal deletes both together. A partial import
cannot leave an inaccessible recording consuming space.

Large media uses bounded ArrayBuffer records. Active views create a Blob and
object URL only for the file they need. Import and decoding require memory
proportional to file size, so imports are sequential and bounded. The wallpaper
may decode a second muted copy of a visual, while the player retains the only
audible copy.

The library hook applies pending absolute control changes over committed
revisions. IDs and shuffle orders are generated before a change is submitted.
Revisions prevent older reads from replacing newer state. BroadcastChannel and
window focus refresh other views. Playback requests remain local to the window
where the user pressed Play.

An Electron profile and a browser profile are separate libraries. Do not change
the desktop storage origin on each launch. Electron serves bundled files from
the stable `musica://app` origin. The protocol handler limits reads to the built
application directory. The player and wallpaper share its session and IndexedDB.

The wallpaper uses the primary display. A monitor configuration change or loss
of the Explorer desktop stops the wallpaper with a visible notice. Closing it
destroys the app's window and reveals the existing wallpaper. The app does not
rewrite system wallpaper preferences.

## Resource lifetime and privacy

Imported media and inferred lyrics stay on the device. Transcription discloses
its model download before it starts, has input limits and can be cancelled.
Provider frames communicate directly with their services.

The owner that creates a timer, media element, object URL, native listener or
worker also stops it. Wallpaper creation must be idempotent. Display changes,
window closure, shutdown and suspend must not leave duplicate native windows or
hidden audio sessions.

Errors describe the failed operation. Unsupported platforms and native attachment
failures do not become successful wallpaper state. No retry loop, unrestricted
file protocol, general URL proxy or implicit upload replaces that failure.

## Acceptance boundaries

A build proves that code can be compiled and packaged. Browser journeys prove
actual time progression, pause, seeking, completion, queue changes and lyric
timing. Electron journeys verify the real window and IPC path. Native placement
and installation need the target OS and its desktop session.

Keep these results separate. A Linux browser run cannot prove Windows Explorer
attachment or macOS desktop placement. A package archive does not prove code
signing, notarization or installation. Required missing acceptance keeps the PR
in draft.
