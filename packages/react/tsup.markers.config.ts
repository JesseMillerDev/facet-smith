import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/markers.ts"],
  format: ["esm", "cjs"],
  dts: true,
  noExternal: ["@facet-smith/core"],
});
