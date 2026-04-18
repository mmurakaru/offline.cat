import { useMemo, useState } from "react";
import {
  Button,
  Input,
  SearchField,
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { HomeLogoLink } from "../components/HomeLogoLink";
import { XIcon } from "../components/icons/x-icon";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useModelManager } from "../hooks/useModelManager";
import { cn } from "../lib/cn";
import i18n from "../lib/i18n";
import { localePath } from "../lib/localePath";
import { formatBytes } from "../lib/models";
import { isTauriRuntime } from "../lib/runtime";

export function meta() {
  return [
    { title: i18n.t("meta.settingsTitle") },
    {
      name: "description",
      content: "Choose a local translation model for offline.cat.",
    },
  ];
}

type OriginFilter = "all" | string;

export default function Settings() {
  const { t } = useTranslation();
  const manager = useModelManager();
  const isDesktop = isTauriRuntime();

  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("from") ?? localePath("/create");

  const origins = useMemo(
    () => Array.from(new Set(manager.catalog.map((entry) => entry.origin))),
    [manager.catalog],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return manager.catalog.filter((entry) => {
      if (originFilter !== "all" && entry.origin !== originFilter) return false;
      if (!query) return true;
      return (
        entry.label.toLowerCase().includes(query) ||
        entry.lab.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        entry.hfRepo.toLowerCase().includes(query)
      );
    });
  }, [manager.catalog, search, originFilter]);

  const resetFilters = () => {
    setSearch("");
    setOriginFilter("all");
  };

  if (!isDesktop) {
    return (
      <main className="relative flex flex-col items-center p-4">
        <HomeLogoLink className="absolute top-4 left-4" />
        <div className="absolute top-4 right-4">
          <LocaleSwitcher />
        </div>
        <div className="flex flex-col items-center pt-[25vh] max-w-lg text-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("settings.desktopOnly.title")}
          </h1>
          <p className="text-grey-7">{t("settings.desktopOnly.description")}</p>
          <Link
            to={localePath("/")}
            className="mt-2 px-5 py-2.5 bg-grey-25 text-grey-1 rounded-lg hover:bg-grey-23 dark:bg-grey-1 dark:text-grey-25 dark:hover:bg-grey-3 transition-colors"
          >
            {t("settings.desktopOnly.back")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen flex flex-col overflow-hidden p-4">
      <HomeLogoLink className="absolute top-4 left-4 z-10" />
      <div className="absolute top-4 right-4 z-10">
        <LocaleSwitcher />
      </div>

      <section className="shrink-0 w-full max-w-3xl mx-auto pt-[12vh]">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-4xl font-semibold tracking-tight">
            {t("settings.title")}
          </h1>
          <Button
            onPress={() => navigate(returnTo)}
            aria-label={t("settings.close")}
            className="p-2 rounded-md cursor-pointer text-grey-7 dark:text-grey-6 hover:text-grey-9 dark:hover:text-grey-4 hover:bg-grey-2 dark:hover:bg-grey-15 transition-colors outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-primary-5"
          >
            <XIcon />
          </Button>
        </div>
        <p className="text-grey-7 mb-6">{t("settings.subtitle")}</p>

        <div className="flex items-center gap-3 flex-wrap mb-4">
          <SearchField
            value={search}
            onChange={setSearch}
            aria-label={t("settings.searchPlaceholder")}
            className="flex-1 min-w-45"
          >
            <div className="relative">
              <Input
                placeholder={t("settings.searchPlaceholder")}
                className={cn(
                  "w-full px-3 py-1.5 text-sm rounded-lg outline-none transition-colors",
                  "bg-grey-2 dark:bg-grey-15 text-grey-9 dark:text-grey-4",
                  "border border-grey-3 dark:border-grey-14",
                  "focus:border-primary-5 focus:ring-2 focus:ring-primary-5/30",
                  "placeholder:text-grey-6",
                )}
              />
              {search && (
                <Button
                  onPress={() => setSearch("")}
                  aria-label={t("settings.clearSearch")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-grey-6 hover:text-grey-8 dark:hover:text-grey-4 cursor-pointer"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </SearchField>

          <ToggleButtonGroup
            aria-label={t("settings.filterBy")}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[originFilter]}
            onSelectionChange={(keys) => {
              const next = Array.from(keys)[0];
              if (typeof next === "string") setOriginFilter(next);
            }}
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-grey-2 dark:bg-grey-15 border border-grey-3 dark:border-grey-14"
          >
            <FilterPill id="all" label={t("settings.filterAll")} />
            {origins.map((origin) => (
              <FilterPill key={origin} id={origin} label={origin} />
            ))}
          </ToggleButtonGroup>
        </div>
      </section>

      <div className="flex-1 min-h-0 w-full max-w-3xl mx-auto overflow-y-auto no-scrollbar pb-8">
        {manager.error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 text-sm">
            {manager.error}
          </div>
        )}

        {manager.loading ? (
          <p className="text-grey-7">{t("settings.loading")}</p>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <p className="text-grey-7">{t("settings.empty")}</p>
            <Button
              onPress={resetFilters}
              className="px-3 py-1.5 text-sm rounded-lg bg-grey-25 text-grey-1 dark:bg-grey-1 dark:text-grey-25 hover:bg-grey-23 dark:hover:bg-grey-3 transition-colors cursor-pointer"
            >
              {t("settings.clearFilters")}
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((entry) => {
              const dl = manager.downloads[entry.id];
              const progress =
                dl && dl.totalBytes > 0
                  ? Math.round((dl.bytesDownloaded / dl.totalBytes) * 100)
                  : 0;
              const isActive = manager.activeId === entry.id;

              return (
                <li
                  key={entry.id}
                  className={cn(
                    "p-4 rounded-lg border",
                    isActive
                      ? "border-primary-5 bg-primary-1/60 dark:bg-primary-1/10"
                      : "border-grey-3 dark:border-grey-15",
                  )}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold">{entry.label}</h2>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-grey-3 dark:bg-grey-15 text-grey-8">
                          {entry.lab} · {entry.origin}
                        </span>
                        {isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-5 text-white">
                            {t("settings.active")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-grey-7 mt-1">
                        {entry.description}
                      </p>
                      <p className="text-xs text-grey-6 mt-2">
                        {formatBytes(entry.sizeBytes)} ·{" "}
                        {(entry.contextTokens / 1000).toFixed(0)}K context ·{" "}
                        {entry.hfRepo}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!entry.installed && !dl && (
                        <Button
                          onPress={() => manager.download(entry.id)}
                          className="px-3 py-1.5 text-sm rounded-lg bg-grey-25 text-grey-1 dark:bg-grey-1 dark:text-grey-25 hover:bg-grey-23 dark:hover:bg-grey-3 transition-colors cursor-pointer"
                        >
                          {t("settings.download")}
                        </Button>
                      )}
                      {entry.installed && !isActive && (
                        <Button
                          onPress={() => manager.setActive(entry.id)}
                          className="px-3 py-1.5 text-sm rounded-lg bg-primary-5 text-white hover:bg-primary-6 transition-colors cursor-pointer"
                        >
                          {t("settings.setActive")}
                        </Button>
                      )}
                      {entry.installed && (
                        <Button
                          onPress={() => manager.remove(entry.id)}
                          className="px-3 py-1.5 text-sm rounded-lg border border-grey-4 dark:border-grey-15 text-grey-8 hover:bg-grey-2 dark:hover:bg-grey-15 transition-colors cursor-pointer"
                        >
                          {t("settings.remove")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {dl && dl.phase !== "done" && (
                    <div className="mt-3">
                      <div className="h-2 bg-grey-2 dark:bg-grey-15 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            dl.phase === "failed"
                              ? "bg-red-500"
                              : "bg-primary-5",
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-grey-7 mt-1">
                        {dl.phase === "verifying"
                          ? t("settings.verifying")
                          : dl.phase === "failed"
                            ? (dl.errorMessage ?? t("settings.downloadFailed"))
                            : `${progress}% · ${formatBytes(dl.bytesDownloaded)} / ${formatBytes(dl.totalBytes)}`}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function FilterPill({ id, label }: { id: string; label: string }) {
  return (
    <ToggleButton
      id={id}
      className={cn(
        "px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors outline-none",
        "text-grey-7 dark:text-grey-6",
        "hover:text-grey-9 dark:hover:text-grey-4",
        "data-[selected]:bg-white dark:data-[selected]:bg-grey-17",
        "data-[selected]:text-grey-9 dark:data-[selected]:text-grey-4",
        "data-[selected]:shadow-[0px_1px_1px_0px_rgba(0,0,0,0.08)]",
        "data-[focus-visible]:ring-2 data-[focus-visible]:ring-primary-5/40",
      )}
    >
      {label}
    </ToggleButton>
  );
}
