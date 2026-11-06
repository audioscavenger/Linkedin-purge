// ESLint flat config: JS recommended rules plus Prettier compatibility.
// Lints only project source and tests: excludes data/, .profile-chromium/,
// node_modules/, scripts/ harness fixtures and anything that is not source code.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

const SOURCE_FILES = ["src/**/*.js", "tests/**/*.js", "scripts/*.js", "*.js"];

export default [
  {
    files: SOURCE_FILES,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
  },
  js.configs.recommended,
  prettier,
];
