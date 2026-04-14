import { useCallback, useState } from "react";
import { Button, DropZone, FileTrigger } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { DocumentIcon } from "../components/document-icon";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OfflineIcon } from "../components/offline-icon";
import { cn } from "../lib/cn";
import { getDB } from "../lib/db";
import i18n from "../lib/i18n";

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
  const supported = typeof window !== "undefined" && "Translator" in globalThis;

  const handleFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const id = crypto.randomUUID();
      const db = await getDB();
      await db.execute(
        "INSERT INTO files (id, name, type, data, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, file.name, file.type, new Uint8Array(buffer), Date.now()],
      );

      navigate(`/translate/${id}`);
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
      <Link to="/" className="absolute top-4 left-4">
        <OfflineIcon className="w-9 bg-black dark:bg-white" />
      </Link>
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
      </div>

      {supported ? (
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
      ) : (
        <p className="text-xs text-red-400">{t("create.unsupported")}</p>
      )}

      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={async () => {
            const db = await getDB();
            await db.execute("DELETE FROM translation_memory");
            await db.execute("DELETE FROM files");
            alert(t("create.devCleared"));
          }}
          className="text-xs text-red-400 hover:text-red-600 underline cursor-pointer"
        >
          {t("create.devClear")}
        </button>
      )}
    </main>
  );
}
