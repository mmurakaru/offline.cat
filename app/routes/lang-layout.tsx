import { Outlet, useLocation } from "react-router";
import i18n from "../lib/i18n";
import { DEFAULT_LOCALE } from "../lib/locales";

export default function LangLayout() {
  const location = useLocation();
  const lang = i18n.language;

  const path = location.pathname;
  const enPath =
    lang !== DEFAULT_LOCALE ? path.replace(`/${lang}`, "") || "/" : path;
  const caPath =
    lang !== DEFAULT_LOCALE ? path : path === "/" ? "/ca" : `/ca${path}`;

  return (
    <>
      <link rel="alternate" hrefLang="x-default" href={enPath} />
      <link rel="alternate" hrefLang="en" href={enPath} />
      <link rel="alternate" hrefLang="ca" href={caPath} />
      <Outlet />
    </>
  );
}
