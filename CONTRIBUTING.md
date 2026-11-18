# Contributing

Thanks for helping with agent-team-kit. This guide covers how changes are
proposed, written, reviewed and released.

Write issues, pull requests, commits and code in English. Text the person
sees in the pane, the installers, `LEEME.md` and `CHANGELOG.md` is in Spanish.

## For everyone

- Search the existing issues before opening one. Use the issue forms: they
  ask for what a change needs to be reviewed.
- Security problems are never reported in a public issue: see
  [SECURITY.md](SECURITY.md).
- Be kind and specific: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Conventions for every change

### Failure and limit cases

Each change states what happens at its edges: an empty or broken store, a
narrow pane, the terminal surface, a missing `claude` command, a malformed
install record, a path with spaces or `&`. If a case is out of scope, say so
in the pull request.

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
| `build` | packaging, the zip, the plugin manifest |
| `ci` | GitHub Actions |
| `chore` | anything else that does not reach the person |
| `revert` | reverting an earlier commit |

Scopes in use: `pane`, `skills`, `team`, `agents`, `installer`, `rules`,
`docs`, `ci`, `release`. A breaking change adds `!` after the type or scope
and explains it in the body (`feat(installer)!: drop Python 3.6`).

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
python3 -m py_compile scripts/kit.py
```

and, when an installer changed, install, update from the previous release
and uninstall against a throw-away folder (`-ClaudeDir` / `--claude-dir`) on
the platforms you touched.

Required checks: `plugin`, `installers-linux`, `installers-windows`,
`pr-title`.

### Changelog

Every change the person notices gets a line under `## [Unreleased]` in
`CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)),
in Spanish, saying what changes for them, not how the code changed. Use
`Añadido`, `Cambiado`, `Arreglado` and `Quitado`, once each per version.
Internal changes (tests, CI, refactors) do not go in the changelog.

## Workflow

### Review and merge

- Checks green and the branch up to date with `main`.
- Pull requests are merged with **Squash and merge**; merge commits and
  rebase merges are not used. The branch is deleted after the merge.
- With more than one maintainer, a pull request needs one approval and the
  author never approves their own.

### Protection of `main`

While the repository is private on a free plan, GitHub does not enforce
rulesets, so these rules are a convention. Once it is public, set a ruleset
on `main`: pull request required, the four required checks, squash only,
linear history, no force push and no deletion.

### Versioning and releases

The kit follows [Semantic Versioning](https://semver.org/). The version
lives in `plugin/agent-team/.claude-plugin/plugin.json` and at the top of
`LEEME.md`; both change together. A release:

1. Move `[Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` in `CHANGELOG.md`, bump
   the two versions, and merge that pull request (`chore(release): vX.Y.Z`).
2. Tag `main`: `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.
3. The `release` workflow builds `agent-team-kit-X.Y.Z.zip` and publishes
   the GitHub release with that version's changelog section.

Claude Code caches a plugin by version: a change that does not bump it is
not picked up by people who already installed the same version.
