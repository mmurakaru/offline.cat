import { Link } from "react-router";
import { cn } from "../lib/cn";
import { localePath } from "../lib/localePath";
import { isTauriRuntime } from "../lib/runtime";
import { OfflineIcon } from "./icons/offline-icon";

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
