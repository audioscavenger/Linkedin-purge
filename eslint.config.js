/*
  ESLint flat config: adapted from Linkedin-purge/eslint.config.js for
  OllaSieve's mixed codebase.

  Backend stays CommonJS (require) in backend/tests/tools/root .js files;
  frontend React will be ESM (.mjs/.jsx/.tsx). The base below lints like
  Linkedin-purge (recommended rules, Node + browser globals, Prettier
  compatible), but then splits sourceType so each side parses correctly.

  Flat config syntax is CommonJS (module.exports) because OllaSieve's
  package.json has no "type": "module". ESLint 9+ loads eslint.config.js
  in the package's module system, so ESM import syntax would not parse.
*/
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

/*
  Custom ESLint plugin: disallow en/em dashes in comments. Code files get their
  comments fixed by scripts/fix-slop.mjs; this rule keeps the linter in sync
  so a stray dash is caught before commit.
*/
const dashPlugin = {
  rules: {
    "no-unicode-dash": {
      meta: {
        type: "problem",
        docs: {
          description:
            "disallow en/em dashes in comments; use a hyphen '-' instead",
        },
        fixable: "whitespace",
        schema: [],
      },
      create(context) {
        // ESLint 10 removed context.getSourceCode(); the rule gets it from
        // the context's sourceCode property instead.
        const sourceCode = context.sourceCode;
        return {
          Program() {
            for (const comment of sourceCode.getAllComments()) {
              if (/[\u2013\u2014]/.test(comment.value)) {
                context.report({
                  comment,
                  message: "Use hyphen '-' instead of en/em dash in comments",
                  fix(fixer) {
                    const replacement = comment.value.replace(
                      /[\u2013\u2014]/g,
                      "-"
                    );
                    return fixer.replaceText(
                      comment,
                      comment.type === "Block"
                        ? `/*${replacement}*/`
                        : `//${replacement}`
                    );
                  },
                });
              }
            }
          },
        };
      },
    },
  },
};

const EXT = "{js,mjs,cjs,jsx,tsx,ts}";
const SOURCE_FILES = [
  `backend/**/*.${EXT}`,
  `client/**/*.${EXT}`,
  `frontend/**/*.${EXT}`,
  `web/**/*.${EXT}`,
  `app/**/*.${EXT}`,
  `tests/**/*.${EXT}`,
  `tools/**/*.${EXT}`,
  `scripts/*.${EXT}`,
  `*.${EXT}`,
];

export default [
  {
    ignores: [
      "frontend/dist/**",
      "frontend/node_modules/**",
      "node_modules/**",
    ],
  },
  // Backend: CommonJS first. Everything below that is not frontend ESM
  // parses as CommonJS so require/module.exports work without conversion.
  {
    files: SOURCE_FILES,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Frontend: React ESM (.mjs/.jsx/.tsx/.ts) parses as modules.
  {
    files: [
      `client/**/*.${EXT}`,
      `frontend/**/*.${EXT}`,
      `web/**/*.${EXT}`,
      `app/**/*.${EXT}`,
      "**/*.mjs",
      "**/*.jsx",
      "**/*.tsx",
      "**/*.ts",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Tests: ESM (they use import/export). Placed after the CommonJS base so
  // it overrides sourceType for tests/**/*.js.
  {
    files: [`tests/**/*.${EXT}`],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Callers/tests that are ESM-style helper files still under backend/tests
  // (future React helpers, tool scripts) also parse as modules.
  {
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  js.configs.recommended,
  prettier,
  // OllaSieve's existing .eslintrc.json allowed `_`-prefixed unused vars and
  // unused catch params (ESLint 8 default caughtErrors:"none"). Carry that
  // intent into the flat config so the import does not break prior code.
  {
    files: SOURCE_FILES,
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  // Dash plugin applies to all source files: flag en/em dashes in comments.
  {
    files: SOURCE_FILES,
    plugins: {
      dash: dashPlugin,
    },
    rules: {
      // Warn, never error: this is a house-style guard rail, not a correctness
      // gate. `eslint --fix` and scripts/fix-slop.mjs both repair it, and a
      // warning never fails lint or a commit.
      "dash/no-unicode-dash": "warn",
    },
  },
];
