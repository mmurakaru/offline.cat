export interface LanguageOption {
  id: string;
  name: string;
}

const CHROME_LANGUAGES: Record<string, string> = {
  ar: "Arabic",
  bg: "Bulgarian",
  bn: "Bengali",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fi: "Finnish",
  fr: "French",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  iw: "Hebrew",
  ja: "Japanese",
  kn: "Kannada",
  ko: "Korean",
  lt: "Lithuanian",
  mr: "Marathi",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  sl: "Slovenian",
  sv: "Swedish",
  ta: "Tamil",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  zh: "Chinese",
  "zh-Hant": "Chinese (Traditional)",
};

const LLM_EXTRA_LANGUAGES: Record<string, string> = {
  af: "Afrikaans",
  am: "Amharic",
  az: "Azerbaijani",
  be: "Belarusian",
  bs: "Bosnian",
  ca: "Catalan",
  cy: "Welsh",
  et: "Estonian",
  eu: "Basque",
  fa: "Persian",
  fil: "Filipino",
  ga: "Irish",
  gl: "Galician",
  gu: "Gujarati",
  ha: "Hausa",
  is: "Icelandic",
  ka: "Georgian",
  kk: "Kazakh",
  km: "Khmer",
  ky: "Kyrgyz",
  la: "Latin",
  lo: "Lao",
  lv: "Latvian",
  mk: "Macedonian",
  ml: "Malayalam",
  mn: "Mongolian",
  ms: "Malay",
  mt: "Maltese",
  my: "Burmese",
  ne: "Nepali",
  pa: "Punjabi",
  "pt-BR": "Portuguese (Brazil)",
  ps: "Pashto",
  si: "Sinhala",
  sq: "Albanian",
  sr: "Serbian",
  sw: "Swahili",
  tl: "Tagalog",
  ur: "Urdu",
  uz: "Uzbek",
  yo: "Yoruba",
  zu: "Zulu",
};

export const LANGUAGES: Record<string, string> = {
  ...CHROME_LANGUAGES,
  ...LLM_EXTRA_LANGUAGES,
};

// Chrome Translation API supported language pairs - direction matters,
// only these ones work with the built-in Translator API.
const CHROME_LANGUAGE_PAIRS: readonly (readonly [string, string])[] = [
  ["en", "es"],
  ["en", "ja"],
  ["en", "fr"],
  ["en", "hi"],
  ["en", "it"],
  ["en", "ko"],
  ["en", "nl"],
  ["en", "pl"],
  ["en", "pt"],
  ["en", "ru"],
  ["en", "th"],
  ["en", "tr"],
  ["en", "vi"],
  ["en", "zh"],
  ["en", "zh-Hant"],
  ["en", "fi"],
  ["en", "hr"],
  ["en", "hu"],
  ["en", "id"],
  ["en", "iw"],
  ["en", "lt"],
  ["en", "no"],
  ["en", "ro"],
  ["en", "sk"],
  ["en", "sl"],
  ["en", "sv"],
  ["en", "uk"],
  ["en", "kn"],
  ["en", "ta"],
  ["en", "te"],
  ["en", "mr"],
  ["ar", "en"],
  ["bn", "en"],
  ["de", "en"],
  ["bg", "en"],
  ["cs", "en"],
  ["da", "en"],
  ["el", "en"],
];

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (window as { isTauri?: boolean }).isTauri === true;
}

function toSortedOptions(ids: Iterable<string>): LanguageOption[] {
  return [...ids]
    .map((id) => ({ id, name: LANGUAGES[id] ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getSourceLanguages(): LanguageOption[] {
  if (isTauriRuntime()) {
    return toSortedOptions(Object.keys(LANGUAGES));
  }
  const sources = new Set(CHROME_LANGUAGE_PAIRS.map(([source]) => source));
  return toSortedOptions(sources);
}

export function getTargetLanguages(
  sourceLanguage: string,
): LanguageOption[] {
  if (isTauriRuntime()) {
    // Local LLMs can translate any-to-any; exclude the source to avoid
    // identity pairs.
    const ids = Object.keys(LANGUAGES).filter((id) => id !== sourceLanguage);
    return toSortedOptions(ids);
  }
  if (!sourceLanguage) {
    const targets = new Set(
      CHROME_LANGUAGE_PAIRS.map(([_source, target]) => target),
    );
    return toSortedOptions(targets);
  }
  return toSortedOptions(
    CHROME_LANGUAGE_PAIRS.filter(([source]) => source === sourceLanguage).map(
      ([_source, target]) => target,
    ),
  );
}
