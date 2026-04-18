import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Separator,
  SubmenuTrigger,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { DownloadStatus, useModelManager } from "../hooks/useModelManager";
import { cn } from "../lib/cn";
import type { CatalogEntry } from "../lib/models";
import { ChevronDownIcon } from "./icons/chevron-down-icon";
import { SettingsIcon } from "./icons/settings-icon";
import { XIcon } from "./icons/x-icon";

const FEATURED_IDS = ["gemma-4-e4b", "qwen-3.5-4b", "llama-3.3-8b"] as const;

const POPOVER_CLASSES = cn(
  "min-w-[320px] rounded-lg overflow-hidden outline-none",
  "bg-white dark:bg-grey-17 border border-grey-3 dark:border-grey-15",
  "shadow-[0px_16px_70px_0px_rgba(0,0,0,0.25)]",
  "data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95",
  "data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95",
);

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4.5 3 7.5 6 4.5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function isInFlight(status: DownloadStatus | undefined): boolean {
  if (!status) return false;
  return (
    status.phase === "queued" ||
    status.phase === "downloading" ||
    status.phase === "verifying"
  );
}

function percentFor(status: DownloadStatus | undefined): number {
  if (!status || status.totalBytes <= 0) return 0;
  return Math.min(
    100,
    Math.round((status.bytesDownloaded / status.totalBytes) * 100),
  );
}

