import { useCallback, useState } from "react";
import { Button, DropZone, FileTrigger, Text } from "react-aria-components";
import { useNavigate } from "react-router";
import { getDB } from "../lib/db";

const ACCEPTED_TYPES = [".pptx", ".docx", ".html", ".htm", ".xliff", ".xlf"];

export function meta() {
  return [
    { title: "offline.cat" },
    {
      name: "description",
      content:
        "Translate documents offline. No servers. No accounts. No exceptions.",
    },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const id = crypto.randomUUID();
      const db = await getDB();
      await db.put("files", {
        id,
        name: file.name,
        type: file.type,
        data: new Uint8Array(buffer),
        createdAt: Date.now(),
      });

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
    <main className="flex flex-col items-center justify-center min-h-screen gap-8 p-4">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">offline.cat</h1>
        <p className="text-gray-500">
          Translate documents offline. No servers. No accounts. No exceptions.
        </p>
      </div>

      <DropZone
        onDropEnter={() => setIsDragging(true)}
        onDropExit={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
            : "border-gray-300 dark:border-gray-700"
        }`}
      >
        <div className="flex flex-col items-center gap-4">
          <Text
            slot="label"
            className="text-lg text-gray-600 dark:text-gray-400"
          >
            Drop a file here
          </Text>
          <p className="text-sm text-gray-400">PPTX, DOCX, HTML, XLIFF</p>
          <FileTrigger onSelect={onSelect} acceptedFileTypes={ACCEPTED_TYPES}>
            <Button className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-colors cursor-pointer">
              Browse files
            </Button>
          </FileTrigger>
        </div>
      </DropZone>

      <p className="text-xs text-gray-400">
        For offline usage,{" "}
        <a
          href="chrome://on-device-translation-internals/"
          className="underline hover:text-gray-600 dark:hover:text-gray-300"
        >
          download required language packs
        </a>{" "}
        first.
      </p>
    </main>
  );
}
