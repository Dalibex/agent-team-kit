## Description

<!-- What changes and why, in a few sentences. -->

## Type of change

- [ ] New feature
- [ ] Bug fix
- [ ] Refactoring
- [ ] Documentation
- [ ] Tests
- [ ] CI, build or maintenance

## Related issue

<!-- Plain text, not inside a code block, so GitHub closes the issue on merge. -->
Closes #

## Changes made

-

## How has this been tested

<!-- Commands run and their result. -->

- [ ] `claude plugin test plugin/agent-team`
- [ ] `claude plugin validate plugin/agent-team`
- [ ] `claude plugin validate .`

## Manual evidence

<!-- Screenshots of the pane (desktop and, if it changed, a narrow pane, the terminal and both languages). -->

## Risks

<!-- What could break for someone updating from the previous release. -->

## Noticed, not done

<!-- Things found along the way and left for another issue. -->

## Checklist

- [ ] The title is a Conventional Commit (`type(scope): description`).
- [ ] One issue per pull request; labels and milestone match the issue.
- [ ] Tests cover the new behaviour and its failure cases.
- [ ] Narrow pane and terminal surface still read well (if the pane changed).
- [ ] Every new text is in both tables of `i18n.ts` (English and Spanish).
- [ ] `CHANGELOG.md` updated under `[Unreleased]` if the person notices the change.
- [ ] READMEs updated if usage changed.
- [ ] No secrets, personal data or real `~/.claude` files.
- [ ] `agent-assisted` label added if an AI agent wrote part of it.
