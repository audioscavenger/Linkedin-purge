# 04: In-page comment text and post excerpt

**What to build:** Each item carries the text a person needs to recognise it: `text` is the comment body for a comment card and null for a reaction, and `postExcerpt` is the first 140 characters of the post body on any card, null when absent. Both come from the same card walk that already reads author and date, so no extra page interaction happens.

**Blocked by:** 03

**Status:** waiting

**Touches:** the injected in-page helpers only, plus the live page check's assertions if they are cheap to extend.

**Do not touch:** the scan command, the envelope builder, the purge module.

- [ ] Comment items carry a non-empty `text`, truncated to 280 characters with an ellipsis when longer
- [ ] Reaction items carry no `text` value (null)
- [ ] Every item carries `postExcerpt`, truncated to 140 characters, null when the card has no post body
- [ ] Whitespace is collapsed and markup is stripped so the value is plain readable text
- [ ] `npm run check` passes and the live check still passes
