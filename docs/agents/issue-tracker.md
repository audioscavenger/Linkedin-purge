# Issue Tracker

Local markdown issue tracker.

Issues live as files under `.scratch/<feature>/issue.md` in this repo. This is a solo project on a self-hosted Gitea instance without a `gh`/`glab` CLI mapping.

## Workflow

- **Create issue**: Write `.scratch/<feature>/issue.md` with the spec template.
- **List issues**: `ls .scratch/*/issue.md`
- **Read issue**: `cat .scratch/<feature>/issue.md`
- **Close issue**: Move `.scratch/<feature>/` to `.scratch/<feature>.done/` or delete.
- **No labels**: Triage is manual; no label vocabulary needed.

## `to-spec` publishing

When `to-spec` writes a spec, it creates the issue file at `.scratch/<slug>/issue.md` and prints its path. No external API call.