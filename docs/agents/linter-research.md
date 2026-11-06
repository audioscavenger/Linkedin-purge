# Linter Research: ESLint + Prettier vs Biome

## Summary

For this repository's specific needs (comment-run enforcement, pre-commit integration, performance), **ESLint + Prettier is currently the better choice**, though Biome offers significant advantages in performance and configuration simplicity. The key deciding factor is that Biome does not have a built-in rule for enforcing "no more than 2 consecutive `//` comment lines" (the house rule), while ESLint supports custom rules via plugins.

## Primary Source Findings

### 1. ESLint + Prettier Capabilities

- **Custom Rules**: ESLint supports custom rules via JavaScript plugins (e.g., `eslint-plugin-eslint-comments`), which can implement the exact "no 3+ consecutive `//` lines" house rule. The existing `scripts/check-comments.js` script demonstrates this is already implemented in the repo.
- **Performance**: ESLint is slower than Biome (~15x slower), but for a small CLI tool like this, performance difference is negligible.
- **Pre-commit Integration**: ESLint + Prettier work with established pre-commit tools:
  - `lint-staged` + Husky (used in repo via `npm run check`/`fix:comments`)
  - `git-format-staged`
  - `pre-commit` framework
  - Shell scripts (as shown in ESLint docs)
- **Configuration Burden**: Requires multiple files:
  - `eslint.config.js` (or similar)
  - `.prettierrc` (or similar)
  - Pre-commit hook configuration (currently `scripts/check-commands.js`)

### 2. Biome Capabilities

- **Performance**: Biome is significantly faster:
  - Formats ~25x faster than Prettier
  - Lints ~15x faster than ESLint (per official benchmark)
- **Single Config File**: Biome uses `biome.json` instead of multiple config files.
- **Built-in Suppression**: Biome supports suppression comments (`biome-ignore`), range suppressions, and top-level suppressions that could work around the missing comment-run rule.
- **No Native Comment-Run Rule**: Biome does not have a built-in rule for "no more than 2 consecutive `//` lines" (the house rule). The only comment-related rules are:
  - `noCommentText` (prevents comments from being inserted as text nodes in JSX)
  - `useSingleJsDocAsterisk` (JSDoc formatting)
  - No rule exists for enforcing consecutive comment line limits.
- **Migration Path**: Biome offers `biome migrate eslint --write` and `biome migrate prettier --write` to convert existing configs.
- **Pre-commit Integration**: Biome works with:
  - Lefthook (documented recipe)
  - Husky + lint-staged
  - git-format-staged
  - pre-commit framework
  - Shell scripts

### 3. Critical Comparison Points

| Factor | ESLint + Prettier | Biome |
|--------|-------------------|-------|
| **Comment-Run Enforcement** | ✅ Supported via custom rule/plugin (existing `check-comments.js` works) | ❌ No native rule; would require suppression workaround |
| **Pre-commit Integration** | ✅ Mature ecosystem (lint-staged, husky, git-format-staged, pre-commit, shell scripts) | ✅ Well-documented support for multiple tools |
| **Configuration Burden** | ❌ Higher (multiple config files + hook setup) | ✅ Lower (single `biome.json`) |
| **Performance** | ❌ Slower (baseline) | ✅ 15-25x faster |
| **Custom Rule Flexibility** | ✅ JavaScript plugins allow any custom logic | ❌ No custom JS rules (Biome plugins are GritQL pattern matching) |
| **Tooling Maturity** | ✅ Mature ecosystem | ⚠️ Newer tool (v1.x), but rapidly evolving |
| **Migration Effort** | N/A (existing setup) | ⚠️ Requires config conversion + potential logic rewrite |

## Recommendation

**Keep ESLint + Prettier** for now because:

1. The existing `scripts/check-comments.js` and `scripts/fix-comments.js` already implement the required comment-run enforcement via custom ESLint rules
2. Migrating to Biome would require:
   - Converting ESLint config to `biome.json`
   - Potentially rewriting the comment-run enforcement logic (since Biome lacks a native rule)
   - Updating pre-commit hooks to use Biome instead of current scripts
3. Biome's performance advantages are significant but not critical for this small CLI tool
4. The existing ESLint setup is already integrated with the repo's house rules and workflow

**If the team wants to simplify configuration and gain faster performance**, consider Biome migration later, but plan for rewriting the comment enforcement logic (possibly using Biome's suppression comments as a workaround).

## References

- ESLint documentation: [Configure Rules](https://eslint.org/docs/latest/use/configure/rules), [Custom Rules Tutorial](https://eslint.org/docs/latest/extend/custom-rules)
- Biome documentation: [Linter Rules](https://biomejs.dev/linter/javascript/rules/), [Comparison with other tools](https://biomejs.dev/introduction/comparison-with-other-tools)
- Prettier documentation: [Pre-commit Hook](https://prettier.io/docs/en/precommit)
- Biome recipes: [Git Hooks](https://biomejs.dev/recipes/git-hooks)
- House rule reference: [AGENTS.md](E:/Gitea/Linkedin-purge/AGENTS.md) - "No more than 2 consecutive `//` comment lines may carry meaning"

*Last updated: 2025-11-05*