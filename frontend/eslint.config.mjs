import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

/**
 * ESLint flat configuration.
 *
 * ESLint 9 reads `eslint.config.*` and ignores `.eslintrc.json`. Running the
 * legacy file instead requires `ESLINT_USE_FLAT_CONFIG=false`, which is what
 * `next lint` sets — and on Windows that path hangs without ever producing a
 * result, so CI would sit at the job timeout rather than failing. Declaring the
 * config in the format the installed ESLint actually wants removes the
 * compatibility shim entirely; `npm run lint` now invokes `eslint` directly.
 *
 * `FlatCompat` is still needed for `eslint-config-next`, which ships in the
 * eslintrc format.
 */
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  {
    // Playwright specs run in Node against a live server and legitimately use
    // patterns the app rules forbid.
    files: ["e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    // Tailwind plugins are CommonJS; `require` is the documented way to load
    // them and there is no ESM entry point to import instead.
    files: ["tailwind.config.ts", "postcss.config.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default config;
