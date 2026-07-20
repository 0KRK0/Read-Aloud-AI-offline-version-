# Lexora AI — Android / iOS via Capacitor (Phase 3 guide)

The PWA layer is DONE in the repo (manifest.webmanifest + sw.js: installable,
instant repeat loads). Native store apps can't be compiled from the web repo —
they need Android Studio / Xcode on your machine. This is the exact recipe.

## Why Capacitor
The whole app is a static site — Capacitor wraps it in a native WebView with
zero code changes, and lets us add native plugins (file open-with, share
target, TTS) later. This was always the plan (HANDOVER §9.5).

## Android (do this first — no fees blocker, ₹2,600 one-time Play fee)
1. Install Node LTS + Android Studio (with SDK 34+).
2. In a NEW folder (not inside `online/`):
   ```
   npm init -y
   npm i @capacitor/core @capacitor/cli
   npx cap init "Lexora AI" online.lexoraai.app --web-dir=www
   ```
3. **Point it at the live site** (simplest + always up-to-date — the app is a
   shell over lexoraai.online): in `capacitor.config.json`:
   ```json
   { "appId": "online.lexoraai.app", "appName": "Lexora AI",
     "webDir": "www", "server": { "url": "https://lexoraai.online", "cleartext": false } }
   ```
   (Create an empty `www/` with a stub index.html — required by the CLI.)
4. `npx cap add android` → `npx cap open android` → Android Studio opens.
5. Set the launcher icon (use `online/icons/icon-512.png` via Image Asset).
6. Build → Generate Signed App Bundle → keep the keystore SAFE (losing it =
   losing the app listing).
7. Play Console: create the app, upload the .aab, privacy policy URL =
   https://lexoraai.online/privacy, data-safety form = "no data collected"
   (analytics off) or declare GA4 if enabled.
8. Camera/mic (scan + voice commands): add to AndroidManifest.xml:
   `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` permissions.

## iOS (needs a Mac + $99/yr Apple Developer — do after Android proves demand)
Same steps with `npx cap add ios`, then Xcode: signing team, camera/mic usage
descriptions in Info.plist, archive → App Store Connect.

## Store-readiness checklist (both)
- [ ] Deep links: verify lexoraai.online links open in-app (assetlinks.json /
      apple-app-site-association — add to `online/` when you get here).
- [ ] Offline: the PWA sw caches libs; show the reader's friendly offline state.
- [ ] Back button (Android): Capacitor handles WebView history — test tools nav.
- [ ] Screenshots: reader with karaoke highlight, tools grid, scan, companion.

## Later (native upgrades, optional)
@capacitor/filesystem (save outputs to Files), share-target (open PDFs from
other apps → reader), local notifications (reading reminders), and the Own
Voice TTS engine once Lexora Voice ships.
