# Issue tracker: Gitea (MCP)

Issues and specs for this repo live as Gitea issues. Use the official **Gitea MCP server** (`gitea_*` tools) for all operations. This file mirrors `issue-tracker-gitea.md` but describes the MCP tool surface, which differs from the `gt` CLI in three ways:

1. **Consolidated tools**: most operations are `*_read` / `*_write` tools with a `method` parameter, not individual commands.
2. **No bare `list` on some tools**: `issue_read` has no `list` method (use the dedicated `list_issues` tool); `label_read` has scoped listing (`list_repo_labels`, `list_org_labels`) but no bare `list`.
3. **Labels take names, not IDs**: `issue_write add_labels` / `create` accept label **names**; the label must already exist on the repo or the call 404s. Use `label_read list_repo_labels` to verify existence first.

## Conventions

### Tool reference

| Operation | MCP tool | method | Key params |
|---|---|---|---|
| Create issue | `issue_write` | `create` | `title`, `body`, `labels`, `assignees`, `milestone` |
| Read issue | `issue_read` | `get` | `issue_number` |
| List issues | `list_issues` | (dedicated tool) | `state`, `labels`, `page`, `per_page` |
| Read comments | `issue_read` | `get_comments` | `issue_number` |
| Read one comment | `issue_read` | `get_comment` | `issue_number`, `comment_id` |
| Add comment | `issue_write` | `add_comment` | `issue_number`, `body` |
| Update issue | `issue_write` | `update` | `issue_number`, `title`, `body`, `state`, `labels`, `assignees`, `milestone` |
| Add labels | `issue_write` | `add_labels` | `issue_number`, `labels` (names) |
| Remove label | `issue_write` | `remove_label` | `issue_number`, `label_id` |
| Replace labels | `issue_write` | `replace_labels` | `issue_number`, `labels` (names) |
| Clear labels | `issue_write` | `clear_labels` | `issue_number` |
| Add dependency | `issue_write` | `add_dependency` | `issue_number`, `dependency_type`, `related_issue_number` |
| Remove dependency | `issue_write` | `remove_dependency` | `issue_number`, `dependency_type`, `related_issue_number` |
| Get blocked by | `issue_read` | `get_blocked_by` | `issue_number` |
| Get blocking | `issue_read` | `get_blocking` | `issue_number` |
| Get labels on issue | `issue_read` | `get_labels` | `issue_number` |
| Get assignee candidates | `issue_read` | `get_assignee_candidates` | `issue_number` |
| Attachments | `issue_read` / `issue_write` | `get_attachments` / `add_attachment` / `delete_attachment` | `issue_number` |

### Close

The close reason is conveyed by posting a comment **before** closing. Always do both in sequence:

1. `issue_write({ method: "add_comment", issue_number, body: "Reason: <reason>" })`
2. `issue_write({ method: "update", issue_number, state: "closed" })`

You must use any of these 3 close reasons:

- `Reason: completed` — work is done (all checkboxes checked, code committed, tests pass).
- `Reason: not planned` — rejected or will not be actioned (superseded, obsolete, out of scope).
- `Reason: duplicate` — duplicate of another issue (link the canonical issue in the comment).

Never close without the reason comment. See `triage-labels.md` for close-reason definitions.

### Label reference

| Operation | MCP tool | method | Key params |
|---|---|---|---|
| List repo labels | `label_read` | `list_repo_labels` | `owner`, `repo` |
| Get repo label | `label_read` | `get_repo_label` | `id` |
| List org labels | `label_read` | `list_org_labels` | `org` |
| Create repo label | `label_write` | `create_repo_label` | `name`, `color` |
| Update repo label | `label_write` | `update_repo_label` | `id`, `name`, `color` |
| Delete repo label | `label_write` | `delete_repo_label` | `id` |
| Create org label | `label_write` | `create_org_label` | `name`, `color` |
| Update org label | `label_write` | `update_org_label` | `id`, `name`, `color` |
| Delete org label | `label_write` | `delete_org_label` | `id` |

**Gotcha**: `label_read` has no bare `list` method. Use `list_repo_labels` or `list_org_labels` depending on scope. `label_write` is a write tool and never lists.

### Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues:

| Operation | MCP tool | method | Key params |
|---|---|---|---|
| List PRs | `list_pull_requests` | (dedicated) | `state`, `milestone`, `sort` |
| Read PR | `pull_request_read` | `get` | `pull_number` |
| Read PR diff | `pull_request_read` | `get_diff` | `pull_number` |
| Read PR files | `pull_request_read` | `get_files` | `pull_number` |
| Read PR comments | `pull_request_read` | `get_comments` | `pull_number` |
| Create PR | `pull_request_write` | `create` | `title`, `head`, `base`, `body`, `labels` |
| Update PR | `pull_request_write` | `update` | `pull_number`, `title`, `body`, `state`, `labels` |
| Close PR | `pull_request_write` | `close` | `pull_number` |
| Reopen PR | `pull_request_write` | `reopen` | `pull_number` |
| Merge PR | `pull_request_write` | `merge` | `pull_number`, `merge_style` |
| Add reviewers | `pull_request_write` | `add_reviewers` | `pull_number`, `reviewers` |
| Remove reviewers | `pull_request_write` | `remove_reviewers` | `pull_number`, `reviewers` |

