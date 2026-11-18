# AGENTS.md

Guidance for AI coding agents working in this repository. People: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## What this is

A Claude Code plugin (`plugin/agent-team/`, TypeScript hooks rendered by the
engine), published through the marketplace in `.claude-plugin/`.

## Rules

- Read `plugin/agent-team/README.md` before touching the hooks. Two engine
  rules break things silently: each module declares the atoms it touches
  literally, and a function that takes `$` and is imported by another module
  is a `function` declaration, not an arrow.
- The engine API is in the types Claude Code writes beside a loaded mod
  (`.claude-plugin/types/claude-code/index.d.ts`). Claims about the API come
  from there or from a test, never from memory.
- Pure logic goes in `state.ts`, side effects in `actions.ts`, event wiring
  in `register.tsx`, drawing in `pane.tsx` and `drawing.ts`, texts in
  `i18n.ts`.
- Every text the person sees goes in both tables of `i18n.ts`, English and
  Spanish. Text the model reads stays English.
- Rows in the pane must survive a narrow pane: no row with several fixed
  pieces side by side; use two lines or `flexWrap`.
- Code, comments, commits, PRs, documentation and the changelog in English.
- Verify before reporting: `claude plugin test plugin/agent-team` and
  `claude plugin validate plugin/agent-team`.
- Never commit or push; never touch a real `~/.claude` folder in tests.
- Follow GitHub Flow and Conventional Commits as CONTRIBUTING.md describes.
