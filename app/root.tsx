import { useTranslation } from "react-i18next";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import i18n from "./lib/i18n";
import { ALTERNATE_LOCALES, DEFAULT_LOCALE } from "./lib/locales";
import "./lib/register-paint-worklets";
import { ErrorIcon } from "./components/error-icon";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

function getLocaleFromPath(pathname: string) {
  const firstSegment = pathname.split("/")[1];
  return ALTERNATE_LOCALES.has(firstSegment) ? firstSegment : DEFAULT_LOCALE;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const lang = getLocaleFromPath(location.pathname);
  i18n.language = lang;

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const firstSegment = location.pathname.split("/")[1];
  const langPrefix =
    firstSegment && ALTERNATE_LOCALES.has(firstSegment) ? firstSegment : null;
  const homePath = langPrefix ? `/${langPrefix}` : "/";
  let code = "Error";
  let message = t("error.unexpected");
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    code = String(error.status);
    message =
      error.status === 404 ? t("error.notFound") : error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
    if (import.meta.env.DEV) {
      stack = error.stack;
    }
  }

  return (
    <main className="h-screen flex flex-col items-center justify-center bg-grey-1 dark:bg-ui-app-background">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <ErrorIcon className="w-8 h-8 text-grey-6" />
        <h1 className="text-2xl font-semibold text-grey-9 dark:text-grey-4">
          {code}
        </h1>
        <p className="text-sm text-grey-7 dark:text-grey-6">{message}</p>
        {stack && (
          <pre className="w-full mt-4 p-3 rounded-lg bg-grey-2 dark:bg-grey-15 text-xs text-grey-8 dark:text-grey-6 overflow-x-auto text-left">
            <code>{stack}</code>
          </pre>
        )}
        <Link
          to={homePath}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-primary-5 text-white hover:bg-primary-6 transition-colors"
        >
          {t("error.backHome")}
        </Link>
      </div>
    </main>
  );
}
