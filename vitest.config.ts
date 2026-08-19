import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@facetsmith/core": source("./packages/core/src/index.ts"),
      "@facetsmith/analytics": source("./packages/analytics/src/index.ts"),
      "@facetsmith/react": source("./packages/react/src/index.ts"),
      "@facetsmith/inspector": source("./packages/inspector/src/index.tsx"),
      "@facetsmith/next/server": source("./packages/next/src/server.tsx"),
      "@facetsmith/next/client": source("./packages/next/src/client.tsx"),
      "@facetsmith/next": source("./packages/next/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
