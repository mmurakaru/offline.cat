import { useEffect, useState } from "react";
import { Link } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, redirect } from "react-router";
import { AppleIcon } from "../components/icons/apple-icon";
import { CoffeeIcon } from "../components/icons/coffee-icon";
import { GithubIcon } from "../components/icons/github-icon";
import { OfflineIcon } from "../components/icons/offline-icon";
import { RocketIcon } from "../components/icons/rocket-icon";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import {
  type DownloadTarget,
  detectTarget,
  downloadUrlFor,
  labelFor,
} from "../lib/download-url";
import i18n from "../lib/i18n";
import { localePath } from "../lib/localePath";
import { isTauriRuntime } from "../lib/runtime";

export function meta() {
  return [
    { title: i18n.t("meta.homeTitle") },
    {
      name: "description",
      content: i18n.t("meta.homeDescription"),
    },
  ];
}

// The homepage is the marketing / download site - only relevant on the web.
// Inside the Tauri desktop app, redirect straight to /create. This runs
// before the component renders, so there's no flash of the homepage.
export async function clientLoader() {
  if (!isTauriRuntime()) return null;
  throw redirect(localePath("/create"));
}

export default function Home() {
  const { t } = useTranslation();
  const [target, setTarget] = useState<DownloadTarget | null>(null);

  useEffect(function detectOsForDownloadButton() {
    setTarget(detectTarget());
  }, []);

  return (
    <main className="relative flex flex-col items-center p-4">
      <div className="absolute top-4 left-4">
        <OfflineIcon className="w-9 bg-black dark:bg-white" />
      </div>

      <div className="absolute top-4 right-4">
        <LocaleSwitcher />
      </div>

      <div className="flex flex-col items-center pt-[15vh]">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-center tracking-tight max-w-3xl">
          <span className="ai-highlight">{t("home.hero.titleHighlight")}</span>{" "}
          {t("home.hero.titleRest")}
        </h1>

        <p className="mt-6 text-lg text-grey-7 text-center max-w-md">
          {t("home.subtitle")}
        </p>

        <div className="mt-8 flex items-center gap-3 flex-wrap justify-center">
          {target && (
            <Link
              href={downloadUrlFor(target)}
              className="flex items-center gap-1.5 whitespace-nowrap px-5 py-2.5 bg-grey-25 text-grey-1 rounded-lg hover:bg-grey-23 dark:bg-grey-1 dark:text-grey-25 dark:hover:bg-grey-3 transition-colors"
            >
              {target.startsWith("macos") && <AppleIcon />}
              {labelFor(target)}
            </Link>
          )}
          <RouterLink
            to={localePath("/create")}
            className="whitespace-nowrap px-5 py-2.5 border border-grey-4 dark:border-grey-14 text-grey-9 dark:text-grey-4 rounded-lg hover:bg-grey-2 dark:hover:bg-grey-15 transition-colors"
          >
            {t("home.cta.tryInBrowser")}
          </RouterLink>
        </div>
      </div>

      <div className="mt-16 w-full max-w-4xl">
        <video
          src="/demo.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full rounded-xl border border-grey-3 dark:border-grey-14 shadow-lg"
        />
      </div>

      <section className="w-full max-w-4xl mt-16 md:mt-24">
        <div className="flex flex-col items-center text-center">
          <span className="text-sm font-semibold text-primary-5">
            {t("home.openSource.eyebrow")}
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">
            {t("home.openSource.title")}
          </h2>
          <p className="mt-4 text-lg text-grey-7 max-w-xl">
            {t("home.openSource.description")}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="https://github.com/mmurakaru/offline.cat"
            target="_blank"
            className="group flex flex-col gap-3 p-6 rounded-xl border border-grey-3 dark:border-grey-14 hover:border-grey-5 dark:hover:border-grey-10 hover:bg-grey-2 dark:hover:bg-grey-15 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-grey-2 dark:bg-grey-15 text-grey-9 dark:text-grey-4">
              <GithubIcon />
            </div>
            <h3 className="text-base font-semibold text-grey-9 dark:text-grey-4">
              {t("home.openSource.github.title")}
            </h3>
            <p className="text-sm text-grey-7">
              {t("home.openSource.github.description")}
            </p>
          </Link>

          <Link
            href="https://github.com/mmurakaru/offline.cat/releases/latest"
            target="_blank"
            className="group flex flex-col gap-3 p-6 rounded-xl border border-grey-3 dark:border-grey-14 hover:border-grey-5 dark:hover:border-grey-10 hover:bg-grey-2 dark:hover:bg-grey-15 transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-grey-2 dark:bg-grey-15 text-grey-9 dark:text-grey-4">
              <RocketIcon />
            </div>
            <h3 className="text-base font-semibold text-grey-9 dark:text-grey-4">
              {t("home.openSource.releases.title")}
            </h3>
            <p className="text-sm text-grey-7">
              {t("home.openSource.releases.description")}
            </p>
          </Link>
        </div>
      </section>

      <section className="w-full max-w-4xl mt-16 md:mt-24">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {t("home.support.title")}
          </h2>
          <p className="mt-4 text-lg text-grey-7 max-w-xl">
            {t("home.support.description")}
          </p>
          <Link
            href="https://buy.stripe.com/cNi9AM8HN8si8De68C4Ni00"
            target="_blank"
            className="mt-8 flex items-center gap-1.5 whitespace-nowrap px-6 py-3 bg-primary-5 text-white rounded-lg hover:bg-primary-6 transition-colors"
          >
            <CoffeeIcon />
            {t("home.support.cta")}
          </Link>
        </div>
      </section>

      <footer className="w-full max-w-4xl mt-16 mb-8">
        <div className="border-t border-grey-3 dark:border-grey-14 pt-4 flex justify-between text-xs text-grey-6">
          <span>{t("home.footer.brand")}</span>
          <span>{t("home.footer.copyright")}</span>
        </div>
      </footer>
    </main>
  );
}
