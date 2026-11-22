# Changelog

All notable changes to agent-team-kit. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.3] - 2026-11-22

### Added

- An agent that stops with `QUESTIONS:` (or `PREGUNTAS:`) shows as asking
  instead of done: its slot turns violet with a "?" over the sprite, its
  pulse back to Claude is violet, and its row reads "asking (N)" and lists
  the questions when unfolded. It stays so until Claude continues it (the
  pulse that wakes it is violet too), Claude sends a new agent of that role
  instead, or a `/clear` starts a new conversation. The Team tab's button
  counts the agents asking (`?1`), the terminal's team line marks them, the
  session log calls them asking, and a long run's system notification says
  it is asking.
- Two switches at the left of the drawing (on the title's line in a
  terminal) mute the pane's sounds (🔊/🔇) and turn off its system
  notifications (🔔/🔕); both are remembered across sessions.
- An "Update now" button in the update chip, and `/agent-team update`, which
  ask GitHub for the latest release at once and, when it is newer, run the
  marketplace and plugin updates, then reload the plugins when the session
  offers `/reload-plugins` (or ask you to run it).

### Changed

- The drawing's motion is smoother: moves ease in and out instead of
  running at a constant speed, fades swell softly, and the error shake is a
  small wobble that dies down instead of jumping whole pixels.
- The Team tab has two sections that fold: "Team", with the Delegate switch
  and the Models block, first; then "Team actions", with Claude's and the
  agents' rows. Rows are spaced further apart.
- The Delegate switch looks like a button.
- The Models block's columns line up from row to row.

### Fixed

- Two quick presses in the Models block each apply, instead of the second
  overwriting the first.
- A window's Models block shows the choices another window made, once the
  Agent tool is described or called.
- The thought bubble's dots and the hammer's sparks had key times SMIL does
  not accept (they did not end at 1), so a surface could skip or freeze them.

## [0.9.2] - 2026-11-22

### Fixed

- The Models block's buttons show their value (Sonnet, medium) instead of a
  cut name, so a press no longer changes something you cannot see. Choices
  made with 0.9.1's unreadable buttons are dropped once, back to the
  defaults.
- Claude's tool icon and end-of-turn check stay still instead of popping in
  again on every redraw, and Claude no longer lunges toward the agent it
  delegates to.
- The bar under a working agent is one block gliding to the end and back,
  instead of a half-filled bar that grew with its tool calls and made the
  drawing restart its motion.

## [0.9.1] - 2026-11-22

### Added

- A **Models** block at the foot of the Team tab: pick each role's model
  (Haiku, Sonnet, Opus) and effort (low to max). The defaults are the ones the
  agents ship with, marked as such, and Reset brings them back. The choice
  applies to every project from the next agent sent, and the team paragraph
  Claude reads names the models picked. When Claude sets a model or effort for
  one task itself, its choice wins for that task. A dim line warns that Opus
  and the highest efforts spend more of the usage limits.

### Changed

- Once an agent's afterglow ends, its slot rests like an empty one instead of
  staying green; a failed one keeps a dim red border until the role runs
  again.
- The team name in the drawing no longer has twinkling stars beside it.
- The "View its conversation" button shows only on the terminal: the desktop
  app draws its own conversation, so the engine cannot switch it there.

### Fixed

- The drawing no longer starts on the still pose for a moment when the pane
  opens.
- Percentages read the same way across the pane.
- Two memory files with the same name in different folders are told apart in
  the Usage tab.

## [0.9.0] - 2026-11-22

### Added

- A **Usage** tab with where the session's tokens go, in tokens only: input,
  output, the share read from cache, turns and compactions; the context
  window by category with the skills grouped by plugin, the MCP tools by
  server, each memory file and each custom agent; Claude against each role
  of the team, the tools whose results added the most tokens and the turns
  with the most tokens. It reads the engine's own estimates, calls no model,
  and refreshes at the end of Claude's turns only while the tab is shown.
- Claude's sprite reacts to what it does: it breathes and blinks when idle,
  shows a thought bubble while it thinks, an icon of the tool it is using
  (reading, editing, a shell, a search, the web), leans toward the agent it
  delegates to, and shows a check when its turn ends or shakes on an API
  error.

