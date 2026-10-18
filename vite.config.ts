import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const coopCoepHeaders = (): Plugin => ({
  name: "coop-coep",
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
});

const serviceWorkerManifest = (): Plugin => ({
  name: "sw-manifest",
  generateBundle(_, bundle) {
    const assets = Object.keys(bundle).map((f) => `/${f}`);
    const sw = bundle["sw.js"];
    if (sw && "code" in sw) {
      sw.code = sw.code.replace(
        "self.__ASSETS__",
        JSON.stringify([...assets, "/"]),
      );
    }
  },
});

export default defineConfig({
  plugins: [
    coopCoepHeaders(),
    tailwindcss(),
    reactRouter(),
    serviceWorkerManifest(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: [
      // remark-parse depends on decode-named-character-reference, whose
      // "browser" export uses `document`. Markdown parsing runs in a Web
      // Worker where `document` does not exist, so the whole parser worker
      // crashed on load. Force the DOM-free build, which behaves the same.
      {
        find: /^decode-named-character-reference$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/decode-named-character-reference/index.js",
            import.meta.url,
          ),
        ),
      },
    ],
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    // Pre-bundle deps that Vite otherwise discovers late (route modules and
    // the parser worker), which triggers full page reloads in dev and made
    // the first e2e tests on a cold cache flaky.
    include: [
      "i18next",
      "react-i18next",
      "@tauri-apps/api/core",
      "@tauri-apps/plugin-process",
      "@tauri-apps/plugin-updater",
      "clsx",
      "react-aria-components",
      "tailwind-merge",
      "@tanstack/react-hotkeys",
      "@tiptap/extension-placeholder",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/suggestion",
      "fast-xml-parser",
      "fflate",
      "remark-frontmatter",
      "remark-gfm",
      "remark-parse",
      "unified",
      "unist-util-visit",
    ],
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
});
