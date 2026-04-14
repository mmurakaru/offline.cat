import { type RouteConfig, layout, prefix } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";
import { DEFAULT_LOCALE, LOCALES } from "./lib/locales";

// Discover routes from filesystem, then duplicate them under each alternate
// locale prefix (e.g. /ca). The lang-layout wraps all routes with hreflang tags.
const baseRoutes = await flatRoutes({
  ignoredRouteFiles: ["**/lang-layout.*"],
});
const alternatePrefixes = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export default [
  layout("routes/lang-layout.tsx", [
    ...baseRoutes,
    ...alternatePrefixes.flatMap((locale) =>
      prefix(
        locale,
        baseRoutes.map((route) => ({ ...route, id: `${locale}-${route.id}` })),
      ),
    ),
  ]),
] satisfies RouteConfig;
