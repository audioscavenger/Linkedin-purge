# Purge input is the scan envelope

The `--input` loader introduced in v0.3.3 accepted four speculative file shapes (bare key arrays, lone-key objects, arrays of item strings) on top of the scan JSON envelope, but the tool only ever produces that one shape and the speculative ones had no tests or stated purpose, so a malformed or hand-rolled file could become a silent, unexplained run. Purge input is now exactly the scan JSON envelope: item keys from `items[].key`, falling back to `keys[]`; anything else (and malformed JSON) is rejected with an error that names the expected shape.

The trade-off is deliberate: a narrow, loud contract over speculative leniency. It is hard to reverse once shipped, because v0.3.4 users can already build filtered envelope files on the premise that only the envelope is accepted. It is surprising without this context, because the parser looks merely strict, when the strictness is a decision.

Spec: `.scratch/purge-v034-standards-fixes/issue.md` (v0.3.4 standards fixes; ticket 05: `.scratch/purge-v034-standards-fixes/issues/05-input-scan-envelope-adr0001.md`).
