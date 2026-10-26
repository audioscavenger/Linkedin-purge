# GLOSSARY

## Purge Run
One full sequential pass over items of a single type (comments or reactions), from collection through deletion, checkpointing, and report writing. A purge run can be interrupted by timeout or Ctrl+C and resumed later from its checkpoint.

## Purge Item
A single deletable entity on the user's LinkedIn activity page: either a comment or a reaction. Each purge item is identified by a Key and carries its card metadata: state, author, postHref, dateTime.

## Report Entry
A purge item as recorded at the moment it was acted on: the item's fields plus a timestamp of when the run performed the action.

## Key
A stable, unique identifier for a purge item, used for deduplication across runs. Comment keys are `replaceableComment_<id>` element IDs. Reaction keys are `reaction:<index>`, derived from the reaction button's stable position in the activity list.

## Author
The author of the post. Never the account whose activity is being purged.

## Checkpoint
The persisted set of keys already processed across purge runs. Stored as JSON in `data/checkpoint-<type>.json`. Ensures items are not re-processed on resume.

## ConfirmAdapter
The seam that handles user confirmation prompts (e.g., "Delete N items? Type YES to proceed"). Abstracted so tests can auto-confirm without a TTY.
