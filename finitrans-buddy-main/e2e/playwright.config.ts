import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout sur l'application construite (vite preview) branchée
 * à l'API de TEST (base locale). Prérequis :
 *   backend : npm run test:reset && node --env-file=.env.test --import tsx src/index.ts
 *   frontend: npm run build && VITE_PROXY_TARGET=http://127.0.0.1:3101 npx vite preview --port 4173
 */
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      // Navigateur déjà installé (évite un téléchargement) : E2E_CHROMIUM=/chemin/chrome.exe
      ...(process.env.E2E_CHROMIUM ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM } } : {}),
    },
  }],
});
