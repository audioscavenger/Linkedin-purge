/*
  ESLint flat config: JS recommended rules plus Prettier compatibility.
  Lints only project source and tests: excludes data/, .profile-chromium/,
  node_modules/, scripts/ harness fixtures and anything that is not source code.
*/
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

const EXT = "{js,mjs,cjs}";
const SOURCE_FILES = [
  `src/**/*.${EXT}`,
  `tests/**/*.${EXT}`,
  `scripts/*.${EXT}`,
  `*.${EXT}`,
];

export default [
  {
    files: SOURCE_FILES,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  js.configs.recommended,
  prettier,
];
