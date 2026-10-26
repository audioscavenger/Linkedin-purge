# Standards Review — LinkedIn Purge Runner (main → HEAD)

## Summary

**Total findings: 4**

### Standards Compliance (AGENTS.md)
- **File size**: `src/purge.js` (226 lines) and `src/cli.js` (247 lines) exceed the ~100‑line guideline. Both are coherent modules but are borderline. `tests/purge.test.js` (87 lines) is within limits.
- **Edit vs. Write**: The diff uses `write` consistently (no `edit` tool violations). This complies with AGENTS.md.

### Fowler Ch.3 Smells

1. **Duplicated Code** (high severity)
   - `src/cli.js` contains two nearly identical entry points: `runPurge()` (lines 83‑117) and `runScan()` (lines 130‑162). Both repeat the CDP/launch‑browser branching, page creation, injection, login check, and cleanup pattern. This violates DRY and makes future changes error‑prone.

2. **Duplicated Code** (medium severity)
   - `cli.js` `ask()` (lines 38‑46) and `purge.js` `ConfirmAdapter.confirm()` (lines 213‑224) both create a readline interface for user prompts. The same boilerplate is duplicated across modules.

3. **Speculative Generality / Dead Code** (medium severity)
   - `purge.js` `PageAdapter.clickShowMoreIfPresent()` (lines 132‑134) is defined but never invoked in the purge loop. It is unused and should be removed.

4. **Feature Envy** (low severity)
   - `cli.js` `runPurge()` constructs all four adapters (Page, Checkpoint, Reporter, Confirm) and wires them. This orchestration logic belongs in `PurgeRunner`; the current split creates a thin delegation layer that obscures the core lifecycle.

5. **Message Chains** (low severity)
   - `purge.js` accesses `this.checkpointAdapter.processed.size` — a chain of adapter → internal Set. Acceptable but could be flattened.

### Critical Defect (not a standards violation but blocks correctness)
- `src/cli.js` uses `fileURLToPath` (line 11) but the import was removed in the diff. The file will throw a `ReferenceError` at runtime. This is a pre‑existing bug that the change did not fix.

## Recommendations

1. **Refactor `cli.js`** – Consolidate `runPurge` and `runScan` into a single `run` function that accepts a type argument, eliminating duplicated setup code.
2. **Remove dead code** – Delete `PageAdapter.clickShowMoreIfPresent()`.
3. **Move adapter wiring to `PurgeRunner`** – Let `runPurge` delegate adapter construction to the runner, reducing feature envy.
4. **Split large files** – `src/purge.js` (226 lines) and `src/cli.js` (247 lines) are near the 100‑line threshold. Consider extracting the adapter implementations into separate files or splitting the CLI into smaller modules.
5. **Fix the runtime bug** – Re‑add `import { fileURLToPath } from "node:url";` (or switch to a stable alternative) to restore `fileURLToPath` usage.

## Worst Issue (Standards Axis)

**Duplicated Code** in `src/cli.js` between `runPurge()` and `runScan()` — both functions repeat the CDP/launch‑browser branching, page creation, injection, login check, and cleanup pattern. This violates the DRY principle and increases maintenance risk.
