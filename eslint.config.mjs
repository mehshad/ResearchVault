import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import securityPlugin from "eslint-plugin-security";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "migrations/**",
      "tests/performance/**",
      "**/*.js",           // JS files in project root (vite config etc. are .ts)
      "client/src/components/ui/**",  // shadcn generated components
    ],
  },

  // ── Base JS rules ───────────────────────────────────────────────────────────
  js.configs.recommended,

  // ── Server TypeScript ───────────────────────────────────────────────────────
  {
    files: ["server/**/*.ts", "shared/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      security: securityPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...securityPlugin.configs.recommended.rules,

      // Allow @ts-nocheck in legacy files (we document these)
      "@typescript-eslint/ban-ts-comment": "warn",

      // Security — tighten key rules for a Node/Express backend
      "security/detect-object-injection":          "warn",
      "security/detect-non-literal-fs-filename":   "warn",
      "security/detect-non-literal-regexp":        "warn",
      "security/detect-possible-timing-attacks":   "error",
      "security/detect-eval-with-expression":      "error",
      "security/detect-child-process":             "warn",

      // Prevent accidental console.log left in production code
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },

  // ── Client TypeScript / React ────────────────────────────────────────────────
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      "react/react-in-jsx-scope": "off",   // not needed with React 17+
      "react/prop-types": "off",           // TypeScript handles this
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },

  // ── Test files — relax rules ────────────────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
