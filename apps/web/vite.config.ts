import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/workflows": {
        target: "http://localhost:3000",
        bypass(req) {
          const header = req.headers.accept;
          const accept = Array.isArray(header) ? header.join(",") : (header ?? "");
          if (accept.includes("text/html")) {
            return "/index.html";
          }
          return undefined;
        },
      },
    },
  },
});
