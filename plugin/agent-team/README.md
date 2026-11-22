# agent-team

A side pane for Claude Code Desktop. It shows the main Claude and its agents
(explorer, implementer, tester, reviewer, plus any other agent while it runs)
as pixel sprites under a pixel-letter title.

The title reads "AGENT TEAM" until you give the team a name. The `teamName`
option in `.claude-plugin/plugin.json` sets it: "Ana" turns the title into
"ANA TEAM" and adds an "AGENT SQUAD" line under it. Accents are dropped in
the pixel letters and the name is cut at 12 characters there; the text title
keeps it as written. A name with nothing the pixel font can draw (only A-Z,
0-9, spaces and hyphens survive, so "日本" leaves nothing) falls back to
"AGENT TEAM" everywhere, the text title included.

What you see:

- Each agent sleeps in grey until Claude sends it a task. Then a pulse runs
  down its wire, it wakes up and does its thing: the explorer sweeps a torch,
  the implementer swings a hammer, the tester's test tube bubbles and the
  reviewer reads a page. When it finishes, confetti and a check (or a shake
  and a red mark if it failed). An agent whose report opens with
  `QUESTIONS:` or `PREGUNTAS:` (bold or as a heading too) is asking: its
  slot's border turns violet with a "?" over the sprite, and its pulse back
  up the wire is violet; both hold until Claude continues it with
  SendMessage, whose pulse down the wire is violet as well, until Claude
  sends a new agent of that role instead, or until a `/clear`. An asking
  agent's row is kept in the history like a running one.
- At the drawing's left, two switches, each its icon alone: 🔊 mutes the
  pane's sounds (🔇 while muted) and 🔔 turns off its system notifications
  (🔕 while off; toasts still show). The desktop app draws a button's label
  and nothing else, so the label is the icon: a longer one would squeeze the
  drawing. Both are kept in the store (`soundOn`, `notifyOn`). On the
  terminal they sit on the title's line.
- At the right of the team, in the same drawing and neon pixel style, a
  usage column: the 5-hour and weekly windows (LED bars, with the time each
  resets) and the context as tokens over the window (30K/400K, 62K/1M). The
  column sits beside the team rather than under it so the drawing is wide
  and low and fills the pane's width. Limits turn amber at 80 % and red at
  95 %, where the bar blinks; while something works, a glint runs along the
  bars and the last lit segment beats. Hovering a gauge shows its detail.
  A toast warns once when a window passes 80 % and once at 95 %. The figures
  are pushed by the engine after each turn: nothing is polled. The limits
  only exist on a subscription.
