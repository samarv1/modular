import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";
import { integrationTests } from "./vitest.test-groups";

const requiredEnvironment = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_SERVICE_ROLE_KEY",
  "TEST_OWNER_ID",
] as const;

if (process.env.RUN_SUPABASE_INTEGRATION_TESTS !== "true") {
  throw new Error(
    "Supabase integration tests are disabled. Set RUN_SUPABASE_INTEGRATION_TESTS=true and provide credentials for a dedicated test project.",
  );
}

const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name],
);
if (missingEnvironment.length > 0) {
  throw new Error(
    `Supabase integration tests require dedicated test-project credentials. Missing: ${missingEnvironment.join(", ")}`,
  );
}

process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [...integrationTests],
  },
});
