# Changelog

All notable changes to agent-team-kit. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.4] - 2026-11-19

First public release.

### Added

- Agent team shipped inside the plugin: `agent-team:explorer` (Haiku, searches
  and reads without editing), `agent-team:implementer` (Sonnet, makes agreed
  changes and verifies them), `agent-team:tester` (Sonnet, writes and runs
  tests without touching production code) and `agent-team:reviewer` (Opus,
  reviews the diff before a commit).
- Context in every brief: the plugin appends the project folder, its branch
  and the skills picked in the pane, and each agent loads only the ones its
  task needs.
- Question protocol: an agent that lacks something stops and returns
  `QUESTIONS:`; Claude continues it with SendMessage without losing what it
  already read, or asks the user when the decision is theirs.
- Delegation: the Agent tool no longer tells Claude not to delegate unless
  asked and points to the team rules instead; the Delegate switch in the Team
  tab turns this off from the next conversation.
- `/agent-team rules` adds the team rules to the global `CLAUDE.md` and keeps
  them up to date; `/agent-team rules off` removes them. The rules cover when
  to use each agent, a brief template (Goal, Why, Files, Done when, Limits),
  how to answer agents' questions and how to check what they return.
- Side pane with Claude and its agents as pixel sprites that wake up when they
  get a task and finish with confetti and a sound of their own.
- Usage limits: the 5-hour window with the time it fills at the current pace,
  the weekly window and the session's context, with warnings at 80 % and
  95 %, details on hover and a button to compact the context.
- Tabs for Team, Skills, Jobs and GitHub: one shows at a time, the other
  buttons flag what is happening in them, and the open tab is remembered
  across sessions. Every tab fits a narrow pane and scrolls with the wheel.
- Team tab: tokens spent per role in the session and the team's share, one
  row per agent with its task, time, model and the skills it loaded, its
  brief and report when unfolded, and waste warnings for a brief without Goal
  or Why, a repeated brief that could have continued an agent, an Opus review
  of a change of ten lines or fewer, and more than five files read without
  the explorer.
- Skill packs: twelve packs with a name you type and up to 24 skills each;
  with a pack picked, Claude loads only the skills each request needs. Eight
  loose skills that go whole with every request. Picks are remembered per
  project, and skills that are no longer installed are flagged and not sent.
- Jobs tab: installs, builds, tests and downloads with their time and, in the
  background, their real progress, plus a system notification when something
  long finishes.
- GitHub tab: the branch, uncommitted changes, the pull request with its
  checks and a link to the failing one, pull requests waiting for review and
  links to the repository, and a notice when the running CI finishes.
- English and Spanish: the pane follows the system language, or the
  `language` option.
- A notice in the pane when a new version is published.
- Terminal version of the pane, drawn as text. The pane calls no model and
  spends no tokens.
- Install from Claude Code with `/plugin marketplace add
  Dalibex/agent-team-kit` and `/plugin install agent-team@agent-team-kit`.
