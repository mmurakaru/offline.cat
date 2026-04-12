import { useCallback, useState } from "react";
import { Button, DropZone, FileTrigger } from "react-aria-components";
import { Link, useNavigate } from "react-router";
import { DocumentIcon } from "../components/document-icon";
import { OfflineIcon } from "../components/offline-icon";
import { cn } from "../lib/cn";
import { getDB } from "../lib/db";

const ACCEPTED_TYPES = [".pptx", ".docx", ".html", ".htm", ".xliff", ".xlf"];

export function meta() {
  return [
    { title: "New project - offline.cat" },
    {
      name: "description",
      content:
        "Translate documents offline. No servers. No accounts. No exceptions.",
    },
  ];
}

export default function Create() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);

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
      <div className="w-full max-w-lg flex flex-col gap-2">
        <p className="text-grey-7 flex items-center gap-2">
          <DocumentIcon />
        </p>

        <FileTrigger onSelect={onSelect} acceptedFileTypes={ACCEPTED_TYPES}>
          <Button className="w-full cursor-pointer outline-none">
            <DropZone
              onDropEnter={() => setIsDragging(true)}
              onDropExit={() => setIsDragging(false)}
              onDrop={onDrop}
              className={cn(
                "w-full border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
                isDragging
                  ? "border-primary-5 bg-primary-5/10 dark:bg-primary-10"
                  : "border-grey-4 dark:border-ui-divider hover:border-grey-5 dark:hover:border-grey-10",
              )}
            >
              <p className="text-sm text-grey-6">
                Drop a file or click to browse
              </p>
              <p className="text-xs text-grey-6 mt-2">
                PPTX, DOCX, HTML, XLIFF
              </p>
            </DropZone>
          </Button>
        </FileTrigger>
      </div>

      <p className="text-xs text-grey-6">
        For offline usage,{" "}
        <a
          href="chrome://on-device-translation-internals/"
          className="underline hover:text-grey-8 dark:hover:text-grey-4"
        >
          download required language packs
        </a>{" "}
        first.
      </p>

      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={async () => {
            const db = await getDB();
            await db.execute("DELETE FROM translation_memory");
            await db.execute("DELETE FROM files");
            alert("Database cleared.");
          }}
          className="text-xs text-red-400 hover:text-red-600 underline cursor-pointer"
        >
          [DEV] Clear database
        </button>
      )}
    </main>
  );
}
