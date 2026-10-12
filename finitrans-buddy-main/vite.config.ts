import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Cible de l'API en développement / prévisualisation (tests E2E : VITE_PROXY_TARGET=http://127.0.0.1:3101)
const API_TARGET = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:3001";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/uploads": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/ws": {
        target: API_TARGET.replace(/^http/, "ws"),
        ws: true,
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
