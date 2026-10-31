# Provider behavior

On Sight Musica uses a local browser media element for imported files. YouTube and SoundCloud
play inside their official embeds. Spotify links open in Spotify only after the
user clicks **Open in Spotify**. The app has no provider credentials or media proxy.

| Source               | Playback                | Custom controls and clock | Imported timed lyrics | Custom video background     | Automatic queue advance      |
| -------------------- | ----------------------- | ------------------------- | --------------------- | --------------------------- | ---------------------------- |
| Local audio or video | Browser media element   | Yes                       | Yes                   | The active local video only | Yes                          |
| YouTube              | Visible official player | Yes                       | Beside the player     | No overlay on the video     | On the player's ended event  |
| SoundCloud           | Visible official widget | Yes                       | Yes                   | No                          | On the widget's finish event |
| Spotify              | External app or website | No                        | No                    | No                          | No                           |

Imported lyrics remain the user's text. Provider integration does not grant
permission to redistribute recordings or lyrics. Transcription accepts local
media only. The app cannot read an embedded player's protected audio.

## YouTube

The [IFrame API](https://developers.google.com/youtube/iframe_api_reference)
provides playback commands, state events and the playback clock. On Sight Musica polls that
clock four times per second only while playing. It stops polling during pause,
buffering, teardown and hidden playback. Autoplay rejection produces a visible
instruction to use the official player's Play button. If buffering lasts 15
seconds, On Sight Musica pauses the request and offers a manual retry or the original link.

Seeking before playback, including restoring a player after a dialog, uses the
API's `cueVideoById` with `startSeconds`. This keeps the video cued until Play is
requested. A normal `seekTo` would start playback from that state. The displayed
position always comes from the provider's clock, including after the cued event.

The [minimum functionality rules](https://developers.google.com/youtube/terms/required-minimum-functionality)
require an unobscured player of at least 200 by 200 pixels and identification
through the HTTP referrer. On Sight Musica keeps captions, controls and attribution inside
the official player. Imported lyrics appear outside its rectangle. Playback pauses
when the document is hidden, the native player window is hidden or minimized, or
no more than half the player is in the viewport. A play event that arrives after
the window becomes hidden is paused as well. The app never automatically resumes
on returning to the player.

Serve the browser app over HTTP on localhost or HTTPS in deployment. Keep the
`strict-origin-when-cross-origin` referrer policy. The installed desktop app uses
the stable `musica://app` origin and identifies its YouTube embed requests with
the native application ID through `Referer: https://com.onsight.musica/`, following
YouTube's desktop WebView identification guidance. This header is limited to the
player window's YouTube embed requests. Error 153 means YouTube did not receive
the required identification. Private, removed, region-restricted and
embedding-disabled videos may remain unavailable.

## SoundCloud

The [Widget API](https://developers.soundcloud.com/docs/api/html5-widget) supplies
play, pause, seek, volume, duration and playback events. On Sight Musica uses milliseconds
only at this API boundary and reports seconds to the application.

The widget's documented `load` method retains event subscriptions. On Sight Musica keeps one
widget instance per page and sends its events to the current mount's handlers.
Switching away clears those handlers, pauses the connected widget, and removes
its iframe. The next SoundCloud selection reuses the same instance. This avoids
creating a new instance for every track in an SDK without a public destroy method.

The widget stays visible with its attribution. Track availability, browser
playback permission and SoundCloud account requirements remain service decisions.
If a play command produces no playback event within five seconds, On Sight Musica tells the
user to press Play inside the widget. That message does not assert a cause.

## Spotify

Spotify is an external handoff because this project combines media sources.
The [Widget Terms, section IV.3.f](https://developer.spotify.com/documentation/embeds/terms)
restrict integration with another service's streams. Section IV.3.g and the
[compliance guidance](https://developer.spotify.com/compliance-tips) also restrict
synchronizing recordings with lyrics or other visual media.

On Sight Musica does not load a Spotify SDK or iframe, request account access, inspect Spotify
playback or infer when a song ends. Selecting a Spotify item stops the previous
in-app source. The explicit link opens Spotify, where its own playback rules apply.

## Input and resource boundaries

The URL parser accepts secure links on exact provider hostnames. It reconstructs
canonical URLs and removes tracking parameters. It rejects custom ports,
credentials, unsupported domains, playlists and malformed identifiers.

Supported link forms are YouTube `watch?v=`, `youtu.be/`, `shorts/`, `live/` and
`embed/`; Spotify `open.spotify.com/track/`; and public SoundCloud
`soundcloud.com/artist/song`. Shortened redirect links must be expanded in the
provider's own app first.

Each provider script has one shared loading promise. Loading and player readiness
have separate 15-second deadlines. A failed load does not retry automatically.
Changing selection aborts the old mount. Late events cannot update its snapshot.

Official players contact their providers directly. These providers can receive
network information and use cookies or an existing account session according to
their own privacy policies. Local files never pass through the provider adapters.
A loaded iframe is not proof of successful playback. Real-provider acceptance must
observe time progressing, pausing, seeking and source cleanup in the running app.

Run `npm run test:e2e:providers` for these live checks. The default engine is
Chromium; set `MUSICA_PROVIDER_BROWSER=firefox` or `webkit` to select another
installed Playwright engine. Tests use normal TLS verification and never replace
provider responses. A provider or network failure remains a failed acceptance
check, even when the app reports it correctly.
