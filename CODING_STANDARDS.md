# Coding Standards

This repo uses a **small-surface / deep-implementation** module philosophy (from `/codebase-design`). Standards enforce depth and testability, not formatting.

> **Where to find the modules**: see [`NAVIGATION.md`](NAVIGATION.md) for the current module layout and entry points.

## Module Depth Target

- **Target**: ~100 lines per module (exceed only when the module genuinely owns a single concept end-to-end).
- **Signal**: When a module crosses ~150 lines, ask: can it be split without losing the depth property, or does it truly concentrate complexity?

## Seams & Adapter Discipline

- **One adapter = hypothetical seam.** Two adapters = real seam. Do not introduce a new adapter unless behaviour actually varies across it.
- **The interface is the test surface.** If a module's interface is complex, tests will be complex. Prefer deep implementation + small interface.
- **Constructor injection** for all adapters. Prefer `new Adapter({ ... })` over global lookups.

## File Organization

- Each public module gets its own file in `src/`.
- Helper classes that are only used inside one module stay inside that file (no splitting unless a second implementation appears).
- Exported classes / functions: keep the public surface small.

## Testing

- All new code must have unit tests in `tests/`.
- Tests may use in-memory adapters (no browser/FS/TTY required) to stay fast and deterministic.
- Before merging, `npm run test` must pass; `npm run check` passes (basic syntax/type check).

## When to Exceed the 100-Line Target

A module may legitimately exceed 100 lines when:
- It owns a complete lifecycle end-to-end (e.g., `PurgeRunner` with its four adapters).
- The complexity truly concentrates — deleting it would require rewriting dependent code.
- No reasonable split preserves the depth property.
- **Browser-injected script**: `src/linkedin-dom.js` is injected into the page via `page.addInitScript()`, which requires a single self-contained file — ES module imports are unavailable in that context. Do not split it into submodules without adding a build/bundle step first.

**Disagreements** with this standard are recorded as ADRs in `docs/adr/`.

## Overrides from Reviewer Agent

The code-review agent enforces: **no hard violations** of the above. Judgement calls (file size borderline, adapter placement) are discussed, not auto-flagged.