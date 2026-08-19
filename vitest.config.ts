import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@facet-smith/core": source("./packages/core/src/index.ts"),
      "@facet-smith/analytics": source("./packages/analytics/src/index.ts"),
      "@facet-smith/react": source("./packages/react/src/index.ts"),
      "@facet-smith/inspector": source("./packages/inspector/src/index.tsx"),
      "@facet-smith/next/server": source("./packages/next/src/server.tsx"),
      "@facet-smith/next/client": source("./packages/next/src/client.tsx"),
      "@facet-smith/next": source("./packages/next/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