Gitea shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `pull_request_read get 42` and fall back to `issue_read get 42`.

## When a skill says "publish to the issue tracker"

Create a Gitea issue via `issue_write({ method: "create", title, body })`. Apply labels at creation with the `labels` param (names), or after with `issue_write({ method: "add_labels", issue_number, labels })`.

## When a skill says "fetch the relevant ticket"

Read it as `issue_read({ method: "get", issue_number })`. The issue object includes `labels`, `assignees`, `milestone`, `state`, `comments` (count). Read the conversation with `issue_read({ method: "get_comments", issue_number })`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Create with `issue_write({ method: "create", title, body, labels: ["wayfinder:map"] })`.
- **Child ticket**: an issue recorded in the map's task list, with `Part of #<map>` at the top of the child body (Gitea has no parent/sub-issue link, so the part-of edge lives in the body, not in a dependency). Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Create with `issue_write({ method: "create", title, body, labels: ["wayfinder:research"] })`. Once claimed, assign to the driving dev.
- **Blocking**: Gitea's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `issue_write({ method: "add_dependency", issue_number: <child>, dependency_type: "blocked_by", related_issue_number: <blocker> })`. Lift it with `issue_write({ method: "remove_dependency", ... })`. Read the child's set with `issue_read({ method: "get_blocked_by", issue_number: <child> })`. Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is blocked while any listed blocker is still open, and unblocked once every blocker is closed.
- **Frontier query**: list the map's open tickets (the task list in the map body, or the tickets marked `Part of #<map>`), drop any that still has an **open** blocker (an open-state issue in its `blocked_by` set, or an open issue in the `Blocked by` line) or an assignee; first in map order wins. Use `list_issues({ state: "open", labels: ["wayfinder:task"] })` and filter client-side.
- **Claim**: `issue_write({ method: "update", issue_number, assignees: ["@me"] })`, the session's first write.
- **Resolve**: `issue_write({ method: "add_comment", issue_number, body: "<answer>" })`, then `issue_write({ method: "update", issue_number, state: "closed" })`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Tool discovery gotchas

The following read tools do **not** have a bare `list` method. An agent pattern-matching the dominant convention ("consolidated read tool → `method: 'list'`") will hit a validation error on these.

| Tool | Has `list` method? | Use instead |
|---|---|---|
| `issue_read` | ❌ no `list` | `list_issues` (dedicated tool) |
| `label_read` | ✅ `list_repo_labels` / `list_org_labels` (scoped, not bare `list`) | `list_repo_labels` or `list_org_labels` |
| `label_write` | ❌ no `list` (write tool) | `label_read list_repo_labels` |

### Read tools that DO have a `list` (or `list_*`) method

| Tool | methods |
|---|---|
| `notification_read` | `list` \| `get` |
| `package_read` | `list` \| `list_versions` \| `get` |
| `milestone_read` | `get` \| `list` |
| `tag_read` | `list` \| `get` |
| `wiki_read` | `list` \| `get` \| `get_revisions` |
| `release_read` | `list` \| `get` \| `get_by_tag` \| `get_latest` \| `list_assets` \| ... |
| `commit_read` | `list` \| `get` \| `get_status` \| `compare` |
| `repo_read` | `get` \| `list_my_repos` \| `list_org_repos` \| `list_branch_protections` \| ... |
| `actions_run_read` | `list_workflows` \| `get_workflow` \| `list_runs` \| `get_run` \| `list_jobs` \| ... |
| `project_read` | `list` \| `get` \| `list_columns` \| `list_column_issues` |
| `branch_read` | `list` \| `get` |

### Label operations needed by Matt Pocock skills

| Skill | Needs `label_read`? | Needs `label_write`? | Why |
|---|---|---|---|
| `/wayfinder` | ✅ verify `wayfinder:*` labels exist before creating map/tickets | ✅ create missing `wayfinder:*` labels | Five canonical labels must exist before map creation |
| `/implement` | — | — | Fetches tickets by reference; no label operations |
| `/implement-spec` | — | — | Consumes published tickets; closes via `update` + `add_comment` |
| `/to-spec` | ✅ verify `ready-for-agent` exists | ✅ create `ready-for-agent` if missing | Applies `ready-for-agent` triage label to published spec |
| `/to-tickets` | ✅ verify `ready-for-agent` exists | ✅ create `ready-for-agent` if missing | Applies `ready-for-agent` triage label to each published ticket |

## gt CLI gaps (when MCP is unavailable)

The `gt` CLI is needed only in these cases where MCP has no equivalent:

| Gap | Why MCP can't cover it | gt command |
|---|---|---|
| **Raw API for board setup** | MCP `project_write` covers most operations, but initial column creation and getting DB IDs is easier with raw API | `gt api /repos/{owner}/{repo}/projects/...` |
| **Bulk operations** | MCP is one tool call at a time; `gt` can be scripted in bash loops | `for n in ...; do gt issue ...; done` |
| **Getting DB id** | MCP has no "get raw issue by number with DB id" tool | `gt api /repos/{owner}/{repo}/issues/{number}` → `.id` |