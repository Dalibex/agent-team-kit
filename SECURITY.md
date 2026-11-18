# Security policy

## Supported versions

Only the latest release receives fixes. Update to the newest version
(`claude plugin marketplace update agent-team-kit`, then
`claude plugin update agent-team@agent-team-kit`) before reporting a problem.

| Version | Supported |
| --- | --- |
| 0.8.x | Yes |
| < 0.8 | No |

## Reporting a vulnerability

Do not open a public issue. Report it privately through the repository's
**Security** tab, **Report a vulnerability**, with:

- what the problem is and what an attacker could do with it;
- the steps to reproduce it;
- the kit version, the Claude Code version and the operating system;
- any idea of a fix.

You will get an answer within a week. Once fixed, the release notes credit
the report unless you prefer otherwise.

## What the plugin touches

- It writes only the plugin's own store and, when you type `/agent-team rules`
  yourself, the block between its markers in your global `CLAUDE.md`, keeping
  a copy of the file first.
- It calls no model.
- Over the network it only runs the `gh` commands of the GitHub tab and, once
  a day, reads the latest release of this repository from the GitHub API for
  the update notice. That request carries no data of yours; it is skipped when
  the `updateCheck` option is off or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  is set.

A report that shows any of this broken is a security issue.

## What must never be committed

- secrets, tokens or keys of any kind;
- a real `~/.claude` folder or parts of it (`settings.json`, `CLAUDE.md`,
  `.credentials.json`, transcripts);
- personal data.