function ModelMenuRow({
  entry,
  isActive,
  status,
  onSelect,
  onCancel,
  labels,
}: {
  entry: CatalogEntry;
  isActive: boolean;
  status: DownloadStatus | undefined;
  onSelect: () => void;
  onCancel: () => void;
  labels: {
    active: string;
    download: string;
    downloading: string;
    verifying: string;
    failed: string;
    cancel: string;
  };
}) {
  const inFlight = isInFlight(status);
  const failed = status?.phase === "failed";
  const percent = percentFor(status);

  return (
    <MenuItem
      onAction={onSelect}
      textValue={entry.label}
      className={cn(
        "flex flex-col gap-0.5 px-3 py-2 rounded-md cursor-pointer outline-none",
        "data-[focused]:bg-grey-2 dark:data-[focused]:bg-grey-15",
        isActive && "bg-grey-2 dark:bg-grey-15",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-sm",
            isActive
              ? "font-medium text-primary-5"
              : "text-grey-9 dark:text-grey-4",
          )}
        >
          {entry.label}
        </span>
        {inFlight && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-5/10 text-primary-5 uppercase tracking-wide">
            {status?.phase === "verifying" ? labels.verifying : `${percent}%`}
          </span>
        )}
        {failed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 uppercase tracking-wide">
            {labels.failed}
          </span>
        )}
        {!entry.installed && !inFlight && !failed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-grey-3 dark:bg-grey-14 text-grey-7 uppercase tracking-wide">
            {labels.download}
          </span>
        )}
        {isActive && !inFlight && (
          <span className="ml-auto text-[10px] text-primary-5 uppercase tracking-wide">
            {labels.active}
          </span>
        )}
        {inFlight && (
          <Button
            slot={null}
            aria-label={labels.cancel}
            onPress={onCancel}
            className={cn(
              "ml-auto p-1 rounded-md cursor-pointer transition-colors outline-none",
              "text-grey-7 dark:text-grey-6",
              "hover:bg-grey-3 dark:hover:bg-grey-14 hover:text-red-600 dark:hover:text-red-400",
              "data-focus-visible:ring-2 data-focus-visible:ring-primary-5",
            )}
          >
            <XIcon className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <span className="text-xs text-grey-6 dark:text-grey-7 line-clamp-1">
        {entry.description}
      </span>
      {inFlight && (
        <div className="mt-1 h-0.5 bg-grey-3 dark:bg-grey-15 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-5 transition-[width] duration-150"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </MenuItem>
  );
}

type ModelManager = ReturnType<typeof useModelManager>;

export function ModelPickerSelect({ manager }: { manager: ModelManager }) {
  const { t } = useTranslation();
  const {
    catalog,
    activeId,
    setActive,
    refresh,
    downloads,
    download,
    cancelDownload,
  } = manager;

  const activeEntry = catalog.find((entry) => entry.id === activeId);
  const inFlightEntry = catalog.find((entry) =>
    isInFlight(downloads[entry.id]),
  );
  const inFlightPercent = inFlightEntry
    ? percentFor(downloads[inFlightEntry.id])
    : 0;

  const triggerLabel = activeEntry?.label ?? t("modelPicker.placeholder");

  const onSelectEntry = async (entry: CatalogEntry) => {
    if (entry.installed) {
      try {
        await setActive(entry.id);
      } catch {
        // Activation failed - leave picker as-is.
      }
      return;
    }
    // Start download in-place; auto-activate only if download finished.
    try {
      const phase = await download(entry.id);
      if (phase === "done") {
        await setActive(entry.id);
      }
    } catch {
      // Unexpected error. UI state reflects failure via `downloads` map.
    }
  };

  const featured = FEATURED_IDS.map((id) =>
    catalog.find((entry) => entry.id === id),
  ).filter((entry): entry is CatalogEntry => Boolean(entry));
  const other = catalog.filter(
    (entry) =>
      !FEATURED_IDS.includes(entry.id as (typeof FEATURED_IDS)[number]),
  );

  const labels = {
    active: t("modelPicker.active"),
    download: t("modelPicker.notInstalled"),
    downloading: t("modelPicker.downloading"),
    verifying: t("modelPicker.verifying"),
    failed: t("modelPicker.failed"),
    cancel: t("modelPicker.cancel"),
  };

  return (
    <MenuTrigger
      onOpenChange={(isOpen) => {
        if (isOpen) refresh();
      }}
    >
      <Button
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors outline-none",
          "bg-grey-3 dark:bg-grey-15 text-grey-9 dark:text-grey-4",
          "hover:bg-grey-4 dark:hover:bg-grey-14",
          "data-focus-visible:ring-2 data-focus-visible:ring-primary-5",
        )}
      >
        <span className="truncate max-w-55">{triggerLabel}</span>
        {inFlightEntry && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-5/10 text-primary-5 uppercase tracking-wide">
            {inFlightPercent}%
          </span>
        )}
        <ChevronDownIcon className="shrink-0 opacity-70" />
      </Button>
      <Popover placement="bottom end" offset={6} className={POPOVER_CLASSES}>
        <Menu className="p-1 outline-none">
          {featured.map((entry) => (
            <ModelMenuRow
              key={entry.id}
              entry={entry}
              isActive={entry.id === activeId}
              status={downloads[entry.id]}
              onSelect={() => onSelectEntry(entry)}
              onCancel={() => cancelDownload()}
              labels={labels}
            />
          ))}

          {other.length > 0 && (
            <>
              <Separator className="my-1 h-px bg-grey-3 dark:bg-grey-15" />

              <SubmenuTrigger>
                <MenuItem
                  textValue={t("modelPicker.moreModels")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer outline-none",
                    "data-focused:bg-grey-2 dark:data-focused:bg-grey-15",
                  )}
                >
                  <SettingsIcon className="text-grey-7 dark:text-grey-6" />
                  <span className="text-sm text-grey-9 dark:text-grey-4 flex-1">
                    {t("modelPicker.moreModels")}
                  </span>
                  <ChevronRightIcon className="text-grey-6 dark:text-grey-7" />
                </MenuItem>
                <Popover
                  placement="end top"
                  offset={-4}
                  className={POPOVER_CLASSES}
                >
                  <Menu className="p-1 outline-none">
                    {other.map((entry) => (
                      <ModelMenuRow
                        key={entry.id}
                        entry={entry}
                        isActive={entry.id === activeId}
                        status={downloads[entry.id]}
                        onSelect={() => onSelectEntry(entry)}
                        onCancel={() => cancelDownload()}
                        labels={labels}
                      />
                    ))}
                  </Menu>
                </Popover>
              </SubmenuTrigger>
            </>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
