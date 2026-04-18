import { chromeTranslatorEngine } from "./chrome-translator";
import { llamaCppEngine } from "./llama-cpp";
import type { TranslationEngine } from "./types";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (window as { isTauri?: boolean }).isTauri === true;
}

export function getActiveEngine(): TranslationEngine {
  if (isTauriRuntime()) return llamaCppEngine;
  return chromeTranslatorEngine;
}
