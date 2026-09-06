# Karaoke Studio workspace

- Keep the React frontend modular and type-safe.
- Preserve the current visual language: warm paper background, plum stage, lime accent, compact operational UI.
- Prefer browser APIs for media and microphone behavior, with Tauri commands added behind small adapters.
- Validate changes with `npm run build`; validate desktop packaging with `npm run tauri:build` when the Windows C++ linker is available.
- Keep user media local by default and never commit API keys or private audio files.
