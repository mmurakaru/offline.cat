export type ModelOrigin = "US" | "CN" | "EU";

export interface CatalogEntry {
  id: string;
  label: string;
  lab: string;
  origin: ModelOrigin;
  hfRepo: string;
  hfFile: string;
  sizeBytes: number;
  contextTokens: number;
  description: string;
  installed: boolean;
}

async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export function listCatalog(): Promise<CatalogEntry[]> {
  return tauriInvoke<CatalogEntry[]>("list_catalog");
}

export function getActiveModelId(): Promise<string | null> {
  return tauriInvoke<string | null>("active_model");
}

export function loadModel(id: string): Promise<void> {
  return tauriInvoke<void>("load_model", { id });
}

export function unloadModel(): Promise<void> {
  return tauriInvoke<void>("unload_model");
}

export function deleteModel(id: string): Promise<void> {
  return tauriInvoke<void>("delete_model", { id });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
