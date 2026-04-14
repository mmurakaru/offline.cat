import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ca from "../locales/ca.json";
import en from "../locales/en.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ca: { translation: ca },
  },
  lng:
    (typeof localStorage !== "undefined" && localStorage.getItem("locale")) ||
    "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
