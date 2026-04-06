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
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
});
