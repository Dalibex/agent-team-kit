# Contributing

Thanks for helping with agent-team-kit. This guide covers how changes are
proposed, written, reviewed and released.

Write issues, pull requests, commits, code, documentation and the changelog
in English. Text the person sees in the pane exists in English and Spanish:
add every new string to both tables in `plugin/agent-team/hooks/i18n.ts`.
Text the model reads (briefs, the Agent tool's paragraph, the team rules)
stays in English.

## For everyone

- Search the existing issues before opening one. Use the issue forms: they
  ask for what a change needs to be reviewed.
- Security problems are never reported in a public issue: see
  [SECURITY.md](SECURITY.md).
- Be kind and specific: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Conventions for every change

### Failure and limit cases

Each change states what happens at its edges: an empty or broken store, a
narrow pane, the terminal surface, both languages, a missing `gh`, no
network, a `CLAUDE.md` that is missing, not UTF-8, symlinked, or has the
rules edited by hand or an older section without markers. If a
case is out of scope, say so in the pull request.

### Branches

`main` is the only long-lived branch and is always releasable. Work on one
branch per issue, created from an up-to-date `main`:

```bash
git switch main
git pull
git switch -c feature/12-skill-pack-export
```

Name: `<type>/<issue>-<short-slug>`, lowercase with hyphens. Prefixes:
`feature/`, `fix/`, `docs/`, `refactor/`, `test/`, `ci/`, `build/`, `chore/`.

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):
`type(optional scope): description`, imperative and lowercase.

| Type | For |
| --- | --- |
| `feat` | a new capability for the person using the kit |
| `fix` | a bug fix |
| `docs` | documentation only |
| `style` | formatting, no behaviour change |
| `refactor` | code change that neither fixes a bug nor adds a feature |
| `perf` | a change that makes something faster or lighter |
| `test` | tests only |
| `build` | the plugin manifest and the marketplace |
| `ci` | GitHub Actions |
| `chore` | anything else that does not reach the person |
| `revert` | reverting an earlier commit |

Scopes in use: `pane`, `skills`, `team`, `agents`, `rules`, `i18n`,
`docs`, `ci`, `release`. A breaking change adds `!` after the type or scope
and explains it in the body (`feat(rules)!: rename the rules markers`).

```text
feat(skills): export and import packs from the skills tab
fix(pane): keep agent rows inside a narrow pane
```

Keep commits small and with one purpose. Never commit secrets, a real
`~/.claude` folder or the generated `plugin/agent-team/.claude-plugin/types/`.

### Pull requests

- One issue per pull request. Open it as a draft on the first push.
- The title is a Conventional Commit: the `pr-title` check enforces it, and
  with squash merge it becomes the commit on `main`.
- Fill the template. Write `Closes #N` as plain text in the description,
  never inside a code block, so GitHub closes the issue on merge.
- Add the issue's labels, and `agent-assisted` when an AI agent wrote part
  of the change.

Before pushing, run:

```bash
claude plugin test plugin/agent-team
claude plugin validate plugin/agent-team
claude plugin validate .
```

and, when the pane changed, look at it in the desktop app in both languages
and in a narrow pane.

Required checks: `plugin` and `pr-title`.

### Changelog

Every change the person notices gets a line under `## [Unreleased]` in
`CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)),
saying what changes for them, not how the code changed. Use `Added`,
`Changed`, `Deprecated`, `Removed`, `Fixed` and `Security`, each at most once
per version. No emojis. Internal changes (tests, CI, refactors) do not go in
the changelog.

## Workflow

### Review and merge

- Checks green and the branch up to date with `main`.
- Pull requests are merged with **Squash and merge**; merge commits and
  rebase merges are not used. The branch is deleted after the merge.
- With more than one maintainer, a pull request needs one approval and the
  author never approves their own.

### Protection of `main` and release tags

Two rulesets enforce this (Settings → Rules → Rulesets):

- **Protect main**: changes reach `main` only through a pull request, with
  `plugin` and `pr-title` green and the branch up to date; squash merge only, linear history, review
  threads resolved, no force push and no deletion. No approval is required
  while there is a single maintainer, since GitHub does not let authors
  approve their own pull requests.
- **Protect release tags**: a `v*` tag can be created but never moved or
  deleted, so a release always points at the commit it was built from.

### Versioning and releases

The kit follows [Semantic Versioning](https://semver.org/). The version
lives in `plugin/agent-team/.claude-plugin/plugin.json`. People install and
update through the marketplace in `.claude-plugin/marketplace.json`, which
reads the plugin from `main`, so what is on `main` is what they get. A
release:

1. Move `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` in `CHANGELOG.md`, bump
   the version in `plugin.json`, and merge that pull request
   (`chore(release): vX.Y.Z`).
2. Tag `main`: `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.
3. The `release` workflow checks that the tag matches `plugin.json` and
   publishes the GitHub release with the install commands and that
   version's changelog section. The pane's update notice reads the latest
   release.

Claude Code caches a plugin by version: a change that does not bump it is
not picked up by people who already installed the same version.
