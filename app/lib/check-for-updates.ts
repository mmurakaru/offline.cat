// Fires once when this module is imported (from `app/root.tsx`).
// Web and SSR skip silently; only the Tauri desktop webview runs the check.
//
// On app startup:
// 1. Fetch the configured updater endpoint (`latest.json` on GitHub Releases).
// 2. If the version is newer than the installed one, show Tauri's native
//    update dialog (enabled via `plugins.updater.dialog = true` in
//    tauri.conf.json). User can accept or dismiss.
// 3. On accept, download + verify + install, then relaunch.
//
// Errors are swallowed - a failed update check should never crash the app.

import { isTauriRuntime } from "./runtime";

async function runUpdateCheck() {
  if (!isTauriRuntime()) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return;

    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    console.warn("update check failed", err);
  }
}

runUpdateCheck();
