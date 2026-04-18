import { Link } from "react-router";
import { cn } from "../lib/cn";
import { localePath } from "../lib/localePath";
import { OfflineIcon } from "./offline-icon";

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (window as { isTauri?: boolean }).isTauri === true;
}

export function HomeLogoLink({ className }: { className?: string }) {
  const iconClassName = "w-9 bg-black dark:bg-white";

  if (isTauriRuntime()) {
    // In the desktop app the homepage doesn't exist - the logo is decorative.
    return (
      <div className={cn("inline-flex", className)}>
        <OfflineIcon className={iconClassName} />
      </div>
    );
  }

  return (
    <Link to={localePath("/")} className={cn("inline-flex", className)}>
      <OfflineIcon className={iconClassName} />
    </Link>
  );
}
