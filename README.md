# 🤖 agent-team-kit

[![CI](https://github.com/Dalibex/agent-team-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Dalibex/agent-team-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A side pane and a four-agent team for [Claude Code](https://claude.com/claude-code),
packaged as a kit with installers for Windows, Linux and macOS.

> [!NOTE]
> The user guide is in Spanish: [LEEME.md](LEEME.md). This README is for people
> who work on the kit itself.

## 📑 Contents

- [What it does](#-what-it-does)
- [Quick start](#-quick-start)
- [Project structure](#-project-structure)
- [Development](#-development)
- [Contributing](#-contributing)
- [License](#-license)

## 🔄 What it does

- **The team.** Four agents ship inside the plugin: `agent-team:explorer`
  (Haiku, read-only search), `agent-team:implementer` (Sonnet, makes agreed
  changes), `agent-team:tester` (Sonnet, writes and runs tests) and
  `agent-team:reviewer` (Opus, reviews diffs). Every brief gets the project,
  its branch and the skills picked in the pane; an agent that lacks something
  stops with `PREGUNTAS:` and is continued, not respawned.
- **The pane.** Claude and the agents as pixel sprites, usage limits with a
  projection, and tabs for the team (spend per role, skills each one loaded,
  waste warnings), skills (packs and loose skills, kept per project),
  installs and builds, and GitHub (branch, PR, checks).
- **Delegation.** The plugin replaces the Agent tool's "do not delegate
  unasked" paragraph with one that points to the team rules, which the
  installer can add to `~/.claude/CLAUDE.md`.

The pane calls no model and costs no tokens.

## ⚡ Quick start

Requirements: Claude Code with plugin support; Windows 10/11 (Windows
PowerShell), or macOS/Linux with Python 3.7+.

```bash
# Windows: double-click instalar-windows.cmd, or
instalar-windows.cmd -Nombre Ana -Reglas -SinPreguntas

# Linux and macOS
sh instalar-linux.sh --nombre Ana --reglas --sin-preguntas
```

Then open a new Claude Code session (or run `/reload-plugins`). `/agent-team`
shows or hides the pane. Running the installer again updates in place;
`desinstalar-windows.cmd` / `sh desinstalar-linux.sh` remove everything the kit
installed.

## 📁 Project structure

```text
plugin/agent-team/      the plugin: hooks (TypeScript), agents, sounds, tests
  hooks/                register.tsx (events), pane.tsx (UI), state.ts (pure logic),
                        actions.ts (side effects), drawing.ts, look.ts, usage/jobs/github
  agents/               the four team agents
  tests/                claude plugin test suite
scripts/                installers: instalar.ps1, desinstalar.ps1, comun.ps1, kit.py
extras/                 team rules for CLAUDE.md
instalar-*.cmd/.sh      entry points
LEEME.md                user guide (Spanish)
CHANGELOG.md            changes per version (Spanish, user-facing)
```

The plugin's own [README](plugin/agent-team/README.md) explains its design
and the two engine rules every module must follow.

## 🧪 Development

```bash
claude plugin test plugin/agent-team       # the test suite
claude plugin validate plugin/agent-team   # what the engine would refuse
python3 -m py_compile scripts/kit.py       # installer syntax
```

Installers are tested end to end against a throw-away Claude folder:
`-ClaudeDir <folder>` on Windows, `--claude-dir <folder>` on Linux and macOS.
CI runs all of this on every pull request.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, Conventional Commits,
pull requests and releases, and [SECURITY.md](SECURITY.md) to report a
vulnerability.

## 📄 License

[MIT](LICENSE).
