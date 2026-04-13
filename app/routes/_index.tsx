import { Link } from "react-router";
import { OfflineIcon } from "../components/offline-icon";

export function meta() {
  return [
    { title: "offline.cat" },
    {
      name: "description",
      content:
        "Translate documents offline. No servers. No accounts. No exceptions.",
    },
  ];
}

export default function Home() {
  return (
    <main className="relative flex flex-col items-center p-4">
      <div className="absolute top-4 left-4">
        <OfflineIcon className="w-9 bg-black dark:bg-white" />
      </div>

      <div className="flex flex-col items-center pt-[22vh]">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-center tracking-tight max-w-3xl">
          <span className="ai-highlight">AI translation</span> that stays on
          your device
        </h1>

        <p className="mt-6 text-lg text-grey-7 text-center max-w-md">
          Privacy-first document translation powered by on-device AI. Works
          offline and completely free.
        </p>

        <Link
          to="/create"
          className="mt-8 px-5 py-2.5 bg-grey-25 text-grey-1 rounded-lg hover:bg-grey-23 dark:bg-grey-1 dark:text-grey-25 dark:hover:bg-grey-3 transition-colors"
        >
          Start translating
        </Link>
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
          <span>offline.cat</span>
          <span>&copy; 2027 All rights reserved</span>
        </div>
      </footer>
    </main>
  );
}
