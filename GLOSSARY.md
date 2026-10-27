# GLOSSARY

## Purge Run
One full sequential pass over items of a single type (comments or reactions), from collection through deletion, checkpointing, and report writing. A purge run can be interrupted by timeout or Ctrl+C and resumed later from its checkpoint.

## Purge Item
A single deletable entity on the user's LinkedIn activity page: either a comment or a reaction. Each purge item is identified by a Key and carries its card metadata: state, author, postHref, dateTime.

## Report Entry
A purge item as recorded at the moment it was acted on: the item's fields plus a timestamp of when the run performed the action.

## Key
A session-scoped handle for a purge item, used to deduplicate within one page session. Comment keys are `replaceableComment_<id>` element IDs. Reaction keys are `reaction:<index>`, the button's position among the reaction buttons. Positions drift between sessions and disappear on reload, so a Key is not an identity: see Card Identity.

## Card Identity
The stable identity of a Purge Item's card, taken from the post the card belongs to. It survives page reloads and is not disturbed by other activity being added or removed above it. A Key can drift; a Card Identity cannot.

## Author
The author of the post. Never the account whose activity is being purged.

## Checkpoint
The persisted set of keys already processed across purge runs. Stored as JSON in `data/checkpoint-<type>.json`. Ensures items are not re-processed on resume.

## ConfirmAdapter
The seam that handles user confirmation prompts (e.g., "Delete N items? Type YES to proceed"). Abstracted so tests can auto-confirm without a TTY.

## Activity List
The scrollable area of the user's recent-activity page that holds the purged or scanned items of one type: comments on one tab, reactions on the other. Only the first screenful of cards is rendered on arrival; further cards are appended as the area is scrolled toward its bottom. Walking it is what separates a Shallow Scan from a Deep Scan.

## Load Step
One attempt to make the Activity List render more cards: note how much is there, scroll to the bottom, then wait for the list to grow. A productive step ends as soon as growth appears; a fruitless one ends when its wait budget runs out and counts toward the run of empty steps that declares the end of the list. The first render is step zero, and every later step has its own number whether or not it adds anything.

## Shallow Scan
A scan that reports what the Activity List rendered on first load and stops there. It is fast, useful as a quick check, and never a total, which is why it is the default.

## Deep Scan
A scan that walks the Activity List to exhaustion, one Load Step at a time, until the list stops growing. It records how many steps it took and whether the walk finished or was cut short by the overall time limit, and it is opt-in.

## Selection
The subset of a scan's Purge Items that the user chooses on the Selection Page and exports, so that a purge acts on exactly those items and nothing else.

## Purge Status
The state of one Purge Item with respect to purging: left alone, chosen but not yet acted on, purged, refused after an attempt, or chosen but never found. Every item carries exactly one, and the scan envelope is where they live.
