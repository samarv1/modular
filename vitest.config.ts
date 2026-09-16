import { fileURLToPath } from "url";
import { configDefaults, defineConfig } from "vitest/config";
import { integrationTests } from "./vitest.test-groups";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, ...integrationTests],
  },
});
