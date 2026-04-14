export const DEFAULT_LOCALE = "en";
export const LOCALES = ["en", "ca"] as const;
export type Locale = (typeof LOCALES)[number];
export const ALTERNATE_LOCALES: Set<string> = new Set(
  LOCALES.filter((l) => l !== DEFAULT_LOCALE),
);
