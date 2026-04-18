/**
 * True when the frontend is running inside the Tauri desktop webview.
 * `window.isTauri` is set by the Tauri runtime since 2.0.0-beta.9.
 * Safe to call during SSR / worker contexts - returns false.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (window as { isTauri?: boolean }).isTauri === true;
}
