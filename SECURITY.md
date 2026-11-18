# Security policy

## Supported versions

Only the latest release receives fixes. Update with the installer of the
newest release before reporting a problem.

| Version | Supported |
| --- | --- |
| 0.8.x | ✅ |
| < 0.8 | ❌ |

## Reporting a vulnerability

Do not open a public issue. Report it privately through the repository's
**Security** tab → **Report a vulnerability**, with:

- what the problem is and what an attacker could do with it;
- the steps to reproduce it;
- the kit version and the operating system;
- any idea of a fix.

You will get an answer within a week. Once fixed, the release notes credit
the report unless you prefer otherwise.

## What the kit touches

The installers write only inside the Claude folder (`~/.claude`, or the one
given with `-ClaudeDir` / `--claude-dir`) and keep a dated copy of every file
they change in `agent-team-kit-copias/`. The plugin calls no model and sends
nothing over the network except the `gh` commands the GitHub tab runs. A
report that shows either of these broken is a security issue.

## What must never be committed

- secrets, tokens or keys of any kind;
- a real `~/.claude` folder or parts of it (`settings.json`, `CLAUDE.md`,
  `.credentials.json`, transcripts);
- personal data.
