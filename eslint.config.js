// ESLint flat config: JS recommended rules plus Prettier compatibility.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
  },
  js.configs.recommended,
  prettier,
];
