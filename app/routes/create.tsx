import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, DropZone, FileTrigger } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HomeLogoLink } from "../components/HomeLogoLink";
import { DocumentIcon } from "../components/icons/document-icon";
import { TrashIcon } from "../components/icons/trash-icon";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { isInFlight, ModelPickerSelect } from "../components/ModelPickerSelect";
import {
  AUTO_DOWNLOAD_DEFAULT_ID,
  useModelManager,
} from "../hooks/useModelManager";
import { cn } from "../lib/cn";
import { getDB } from "../lib/db";
import i18n from "../lib/i18n";
import { localePath } from "../lib/localePath";
import { isTauriRuntime } from "../lib/runtime";

const ACCEPTED_TYPES = [".pptx", ".docx", ".html", ".htm", ".xliff", ".xlf"];

export function meta() {
  return [
    { title: i18n.t("meta.createTitle") },
    {
      name: "description",
      content: i18n.t("meta.homeDescription"),
    },
  ];
}

export default function Create() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const isTauri = isTauriRuntime();
  const hasChromeTranslator =
    typeof window !== "undefined" && "Translator" in globalThis;

  const manager = useModelManager();
  const {
    catalog,
    activeId,
    downloads,
    loading: catalogLoading,
    setActive,
    download,
  } = manager;
  const downloadInFlight = useMemo(
    () => Object.values(downloads).some(isInFlight),
    [downloads],
  );

  const supported =
    (isTauri || hasChromeTranslator) && !(isTauri && downloadInFlight);

  // One-shot auto-setup: if in Tauri, pick the first installed model as active;
  // if nothing is installed at all, start downloading the recommended default
  // so the user can translate as soon as it finishes.
  const autoSetupFiredRef = useRef(false);
  useEffect(
    function autoSetupActiveOrDownloadDefault() {
      if (!isTauri) return;
      if (catalogLoading) return;
      if (autoSetupFiredRef.current) return;
      if (activeId) return;
      if (downloadInFlight) return;

      const firstInstalled = catalog.find((entry) => entry.installed);
      if (firstInstalled) {
        autoSetupFiredRef.current = true;
        setActive(firstInstalled.id).catch(() => {
          autoSetupFiredRef.current = false;
        });
        return;
      }

      const defaultEntry = catalog.find(
        (entry) => entry.id === AUTO_DOWNLOAD_DEFAULT_ID,
      );
      if (!defaultEntry) return;
      autoSetupFiredRef.current = true;
      (async () => {
        const phase = await download(defaultEntry.id);
        if (phase === "done") {
          await setActive(defaultEntry.id).catch(() => {});
        }
      })().catch(() => {
        autoSetupFiredRef.current = false;
      });
    },
    [
      isTauri,
      catalogLoading,
      activeId,
      downloadInFlight,
      catalog,
      setActive,
      download,
    ],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const id = crypto.randomUUID();
      const db = await getDB();
      await db.execute(
        "INSERT INTO files (id, name, type, data, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, file.name, file.type, new Uint8Array(buffer), Date.now()],
      );

      navigate(localePath(`/translate/${id}`));
    },
    [navigate],
  );

  const onSelect = useCallback(
    (files: FileList | null) => {
      const file = files?.item(0);
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDrop = useCallback(
    async (e: {
      items: Array<{ kind: string; getFile?: () => Promise<File> }>;
    }) => {
      setIsDragging(false);
      const item = e.items.find((i) => i.kind === "file");
      if (item?.getFile) {
        const file = await item.getFile();
        handleFile(file);
      }
    },
    [handleFile],
  );

  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen gap-4 p-4">
      <HomeLogoLink className="absolute top-4 left-4" />
      <div className="absolute top-4 right-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-lg flex flex-col gap-2">
        <p className="text-grey-7 flex items-center gap-2">
          <DocumentIcon />
        </p>

        <FileTrigger
          onSelect={supported ? onSelect : undefined}
          acceptedFileTypes={ACCEPTED_TYPES}
        >
          <Button
            className={cn(
              "w-full outline-none",
              supported ? "cursor-pointer" : "cursor-not-allowed",
            )}
            isDisabled={!supported}
          >
            <DropZone
              onDropEnter={supported ? () => setIsDragging(true) : undefined}
              onDropExit={supported ? () => setIsDragging(false) : undefined}
              onDrop={supported ? onDrop : undefined}
              className={cn(
                "w-full border-2 border-dashed rounded-xl p-12 text-center transition-colors",
                !supported
                  ? "border-grey-4 dark:border-ui-divider opacity-50 cursor-not-allowed"
                  : isDragging
                    ? "border-primary-5 bg-primary-5/10 dark:bg-primary-10 cursor-pointer"
                    : "border-grey-4 dark:border-ui-divider hover:border-grey-5 dark:hover:border-grey-10 cursor-pointer",
              )}
            >
              <p className="text-sm text-grey-6">
                {t("create.dropzone.label")}
              </p>
              <p className="text-xs text-grey-6 mt-2">
                {t("create.dropzone.formats")}
              </p>
            </DropZone>
          </Button>
        </FileTrigger>

        {(isTauri || import.meta.env.DEV) && (
          <div className="flex items-center justify-between gap-3 mt-1">
            {import.meta.env.DEV ? (
              <button
                type="button"
                onClick={async () => {
                  const db = await getDB();
                  await db.execute("DELETE FROM translation_memory");
                  await db.execute("DELETE FROM files");
                  alert(t("create.devCleared"));
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors outline-none",
                  "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
                  "hover:bg-red-100 dark:hover:bg-red-950/60",
                  "focus-visible:ring-2 focus-visible:ring-red-500",
                )}
              >
                <TrashIcon />
                {t("create.devClear")}
              </button>
            ) : (
              <span />
            )}
            {isTauri && <ModelPickerSelect manager={manager} />}
          </div>
        )}
      </div>

      {!isTauri && hasChromeTranslator && (
        <p className="text-xs text-grey-6">
          {t("create.offlinePrefix")}{" "}
          <a
            href="chrome://on-device-translation-internals/"
            className="underline hover:text-grey-8 dark:hover:text-grey-4"
          >
            {t("create.offlineLink")}
          </a>{" "}
          {t("create.offlineSuffix")}
        </p>
      )}
      {!isTauri && !hasChromeTranslator && (
        <p className="text-xs text-red-400">{t("create.unsupported")}</p>
      )}
    </main>
  );
}
