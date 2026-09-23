import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeConfig } from "vite";

import webConfig from "../apps/web/vite.config.ts";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/web");

// Dev HMR pulls Vite 8's React refresh plugin into the Vite 7 server and fails
// the page. E2E does not need HMR; disabling it serves the real UI.
export default mergeConfig(webConfig, {
  root: webRoot,
  server: {
    hmr: false,
  },
});
