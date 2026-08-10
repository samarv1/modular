import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";

// Tests that hit the live Supabase project (compile-race, etc.) need the
// same vars `next dev`/`next build` pick up automatically from .env* files.
// Vitest doesn't do that on its own, so load them here the same way Vite's
// own CLI would.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }
  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    test: {
      environment: "node",
    },
  };
});
