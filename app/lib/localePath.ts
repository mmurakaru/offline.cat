import i18n from "./i18n";
import { DEFAULT_LOCALE } from "./locales";

export function localePath(path: string): string {
  const lang = i18n.language;
  if (lang === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${lang}` : `/${lang}${path}`;
}