- Under the 5-hour bar, a projection: the pane keeps one reading per turn
  (across sessions too), and when the rate of the last ninety minutes would
  fill the window before it resets, an amber line says when ("↗ 100% a las
  17:20").
- A line under the drawing with the branch, its CI and what is installing
  or building (on the terminal, which has no drawing, the usage figures and
  the projection too). Past 80 % of the context a "Compact context"
  button there compacts the conversation, as /compact does (not while a
  turn runs).
- When CI the pane was watching finishes, a toast and a sound say so
  ("CI ✓ on #42: 3 checks passing"). A build, install, background shell
  or agent that ran over 30 seconds raises a system notification when it
  ends, for when you are in another window. When an API failure ends a
  turn, Claude's row says which ("la API cortó el turno: servidores
  saturados") until the next turn starts.
- Then a row of tabs, one card shown at a time: Equipo, Skills, Procesos,
  GitHub and Uso. A hidden tab's button carries a short count of its news
  (`Equipo ●2`, `Skills ✦3`, `Procesos ⟳1`, `GitHub ✗`), and the tab shown
  is kept in the store, so the next session opens on it. The card is titled
  like the drawing (its name in neon pixel letters) and framed in its colour.
  - **Equipo**: two sections, each folded or unfolded with its header's
    arrow (both start unfolded). **Team** holds the Delegate switch and the
    Models block (see The team, below). **Team actions** has one line per
    member: Claude, then the recent agents, the
    whole history of 16. A working one reads "working…" with
    a spinner and moving dots; a finished one shows its task in one line;
    then its time and model, and under it, in skill colour, the skills it
    loaded with the Skill tool (Claude's for its current or last turn, an
    agent's for its run; a resumed agent starts its list over). The arrow
    unfolds the task, its status and tool
    count, the brief, its tokens and its report, with buttons to open that
    agent's conversation and to copy its report. A warning on Claude's row
    when it reads more than five files in one turn without sending the
    explorer, and on an agent's row when its spawn wasted tokens: a team
    brief without Goal or Why, a brief that repeats (60 % of its words) one
    the same role finished in the last 20 minutes, which SendMessage could
    have continued, or a reviewer sent on a diff of ten lines or fewer
    (`git diff --shortstat HEAD`, read off the spawn's path). An agent
    that stopped to ask reads "asking (N)" in violet with a "?" instead of
    its task (the tab's button adds `?N` for them, the terminal's team line a
    "?", the session log the status "asking"), and unfolding it lists its questions above the brief; a long
    run's system notification says it is asking rather than finished.
  - **Skills**: twelve pack slots, two to a row. An empty one (＋) makes a
    pack and opens it: its name in a text field, saved as it is typed (one
    line, up to 24 characters), and twenty-four skill slots, each filled with the
    picker. The picker is made of buttons only, so it draws the same
    everywhere: first the group (the skill's plugin, or "no plugin", with
    how many each has), then the skills of that group ten at a time with
    ◀ ▶, built-ins left out; "← Back" goes one step back and "Empty
    slot" empties the slot. A press on a pack picks or unpicks it; "✎
    Editar" turns the packs into ✎ buttons that open them, where a pack is
    also picked or deleted (a second press confirms). Keys 1 to 9 press the
    first nine packs. "Loose skills" leads to the eight loose slots of
    earlier versions (the 0.7 `skillSlots` store key, read as it was), with
    the same ✎ Editar and keys 1 to 8. Resting the pointer on a slot or a
    pack shows its whole name and what it does; a skill the session no
    longer has shows ⚠ and is not sent. Packs and slots are kept in the
    plugin's store, which is yours and not a project's, so they are the same
    everywhere; the picks are kept per project folder (`armedByProject`, the
    40 most recent projects). Every prompt you type while something is
    picked carries one context line per kind: the loose skills are to be
    loaded (unless already loaded), the packs' skills are offered and only
    those the request needs are loaded. A skill picked loose is not offered
    again by a pack, and one in two picked packs is offered once. Prompts
    you did not type (notifications, peers, schedules) carry nothing.
  - **Instalaciones y procesos**: one line per job: its mark, what it is
    ("maven · build", "npm · install", "docker · download") and how
    long it took. Installs (npm, pnpm, yarn, bun, pip, uv, poetry, winget,
    choco, scoop, cargo, go, brew, apt, expo...), builds and tests (maven,
    gradle, npm run build/test, docker build, compose, pytest...) and
    downloads (docker pull, git clone, curl -o, wget), whoever runs them,
    plus every background shell under its own description. While one runs:
    a spinner in its owner's colour and a small moving bar; a background
    one shows the real percentage its output file prints (read every two
    seconds, files over 512 KB are not read). A foreground command's output
    only reaches the pane when it ends, so it shows no percentage. A build
    whose output says BUILD FAILURE counts as failed even when it exits 0.
  - **GitHub**: the branch, ahead/behind, uncommitted files and a ↻ button;
    links to the repository, the branch, its issues, pull requests and
    Actions, and "Crear PR" when the branch has none (not on main, master,
    develop, dev or trunk);
    the branch's pull request with its checks (passed, failed, running) and
    review, or its last workflow run; how many PRs wait for your review;
    and the last thing Claude did with git. git is read locally when the
    session starts, after a turn and after git commands; `gh` is asked when
    the session starts, after a push, a PR or a branch change, while CI is
    running (every two minutes, slowing to ten while nothing changes, and
    stopping after an hour, six while a check is really in progress), and
    with the button. It needs `gh` installed and signed in; without it the
    card still shows the local git state.
  - **Uso**: where the session's tokens go, in tokens only. The session's
    input, output, the share read from cache, turns and compactions; the
    context window now, as a bar by category and the top items under it
    (skills grouped by plugin, MCP tools by server, each memory file, each
    custom agent); then Claude against each role in fresh tokens and the
    team's share, the tools whose results added the most tokens, and the
    three turns with the most tokens. It reads the engine's own estimates
    (`/context`'s summary, never the token-count API), calls no model, and
    refreshes when the tab opens and after Claude's turns while it is shown.

The team: the four agents ship in `agents/` (`agent-team:explorer`,
`agent-team:implementer`, `agent-team:tester`, `agent-team:reviewer`), each
with its model, effort and the Skill tool. Their prompts read the brief's Goal
and Why first, load only the picked skills their task needs (not the
skill-loading lists of the person's CLAUDE.md, which are for the lead), stop
with a `QUESTIONS:` block when they lack something, and report in a short,
fixed form. An `agent.spawn` hook appends a `<team-context>` block to the
brief of a new spawn of those four types: the folder it runs in, the git
branch when that is the session's folder and HEAD is on one, and the picked
skills, loose and from packs. Forks, resumes, workflow agents, other types and
a brief that already ends with the block are left alone. A `tool.describe`
hook on the Agent tool puts the team's paragraph in place of the engine's
advice not to delegate unasked (or appends it, if the engine words it
otherwise); the Delegate switch stores `delegation` and drops the cached
answer, so a change reaches the next conversation without breaking the
prompt cache.

The Models block ("Modelos"), under the Delegate switch, chooses what each
role runs on: one row per role with its name, a model button (Haiku → Sonnet →
Opus) and an effort button (low → medium → high → xhigh → max), each
button showing its value and each press
moving to the next value, the columns lined up from row to row; "por defecto" marks a role still on what its agent
file says (explorer Haiku/low, implementer and tester Sonnet/medium, reviewer
Opus/high), and "Restablecer", shown once a role was moved, puts all four
back. A role moved up to Opus, or to an effort above its default, adds a
dim line: it uses more of the 5-hour and weekly limits. The
choice is yours, not a project's: it is kept in the plugin's store
(`teamModels`) for every project and session, the one copy every open window
reads and writes (a press applies to what the store holds, so another
window's choice is kept; quick presses are applied one after another, so none
is lost), and applies from the next spawn, with no restart. When the Agent
tool is described or called, the pane reads the store again, so a window
shows the choices another one made.
Only Agent tool calls are covered: a workflow script's `agent()` and a
plugin's `$.agent.spawn` run on the agent file's settings. A model that takes
no effort setting may ignore the chosen effort. A `tool.call` hook on the Agent tool
fills the call's `model` and `effort` from the role's choice when the role
was moved off its defaults; precedence: what the call names itself wins (Claude
passing `model: "opus"` for one task, as the team rules allow), then the
pane's choice, then the agent file. A role on its defaults, other agent types
and forks are called as Claude wrote them. The agent's row shows the model it
ran on. The team's paragraph in the Agent tool names each role's chosen model
(and its effort where that was moved), read from the store when the tool is
described; on the defaults it is the text earlier versions sent. A change
drops the cached text, so it reaches the next conversation.

Session log: when a session that used at least one team agent ends, the
`session.end` hook writes an entry to a file of its own,
`agent-team/runs/<YYYY-MM-DD>-<HHMM>-<session id start>.md`, in the Claude
config folder (`CLAUDE_CONFIG_DIR`, else `.claude` under the home folder),
creating the folders if missing. No other file is read, so two sessions
ending at the same moment write two files, and none is ever written over: a
name already taken gets a suffix (`-2`, `-3`...). The entry has the date,
folder and branch, one item per team agent (role, model, task, status, time,
rounds, tokens, warning) and the session's spend. An agent's time and tokens
add up all its rounds. The pane writes it itself, no model is involved. The
`sessionLog` option set to `false` writes nothing. A `runs.md` left by 0.8.6
or before is left as it is. Limits: the pane keeps the last 16 agents, so the
oldest agents of a very long session may be missing; after a `/clear` or a
resume the next entry holds only the agents that ran since the last one, and
an agent seen again (still running then, or woken since) shows its totals so
far, while the spend line counts only what is new; an end with too little of
its time left (the engine gives the whole end 1.5 s by default) writes nothing, and on a
real exit that entry is lost. The files are never pruned: delete old ones
when the folder gets long.

Rounds: a team agent woken again after it ended (a SendMessage continuation)
counts one round, shown as `↻n` on its row; from 5 on the row warns that
Claude should ask the user.

Language: every text the person sees comes from `hooks/i18n.ts`, which holds
an English and a Spanish table with the same keys. The `language` option picks
one (`en`, `es`); `auto`, the default, reads LC_ALL, LC_MESSAGES, LANG and
LANGUAGE, then the runtime's `Intl` locale, and uses Spanish only for a
Spanish locale. Text the model reads (briefs, the Agent tool's paragraph, the
team rules) stays English. The quotes in this README are the English texts.

Sounds: each role has its own short clip in `sounds/`, plus a soft one for
failures. Interrupted agents make no sound, and none plays while the ♪
switch is muted. On Windows the clip is played by
starting `powershell.exe` with `Media.SoundPlayer` (the engine has no audio
player there); elsewhere by the engine.

Rows whose end the pane missed are closed every 15 seconds from the engine's
own agent list, or after 10 minutes without news.

`/agent-team` hides or shows the pane, and the choice is remembered in later
sessions.

Updates: once a day (the `updateCheck` option) the pane asks GitHub for the
kit's latest release and, when it is newer, shows a chip with its link, the
commands and an "Update now" button; typing `/agent-team update` does the
same (only when you type it: not from a plugin, a schedule or a message).
Either asks GitHub again at once, skipping the day's cache, and with a newer
release runs `claude plugin marketplace update agent-team-kit` and `claude
plugin update agent-team@agent-team-kit` (no shell; on Windows, when `claude`
cannot be started by name, through `cmd.exe` once), then, once the
update has answered, runs `/reload-plugins` when the session lists it, or
tells you to run it (as it does when the reload is refused). From then on
the chip asks only for /reload-plugins, with no button, even when the daily
check finds the release again, until the plugins are reloaded. A step that fails
stops the update and says why; while it runs, the chip says so and a second
press does nothing. The mod calls no model and costs no tokens.

Resources: the drawing, usage band included, is a plain SVG image, not an
interactive frame: a frame keeps the wheel to itself and the pane would not
scroll with the pointer over it. Its SMIL animation still runs, and what
its gauges' tooltips said shows in a card under the pointer; its stars, title shimmer and bar glints move only
while something is working. The band shows wall-clock reset times, never a
countdown, so the drawing's markup does not change every minute. The cards
are text elements; their four pixel titles are plain images built once and
reused, so they add no frames. A one-second ticker redraws only while
something is alive, and a redraw in the same state yields the same markup,
so the animations are never restarted by the ticker. Every move (bobbing,
sweeps, the pulses along the wires, the bar glides, the confetti) is eased
in and out with SMIL splines and fades swell softly; a shake is a small
wobble that dies down rather than whole-pixel jumps. The sprites stay crisp
pixel art.

Code, in `hooks/`:

| File | What it holds |
| --- | --- |
| `register.tsx` | The hooks, wired to the engine's events; nothing else |
| `../agents/*.md` | The four team agents |
| `pane.tsx` | The pane's render: the drawing, the line under it and the cards |
| `drawing.ts` | The team drawing and its usage column, as SVG |
| `actions.ts` | Everything that acts through `$`: state writes, git and gh, sounds, notices, skill slots and packs |
| `state.ts` | Limits, timings, store keys, atoms' starts and shapes, and the pure logic over the team, the picks, the briefs and the waste warnings |
| `look.ts` | Colours, the pixel font, small SVG pieces and text helpers |
| `usage.ts`, `jobs.ts`, `github.ts` | Usage figures, job recognition, git and gh reading |

The engine lists the state a module touches from that module's own source,
so each module that reads or writes state declares its atoms there, with
the reference written literally; their starts and shape tags live in
`state.ts`. A function that takes `$` and is imported by another module is a
`function` declaration, not an arrow: the engine follows `$` across an
import only into one.

Tests: `claude plugin test <this folder>`. The clips are generated by a small
Python script (sine partials with soft decay), not recorded.
