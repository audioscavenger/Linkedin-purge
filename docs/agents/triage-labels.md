# Triage Labels

The skills speak in terms of two category roles (`bug`, `enhancement`) and five state roles. This file maps those roles to the actual label strings used in this repo's issue tracker. Category and state are orthogonal: an issue carries one category and one state at any time.

| Label in mattpocock/skills | Label in our tracker | Color | Meaning                                  |
| -------------------------- | -------------------- | ----- | ---------------------------------------- |
| `bug`                       | `bug`                | `#c92a2a` | Something is broken                      |
| `enhancement`               | `enhancement`        | `#0d6efd` | New feature or improvement               |
| `needs-triage`             | `needs-triage`       | `#e01f1d` | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | `#107ab0` | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | `#0e8a16` | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | `#ffdd00` | Requires human implementation            |
| `wontfix`                  | `wontfix`            | `#808080` | Will not be actioned                     |
| `spec`                      | `spec`               | `#6f42c1` | A decision record (spec)                  |
| `implement`                 | `implement`          | `#fd7e14` | Implementation work                       |
| `done`                      | `done`               | `#20c997` | Successfully completed work               |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column only when your tracker already uses those names, so each role maps onto a label that exists. Renaming a role here does not rename anything in your tracker, and any tool matching on the canonical string stops seeing the issues you label.

## Close reasons

Closed issues carry a close reason via a comment prefixed `Reason:`, posted before closing via `issue_write({ method: "add_comment", ... })` followed by `issue_write({ method: "update", state: "closed" })`. Each close reason pairs with a terminal label:

| Close reason | Meaning | Terminal label |
| ------------ | ------- | -------------- |
| `Reason: completed` | Work is done (all checkboxes checked, code committed, tests pass). | `done` |
| `Reason: not planned` | Rejected or will not be actioned (superseded, obsolete, out of scope). | `wontfix` |
| `Reason: duplicate` | Duplicate of another issue (link the canonical issue in the comment). | None |

Never close without the reason comment.

## Label lifecycle

Category labels (`bug`, `enhancement`) are orthogonal to state labels (`ready-for-agent`, `done`, `wontfix`) and must be applied and preserved across the entire issue life cycle:

| Stage / Skill | Label to apply | When | What happens |
| ------------- | -------------- | ---- | ------------ |
| **Wayfinder map** | Map inherits from decision type | `/wayfinder` creates a `wayfinder:map` issue. The map's `bug`/`enhancement` category is set from the first decision recorded in the map body: `bug` if the problem is "something broken", `enhancement` if it's a "new feature or improvement". All child tickets inherit the map's category. |
| **Grilling** | Category recorded in domain model | `/grill-with-docs` records the `bug`/`enhancement` distinction in decisions, GLOSSARY.md entries, and ADRs. Domain terms are tagged with their category so downstream skills can read it. |
| **To-spec** | Category label on spec issue | `/to-spec` applies `bug` or `enhancement` to the spec issue alongside `ready-for-agent`. The spec becomes the single source of truth for the category. |
| **To-tickets** | Category label on each ticket | `/to-tickets` applies the spec's category label to every ticket alongside `ready-for-agent`. Each ticket's category cannot differ from the spec's category. |
| **Implement** | Category preserved on ticket | `/implement` preserves the ticket's category label. Does not change it. Category transitions only happen via `/setup-matt-pocock-skills` re-run or manual edit. |
| **Implement-spec** | Category preserved across all tickets | `/implement-spec` preserves category labels on every ticket in the spec's task graph. No label operations are performed; category is read-only throughout. |
| **Code-review** | Category verified before approval | `/code-review` checks that the ticket carries the category label that matches its work. Review findings note if the label is missing or mismatched; the review must not approve until the label is corrected. |
| **Close** | Terminal label matches category | Closing via `Reason: completed` → `done` + category label preserved. Closing via `Reason: not planned` → `wontfix` + category label preserved. The category label is never removed on close. |

**Rule**: Every issue carries exactly one category (`bug` or `enhancement`) and exactly one state at all times. Category is set at issue/spec creation and remains immutable. State transitions are: `needs-triage` → `ready-for-agent` → `done` / `wontfix`. The category label must not change across state transitions.

Close reasons and their category-aware effects:

| Close reason | Terminal label | Category effect |
| ------------ | -------------- | -------------- |
| `Reason: completed` | `done` | Category label preserved on the issue. |
| `Reason: not planned` | `wontfix` | Category label preserved on the issue (deprecated but retained). |
| `Reason: duplicate` | None | Category label preserved; issue's body should link the canonical issue, retaining the original category. |

The category label is a core property of the issue throughout its life. It must not be silently dropped, renamed, or replaced by any skill unless an explicit migration step (via `/setup-matt-pocock-skills`) is performed.

Implementation tickets close with `Reason: completed` → label `done`, or `Reason: not planned` → label `wontfix`. Specs close with `Reason: not planned` → label `wontfix` when abandoned, or `Reason: completed` → label `done` when accepted.