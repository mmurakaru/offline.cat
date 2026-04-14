import { Link } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router";
import { CoffeeIcon } from "../components/coffee-icon";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { OfflineIcon } from "../components/offline-icon";
import i18n from "../lib/i18n";

export function meta() {
  return [
    { title: i18n.t("meta.homeTitle") },
    {
      name: "description",
      content: i18n.t("meta.homeDescription"),
    },
  ];
}

export default function Home() {
  const { t } = useTranslation();

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
          <RouterLink
            to="/create"
            className="whitespace-nowrap px-5 py-2.5 bg-grey-25 text-grey-1 rounded-lg hover:bg-grey-23 dark:bg-grey-1 dark:text-grey-25 dark:hover:bg-grey-3 transition-colors"
          >
            {t("home.cta.start")}
          </RouterLink>
          <Link
            href="https://buy.stripe.com/cNi9AM8HN8si8De68C4Ni00"
            target="_blank"
            className="flex items-center gap-1.5 whitespace-nowrap px-5 py-2.5 bg-primary-5 text-white rounded-lg hover:bg-primary-6 transition-colors"
          >
            <CoffeeIcon />
            {t("home.cta.coffee")}
          </Link>
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

      <footer className="w-full max-w-4xl mt-16 mb-8">
        <div className="border-t border-grey-3 dark:border-grey-14 pt-4 flex justify-between text-xs text-grey-6">
          <span>{t("home.footer.brand")}</span>
          <span>{t("home.footer.copyright")}</span>
        </div>
      </footer>
    </main>
  );
}
