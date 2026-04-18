export type DownloadTarget =
  | "macos-arm64"
  | "macos-x64"
  | "windows-x64"
  | "linux-x64";

const RELEASE_BASE =
  "https://github.com/mmurakaru/offline.cat/releases/latest/download";

const TARGETS: Record<DownloadTarget, { label: string; asset: string }> = {
  "macos-arm64": {
    label: "Download for Mac (Apple Silicon)",
    asset: "offline.cat_aarch64.dmg",
  },
  "macos-x64": {
    label: "Download for Mac (Intel)",
    asset: "offline.cat_x64.dmg",
  },
  "windows-x64": {
    label: "Download for Windows",
    asset: "offline.cat_x64_en-US.msi",
  },
  "linux-x64": {
    label: "Download for Linux",
    asset: "offline.cat_amd64.AppImage",
  },
};

export function downloadUrlFor(target: DownloadTarget): string {
  return `${RELEASE_BASE}/${TARGETS[target].asset}`;
}

export function labelFor(target: DownloadTarget): string {
  return TARGETS[target].label;
}

export function detectTarget(): DownloadTarget {
  if (typeof navigator === "undefined") return "macos-arm64";

  const uaData = (
    navigator as {
      userAgentData?: { platform?: string; mobile?: boolean };
    }
  ).userAgentData;
  const platform = (uaData?.platform ?? navigator.platform ?? "").toLowerCase();
  const ua = navigator.userAgent.toLowerCase();

  if (platform.includes("win") || ua.includes("windows")) return "windows-x64";
  if (platform.includes("linux") || ua.includes("linux")) return "linux-x64";

  if (platform.includes("mac") || ua.includes("mac os")) {
    const isArm = ua.includes("arm") || platform.includes("arm");
    if (isArm) return "macos-arm64";
    const hwConcurrency =
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 0;
    if (hwConcurrency >= 8) return "macos-arm64";
    return "macos-x64";
  }

  return "macos-arm64";
}
