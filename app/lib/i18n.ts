import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ca from "../locales/ca.json";
import en from "../locales/en.json";
import { ALTERNATE_LOCALES, DEFAULT_LOCALE } from "./locales";

function getInitialLocale(): string {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const stored = window.localStorage?.getItem("lang");
  if (stored && ALTERNATE_LOCALES.has(stored)) return stored;

  const firstSegment = window.location.pathname.split("/")[1];
  if (ALTERNATE_LOCALES.has(firstSegment)) return firstSegment;

  return DEFAULT_LOCALE;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ca: { translation: ca },
  },
  lng: getInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
