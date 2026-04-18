import { useCallback, useEffect, useState } from "react";
import {
  type CatalogEntry,
  deleteModel as deleteModelCommand,
  getActiveModelId,
  listCatalog,
  loadModel as loadModelCommand,
} from "../lib/models";

type DownloadEvent =
  | { kind: "started"; totalBytes: number }
  | { kind: "progress"; bytesDownloaded: number; totalBytes: number }
  | { kind: "verifying" }
  | { kind: "finished" }
  | { kind: "cancelled" }
  | { kind: "failed"; message: string };

export type DownloadPhase =
  | "queued"
  | "downloading"
  | "verifying"
  | "done"
  | "cancelled"
  | "failed";

export interface DownloadStatus {
  bytesDownloaded: number;
  totalBytes: number;
  phase: DownloadPhase;
  errorMessage?: string;
}

const ACTIVE_MODEL_KEY = "activeModelId";

export const AUTO_DOWNLOAD_DEFAULT_ID = "gemma-4-e4b";

export function useModelManager() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadStatus>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async function refreshCatalog() {
    try {
      const [entries, current] = await Promise.all([
        listCatalog(),
        getActiveModelId(),
      ]);
      setCatalog(entries);
      setActiveId(current);
      if (current) {
        window.localStorage?.setItem(ACTIVE_MODEL_KEY, current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(
    function bootstrapOnMount() {
      refresh();
    },
    [refresh],
  );

  const download = useCallback(
    async (id: string): Promise<DownloadPhase> => {
      setDownloads((prev) => ({
        ...prev,
        [id]: { bytesDownloaded: 0, totalBytes: 0, phase: "queued" },
      }));

      const { Channel, invoke } = await import("@tauri-apps/api/core");
      const channel = new Channel<DownloadEvent>();
      let finalPhase: DownloadPhase = "failed";

      channel.onmessage = (event) => {
        // Capture terminal phase synchronously, BEFORE handing off to React's
        // setDownloads. The functional updater runs at render time, which can
        // be after the command's invoke() has already resolved - which would
        // leave finalPhase stale when we return it to the caller.
        if (event.kind === "finished") finalPhase = "done";
        else if (event.kind === "cancelled") finalPhase = "cancelled";
        else if (event.kind === "failed") finalPhase = "failed";

        setDownloads((prev) => {
          const existing = prev[id] ?? {
            bytesDownloaded: 0,
            totalBytes: 0,
            phase: "queued" as const,
          };
          switch (event.kind) {
            case "started":
              return {
                ...prev,
                [id]: {
                  ...existing,
                  totalBytes: event.totalBytes,
                  phase: "downloading",
                },
              };
            case "progress":
              return {
                ...prev,
                [id]: {
                  ...existing,
                  bytesDownloaded: event.bytesDownloaded,
                  totalBytes: event.totalBytes,
                  phase: "downloading",
                },
              };
            case "verifying":
              return { ...prev, [id]: { ...existing, phase: "verifying" } };
            case "finished":
              return { ...prev, [id]: { ...existing, phase: "done" } };
            case "cancelled":
              return { ...prev, [id]: { ...existing, phase: "cancelled" } };
            case "failed":
              return {
                ...prev,
                [id]: {
                  ...existing,
                  phase: "failed",
                  errorMessage: event.message,
                },
              };
          }
        });
      };

      try {
        await invoke("download_model", {
          args: { id },
          onEvent: channel,
        });
        await refresh();
        return finalPhase;
      } catch (err) {
        setDownloads((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? {
              bytesDownloaded: 0,
              totalBytes: 0,
              phase: "queued",
            }),
            phase: "failed",
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        }));
        return "failed";
      }
    },
    [refresh],
  );

  const cancelDownload = useCallback(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_download");
  }, []);

  const setActive = useCallback(async (id: string) => {
    await loadModelCommand(id);
    setActiveId(id);
    window.localStorage?.setItem(ACTIVE_MODEL_KEY, id);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await deleteModelCommand(id);
      if (activeId === id) {
        setActiveId(null);
        window.localStorage?.removeItem(ACTIVE_MODEL_KEY);
      }
      await refresh();
    },
    [activeId, refresh],
  );

  return {
    catalog,
    activeId,
    downloads,
    loading,
    error,
    download,
    cancelDownload,
    setActive,
    remove,
    refresh,
  };
}
