# Domain Docs

Single-context layout: one `GLOSSARY.md` and one `docs/adr/` at the repo root.

## Consumer rules

- **Read `GLOSSARY.md` first** when touching any domain concept. Use the canonical terms in code and docs.
- **Read `docs/adr/`** before re-litigating a decision. If a candidate contradicts an ADR, surface it only when the friction is real.
- **Write to `GLOSSARY.md`** when a new term is resolved. Keep it implementation-free: no file paths, no code, no schemas. Only the concept.
- **Write an ADR** only when all three hold: hard to reverse, surprising without context, result of a real trade-off.