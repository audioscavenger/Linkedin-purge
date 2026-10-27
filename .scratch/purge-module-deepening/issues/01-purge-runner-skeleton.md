# 01: Purge Runner module skeleton + adapter interfaces

**What to build:** A new purge module exists with a `PurgeRunner` class exposing a small public `run()` method. All four adapter interfaces (`PageAdapter`, `CheckpointAdapter`, `ReporterAdapter`, `ConfirmAdapter`) are defined so other modules know what to satisfy. Nothing is implemented yet — just the shape.

**Blocked by:** None (can start immediately).

**Status:** done (shipped in v0.3.0)

- [ ] `PurgeRunner` class exists with a single public `run(options)` method
- [ ] `PageAdapter` interface declared (collect keys, delete first eligible, click show more, wait)
- [ ] `CheckpointAdapter` interface declared (load, save, has, add, size, reset)
- [ ] `ReporterAdapter` interface declared (open, write item, close)
- [ ] `ConfirmAdapter` interface declared (confirm message returns boolean)
- [ ] Domain vocabulary used consistently: Purge Run, Purge Item, Key, Checkpoint
