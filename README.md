# Karaoke Studio V10 Beta

> Beta: this release is experimental and may contain bugs or incomplete integrations. Do not use it as a stable production release.

The native installer keeps numeric version `0.1.0` for MSI/WiX compatibility; Beta status is carried by the GitHub tag and release (`v0.1.0-beta.*`).

Karaoke Studio is a Tauri 2 desktop-first karaoke workspace built with React, TypeScript and Vite. The V10 foundation includes a responsive studio dashboard, local media import, synchronized demo lyrics, microphone permission flow, session scoring UI, navigation and recent-session data.

## Requirements

- Node.js 24 LTS and npm
- Rust with the MSVC toolchain
- Visual Studio Build Tools with the Desktop development with C++ workload on Windows

## Commands

```powershell
npm install
npm run dev
npm run build
npm run tauri:dev
npm run tauri:build
```

The browser version runs at `http://localhost:5173`. Tauri packages are written to `src-tauri/target/release/bundle` after a successful desktop build.

## Cloud releases

The workflow in `.github/workflows/release.yml` builds Windows (`.exe`, `.msi`), Linux (`.AppImage`, `.deb`, `.rpm`), macOS (`.dmg`) and Android (`.apk`) on GitHub Actions. Run it manually from the Actions tab or push a version tag such as `v0.2.0`.

The macOS and Android artifacts are unsigned by default. iOS (`.ipa`) requires a macOS runner plus Apple Developer signing certificates and provisioning secrets; add those only in GitHub encrypted secrets before enabling an iOS signing job.

## Roadmap

The next slices are real LRC parsing and playback synchronization, Web Audio pitch analysis, persistent local playlists, a SQLite-backed session history, and packaging profiles for Android, Linux and macOS.