### Changed

- The session's token line moved from the Team tab to the Usage tab.
- The drawing runs fewer animations at rest: one "z" per empty slot, and the
  sprites hold still after a minute with nothing happening.

## [0.8.7] - 2026-11-22

### Added

- A job's row in the Jobs tab names what it works on
  (`maven · build · clean, install`).
- The GitHub tab says when the pull request was merged or closed, and stops
  showing its checks as live. On a branch without a pull request, a failed
  workflow run shows on the tab button too.

### Changed

- The session log writes one file per session in `agent-team/runs/` instead
  of rewriting `agent-team/runs.md`, so an entry can no longer be lost when
  two windows end at once or the session is cut while writing. An existing
  `runs.md` is left as it is.
- CI polling backs off from every 2 minutes to every 5 and then 10 while
  nothing changes, and stops after an hour (six while a check is really in
  progress); the ↻ button still reads it. A
  required check that never reported counts as waiting, not running.
- The title of each tab no longer has a twinkling star.

### Fixed

- A pull request with a failed job no longer shows as passing when another
  workflow has a job of the same name, and a queued re-run is no longer hidden
  by the run it replaces.
- A background job that runs for more than an hour stays as running while its
  output grows, and its end is still heard.
- A background command refused at the permission prompt, or one that fails to
  start, no longer shows as running for an hour.
- A shell stopped with TaskStop closes even when its task id was never read.
- Dev servers and watchers (`spring-boot:run`, `bootRun`, `quarkus:dev`,
  `docker compose up` without `-d`, `--watch`) are no longer shown as builds,
  and health checks with `curl -o /dev/null` are no longer downloads.
- `npm.cmd`, `npx.cmd`, `yarn.cmd`, `bun` and `python -m pytest` are tracked,
  and the progress percentage is the latest one in the output.
- A folder outside a git repository reads as such when git speaks another
  language.
- The session log and the rounds count only the team's own agents (the
  built-in Explore and your own agents are no longer logged), and a round
  whose start the engine never reported is still counted.
- The session log is skipped when the session ends with too little time left:
  that session's entry is lost and a line in the debug log says why. Under WSL
  the log and the rules go to the Linux home.
- An agent stopped by an API error keeps the precise reason, a brief warning is
  no longer lost when the agent starts before its spawn is recorded, and an
  agent closed by the engine's list ends its foreground job.
- Two windows no longer overwrite each other's loose skill slots, and a skill
  can no longer sit in two loose slots.
- No more false waste warnings for the files Claude reads to edit them, or for
  a reviewer sent on committed work; Spanish briefs compare as English ones do.
- The GitHub tab keeps its refresh button when git fails, the drawing shows no
  empty hover box, and tooltips fit a narrow pane.

## [0.8.6] - 2026-11-21

### Fixed

- A background shell stopped with TaskStop leaves the running state in the
  Processes tab at once, shown as stopped, instead of staying as running for
  up to an hour.
- A brief whose heading qualifies Goal or Why (`## Why / decisions taken`,
  `**Why (context)**:`) no longer gets the "brief without Why" warning in the
  Team tab.

## [0.8.5] - 2026-11-20

### Added

- Rounds on each agent's row in the Team tab (`↻n`): how many times Claude
  woke the agent again with SendMessage, flagged from the fifth round on.
- Session log: when a session that used the team ends, the plugin appends a
  summary of its agents (role, model, task, status, time, rounds, tokens and
  waste warnings) to `agent-team/runs.md` in the Claude config folder. The
  plugin writes it, not the model, so it costs no tokens; the `sessionLog`
  option turns it off.
- Team rules: a **Models** section (the implementer and the tester run on
  Sonnet; a task that touches security, data integrity, a public interface,
  several modules or delicate domain logic goes to Opus, and Claude says why)
  and a **Fix loop** section (clear test failures and concrete correctness
  findings go back to the implementer without asking; the tester reruns the
  suite and the reviewer checks only the fix; Claude stops and asks after two
  rounds without progress or five in total).

### Changed

- Team rules: a bug the tester finds is no longer always handed to the user;
  the fix loop decides. Run `/agent-team rules` to update a block added by
  0.8.4.

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
