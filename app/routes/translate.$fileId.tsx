import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useNavigate, useParams } from "react-router";
import type { Segment } from "../hooks/useTranslation";
import { useTranslation } from "../hooks/useTranslation";
import { getDB } from "../lib/db";
import { extractSegments, reconstructFile } from "../lib/parser-client";
import { addTMEntry, findTMMatch } from "../lib/tm";

export function meta() {
  return [{ title: "Translate - offline.cat" }];
}

const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "es", name: "Spanish" },
  { id: "fr", name: "French" },
  { id: "de", name: "German" },
  { id: "it", name: "Italian" },
  { id: "pt", name: "Portuguese" },
  { id: "nl", name: "Dutch" },
  { id: "ja", name: "Japanese" },
  { id: "ko", name: "Korean" },
  { id: "zh", name: "Chinese" },
];

function getMatchColor(segment: Segment): string {
  if (!segment.origin && !segment.tmScore) return "";
  if (segment.origin === "tm") {
    const score = segment.tmScore ?? 100;
    if (score >= 95) return "bg-green-50 dark:bg-green-950";
    return "bg-yellow-50 dark:bg-yellow-950";
  }
  if (segment.origin === "mt") return "bg-white dark:bg-gray-900";
  if (segment.origin === "user") return "bg-green-50 dark:bg-green-950";
  return "";
}

function getMatchLabel(segment: Segment): string | null {
  if (segment.origin === "tm") {
    const score = segment.tmScore ?? 100;
    return `TM ${Math.round(score)}%`;
  }
  if (segment.origin === "mt") return "MT";
  if (segment.origin === "user") return "Confirmed";
  if (segment.tmSuggestion) return `TM ${Math.round(segment.tmScore ?? 0)}%`;
  return null;
}

export default function Translate() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const fileDataRef = useRef<{ data: Uint8Array; ext: string } | null>(null);
  const { segments, setSegments, isTranslating, error, translate, cancel } =
    useTranslation();

  // Load file from IndexedDB
  useEffect(() => {
    const loadFile = async () => {
      const db = await getDB();
      const file = await db.get("files", fileId!);
      if (!file) {
        navigate("/");
        return;
      }

      setFileName(file.name);

      const data = file.data;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      fileDataRef.current = { data, ext };

      const rawSegments = await extractSegments(data, ext);

      // Run TM check on each segment
      const langPair = `${sourceLanguage}-${targetLanguage}`;
      const processed: Segment[] = await Promise.all(
        rawSegments.map(async (segment) => {
          const match = await findTMMatch(segment.source, langPair);

          if (match.score >= 95) {
            return {
              ...segment,
              target: match.translation,
              origin: "tm" as const,
              tmScore: match.score,
            };
          }

          if (match.score >= 75) {
            return {
              ...segment,
              tmSuggestion: match.translation,
              tmScore: match.score,
              needsTranslation: true,
            };
          }

          return { ...segment, needsTranslation: true };
        }),
      );

      setSegments(processed);
    };

    loadFile();
  }, [fileId, navigate, sourceLanguage, targetLanguage, setSegments]);

  const handleTranslate = useCallback(() => {
    translate(segments, sourceLanguage, targetLanguage);
  }, [segments, sourceLanguage, targetLanguage, translate]);

  const handleConfirm = useCallback(
    async (segmentId: string, translation: string) => {
      const segment = segments.find((s) => s.id === segmentId);
      if (!segment) return;

      const langPair = `${sourceLanguage}-${targetLanguage}`;
      await addTMEntry(segment.source, translation, langPair);

      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId
            ? { ...s, target: translation, origin: "user" as const }
            : s,
        ),
      );
    },
    [segments, sourceLanguage, targetLanguage, setSegments],
  );

  const handleDownload = useCallback(async () => {
    const fileInfo = fileDataRef.current;
    if (!fileInfo) return;

    const translations = new Map<string, string>();
    for (const segment of segments) {
      if (segment.target) {
        translations.set(segment.id, segment.target);
      }
    }

    const result = await reconstructFile(
      fileInfo.data,
      fileInfo.ext,
      translations,
    );

    const mimeTypes: Record<string, string> = {
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      html: "text/html",
      htm: "text/html",
      xliff: "application/xml",
      xlf: "application/xml",
    };

    const baseName = fileName.replace(/\.[^.]+$/, "");
    const outputName = `${baseName}_${targetLanguage}.${fileInfo.ext}`;
    const outputBlob = new Blob([result], {
      type: mimeTypes[fileInfo.ext] ?? "application/octet-stream",
    });

    const url = URL.createObjectURL(outputBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = outputName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [segments, fileName, targetLanguage]);

  const stats = useMemo(() => {
    const total = segments.length;
    const translated = segments.filter((s) => s.target).length;
    const confirmed = segments.filter((s) => s.origin === "user").length;
    return { total, translated, confirmed };
  }, [segments]);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              onPress={() => navigate("/")}
              className="text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer"
            >
              &larr; Back
            </Button>
            <span className="font-medium">{fileName}</span>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <span className="text-gray-400">&rarr;</span>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <Button
              onPress={isTranslating ? cancel : handleTranslate}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer ${
                isTranslating
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
              }`}
            >
              {isTranslating ? "Cancel" : "Translate"}
            </Button>

            <Button
              onPress={handleDownload}
              isDisabled={stats.translated === 0}
              className="px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="max-w-6xl mx-auto mt-2">
            <div className="flex gap-2 text-xs text-gray-500">
              <span>
                {stats.translated}/{stats.total} translated
              </span>
              <span>&middot;</span>
              <span>{stats.confirmed} confirmed</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1 mt-1">
              <div
                className="bg-green-500 h-1 rounded-full transition-all"
                style={{
                  width: `${stats.total > 0 ? (stats.translated / stats.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Error message */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Segment grid */}
      <div className="max-w-6xl mx-auto p-4">
        {segments.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            No translatable segments found.
          </p>
        ) : (
          <div className="border rounded-lg dark:border-gray-800 divide-y dark:divide-gray-800">
            {/* Column headers */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase">
              <span className="w-8">#</span>
              <span>Source</span>
              <span>Target</span>
              <span className="w-20">Status</span>
            </div>

            {segments.map((segment, index) => (
              <div
                key={segment.id}
                className={`grid grid-cols-[auto_1fr_1fr_auto] gap-4 px-4 py-3 ${getMatchColor(segment)}`}
              >
                <span className="w-8 text-xs text-gray-400 pt-1">
                  {index + 1}
                </span>
                <p className="text-sm">{segment.source}</p>
                <div className="flex flex-col gap-1">
                  {segment.tmSuggestion && !segment.target && (
                    <p className="text-xs text-yellow-600 italic">
                      TM suggestion: {segment.tmSuggestion}
                    </p>
                  )}
                  <input
                    type="text"
                    value={segment.target ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSegments((prev) =>
                        prev.map((s) =>
                          s.id === segment.id ? { ...s, target: value } : s,
                        ),
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && segment.target) {
                        handleConfirm(segment.id, segment.target);
                      }
                    }}
                    placeholder="Translation..."
                    className="w-full text-sm border rounded px-2 py-1 bg-transparent dark:border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="w-20 flex items-start">
                  {getMatchLabel(segment) && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        segment.origin === "user" ||
                        (
                          segment.origin === "tm" &&
                            (segment.tmScore ?? 0) >= 95
                        )
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : segment.origin === "mt"
                            ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                      }`}
                    >
                      {getMatchLabel(segment)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
