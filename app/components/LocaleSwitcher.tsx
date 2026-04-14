import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { DEFAULT_LOCALE, LOCALES } from "../lib/locales";

export function LocaleSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const location = useLocation();
  const currentLang = i18n.language;

  function pathForLocale(locale: string) {
    if (locale === DEFAULT_LOCALE) {
      return currentLang !== DEFAULT_LOCALE
        ? location.pathname.replace(`/${currentLang}`, "") || "/"
        : location.pathname;
    }
    if (currentLang !== DEFAULT_LOCALE) {
      return location.pathname.replace(`/${currentLang}`, `/${locale}`);
    }
    return location.pathname === "/"
      ? `/${locale}`
      : `/${locale}${location.pathname}`;
  }

  const linkClass = (active: boolean) =>
    cn(
      "w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold leading-none transition-colors",
      active
        ? "bg-primary-5 text-white"
        : "text-grey-6 hover:text-grey-8 dark:hover:text-grey-4 hover:bg-grey-3 dark:hover:bg-grey-15",
    );

  return (
    <nav className={cn("flex gap-0.5", className)}>
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          to={pathForLocale(locale)}
          className={linkClass(currentLang === locale)}
        >
          {locale.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
