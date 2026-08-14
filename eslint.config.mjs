import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig,
  {
    rules: {
      // Allow intentionally-unused args/vars prefixed with _ (e.g. stubbed
      // interface implementations ahead of the phase that fills them in).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Extends (not replaces) eslint-config-next's default ignores, plus local
  // Supabase CLI artifacts that shouldn't be linted.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/.temp/**",
    "supabase/.branches/**",
  ]),
]);

export default eslintConfig;
