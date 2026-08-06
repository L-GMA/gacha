import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const ROOT_PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
  version: string;
};

const CSP_WEB = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' wss://voice.gachandra.ru",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const CSP_DESKTOP = [
  "default-src 'self' file: data: blob:",
  "script-src 'self' file:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src https://gachandra.ru wss://voice.gachandra.ru",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

function cspPlugin(mode: string): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      const content = mode === "desktop" ? CSP_DESKTOP : CSP_WEB;
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content },
            injectTo: "head-prepend",
          },
        ],
      };
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), cspPlugin(mode)],
  define: {
    __APP_VERSION__: JSON.stringify(ROOT_PKG.version),
  },
  base: mode === "desktop" ? "./" : "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}));
