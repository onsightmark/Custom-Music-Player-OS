# Run On Sight Musica on your desktop

The desktop app adds a wallpaper window behind your desktop icons on the primary
display. Import local music or video, add timed lyrics, and turn on **Desktop**.
The music player keeps the queue and sound. The wallpaper displays the current
local track, lyrics, and muted video.

The browser version keeps its fullscreen listening view. A browser cannot place
an application window behind the operating system's desktop icons.

## Build from source

Install Node.js 24 with npm 11 and clone the repository. Windows builds also require
Python and the Visual Studio **Desktop development with C++** workload. Follow
[node-gyp's Windows prerequisites](https://github.com/nodejs/node-gyp#on-windows)
if the compiler is not already installed.

Run these commands from the repository root:

```sh
npm ci
npm run desktop
```

`desktop` builds and launches the app. `desktop:build` builds the web interface and the Windows attachment module when
running on Windows. macOS uses Electron's desktop window support and does not
compile that module. Linux can run the player for development, but desktop
wallpaper is unavailable there.

## Use desktop mode

1. Select **Add music** and import a local song or video.
2. Add an LRC or WebVTT file for timed lyrics, or start local transcription.
3. Choose your font, glass settings, colors, and animation in the appearance panel.
4. Start the track and select **Desktop**.
5. Minimize or close the player window to see the wallpaper.

When desktop mode is active, closing the player hides its window and keeps local
playback running. Use the On Sight Musica tray or menu bar icon to reopen it, stop
desktop mode, or quit. **Quit On Sight Musica** closes both windows and stops
playback. The app does not register itself to start at login.

Desktop mode is for imported local media. YouTube and SoundCloud retain their
visible official players in the main window. Spotify opens in Spotify. Desktop
mode does not extract provider streams or turn them into background videos.
YouTube pauses when its player window is hidden or minimized.

Locking the screen or suspending the computer hides the wallpaper. It resumes
after the screen unlocks and the computer wakes. A display layout change or an
Explorer restart stops desktop mode and reports the reason in the player. Enable
**Desktop** again to attach to the current primary display.

## Keep your library

The desktop application uses the stable `musica://app` origin in its Electron
profile. Songs, queue entries, appearance, and lyrics remain in that profile's
IndexedDB across application restarts. The browser installation has a separate
profile. Files imported in one installation do not automatically appear in the
other.

Imported files stay on your computer. Local transcription downloads its model
only after you choose to start it. Embedded services contact their own servers.
Removing the application profile removes that installation's library.

## Create an installer

Build on the operating system that you want to package:

```sh
npm run desktop:package
```

The `release` directory contains Windows NSIS or macOS DMG and ZIP artifacts.
The native Windows binary must match the architecture of Electron. The default
command builds for the machine's current architecture.

The project does not contain signing secrets. Public macOS distribution needs a
Developer ID certificate and notarization. Public Windows distribution benefits
from an Authenticode certificate. An unsigned CI package proves packaging, not
trusted installation or Gatekeeper acceptance. Electron Builder documents
[code signing](https://www.electron.build/code-signing.html) and
[macOS notarization](https://www.electron.build/mac.html).

## Diagnose an unavailable desktop

If the Windows attachment module is missing, run `npm run desktop:native` and
restart the application. Reinstalling a packaged app restores its bundled module.
Do not run On Sight Musica as administrator to work around an attachment failure.

Windows uses Explorer's WorkerW wallpaper window. Microsoft does not publish a
stable wallpaper embedding API for this technique. On Sight Musica checks the
window owner, the desktop hierarchy, and display scaling before attachment. An
unsupported shell layout or incompatible scaling mode produces an error without
changing your desktop wallpaper settings. Closing the wallpaper window reveals
the wallpaper already selected in Windows or macOS.

On macOS, the app uses Electron's
[desktop window type](https://www.electronjs.org/docs/latest/api/base-window#new-basewindowoptions).
Its window does not take keyboard focus or intercept clicks on desktop icons.

## Verify a release

Run the desktop type check and the real Electron journeys:

```sh
npm run desktop:typecheck
npm run desktop:build
npm run test:e2e:desktop
```

The suite launches the actual Electron app from `desktop/main.cjs`, imports real
media and lyrics, and closes and restarts the application to check persistence.
On Windows and macOS it must also attach a native wallpaper window, preserve one
audible media owner, and keep the wallpaper advancing while the hidden player's
decorative video pauses. A missing desktop session fails the native journey.
These source-launch tests do not establish that an installer starts correctly;
launch and exercise the packaged application before releasing it.

On a Windows or macOS machine with an active graphical session, also verify that
desktop icons remain clickable, local audio continues with the controller hidden,
video and lyrics follow seeking, and stopping restores the previous desktop.
Exercise screen lock, sleep, display changes, and a normal application restart.
A Linux Electron run does not establish those operating system behaviors.

Windows attachment uses the documented
[SetParent](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setparent)
window operation and rejects incompatible DPI contexts to avoid changing the
application's scaling mode. The Explorer discovery step remains an OS-specific
compatibility boundary. Keep a release draft until its required target-system
journeys and installation checks have passed.
