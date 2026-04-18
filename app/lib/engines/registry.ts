import { isTauriRuntime } from "../runtime";
import { chromeTranslatorEngine } from "./chrome-translator";
import { llamaCppEngine } from "./llama-cpp";
import type { TranslationEngine } from "./types";

export function getActiveEngine(): TranslationEngine {
  if (isTauriRuntime()) return llamaCppEngine;
  return chromeTranslatorEngine;
}
