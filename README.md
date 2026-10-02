# Karaoke Studio V10 Beta

> Experimental Beta software. Expect incomplete features and bugs.

Karaoke Studio is a Tauri 2 desktop/mobile karaoke application built with React, TypeScript and Vite.

## Working features

- Local audio playback with play/pause, stop, seek and volume controls.
- Timed `.lrc` parsing, metadata/offset support, range and gap checks against track duration, cue audition, and manual synchronization adjustment.
- LRCLIB online search by title and artist; choose a synchronized result after checking its duration.
- Microphone level and pitch detection. Android includes `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`; iOS declares `NSMicrophoneUsageDescription`.
- Official embedded playback for public YouTube, Spotify, Deezer and SoundCloud URLs. Playback controls and authentication are provided by each service’s own player.
- Saved public playlist links and session history are stored locally on the device.
- In-app update checks query public GitHub prereleases and show release notes/download links.

The app does not yet provide cloud accounts or private playlist synchronization. Those require a deployed authentication backend and registered OAuth client credentials for each provider. The current voice analyzer measures microphone input and pitch; it does not claim full vocal scoring without timed note charts.

## Development

Requirements: Node.js 24, Rust, and on Windows Visual Studio Build Tools with the C++ workload.

```powershell
npm ci
npm test
npm run lint
npm run build
npm run tauri:dev
```

## Release builds

GitHub Actions builds Windows `.exe` and `.msi`, Linux `.AppImage`/`.deb`/`.rpm`, macOS `.dmg`, and Android `.apk` when a `v*` tag is pushed. Windows/Linux/macOS builds are independent from Android so an Android failure does not hide desktop installers.

iOS requires a macOS runner. The workflow builds a simulator app without Apple signing. A device-installable `.ipa` requires repository secrets `IOS_CERTIFICATE_P12_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, and `IOS_TEAM_ID`. Store secrets only in GitHub Actions secrets; never commit them.
