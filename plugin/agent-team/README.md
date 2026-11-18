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
  and a red mark if it failed).
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
  the projection too). Past 80 % of the context a "Compactar contexto"
  button there compacts the conversation, as /compact does (not while a
  turn runs).
- When CI the pane was watching finishes, a toast and a sound say so
  ("CI ✓ en #42: 3 checks en verde"). A build, install, background shell
  or agent that ran over 30 seconds raises a system notification when it
  ends, for when you are in another window. When an API failure ends a
  turn, Claude's row says which ("la API cortó el turno: servidores
  saturados") until the next turn starts.
- Then a row of tabs, one card shown at a time: Equipo, Skills, Procesos
  and GitHub. A hidden tab's button carries a short count of its news
  (`Equipo ●2`, `Skills ✦3`, `Procesos ⟳1`, `GitHub ✗`), and the tab shown
  is kept in the store, so the next session opens on it. The card is titled
  like the drawing (its name in neon pixel letters) and framed in its colour.
  - **Equipo**: one line per member: Claude, then what each role used
    this session in fresh tokens and the team's share, then the recent
    agents, the whole history of 16. A working one reads "trabajando…" with
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
    (`git diff --shortstat HEAD`, read off the spawn's path). At the foot,
    the "Delegar" switch (see The team, below).
  - **Skills**: twelve pack slots, two to a row. An empty one (＋) makes a
    pack and opens it: its name in a text field, saved as it is typed (one
    line, up to 24 characters), and twenty-four skill slots, each filled with the
    picker. The picker is made of buttons only, so it draws the same
    everywhere: first the group (the skill's plugin, or "sin plugin", with
    how many each has), then the skills of that group ten at a time with
    ◀ ▶, built-ins left out; "← Volver" goes one step back and "Vaciar
    hueco" empties the slot. A press on a pack picks or unpicks it; "✎
    Editar" turns the packs into ✎ buttons that open them, where a pack is
    also picked or deleted (a second press confirms). Keys 1 to 9 press the
    first nine packs. "Skills sueltas" leads to the eight loose slots of
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
    ("maven · build", "npm · instalación", "docker · descarga") and how
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
    the session starts, after a push, a PR or a branch change, every two
    minutes only while CI is running, and with the button. It needs `gh`
    installed and signed in; without it the card still shows the local git
    state.

The team: the four agents ship in `agents/` (`agent-team:explorer`,
`agent-team:implementer`, `agent-team:tester`, `agent-team:reviewer`), each
with its model, effort and the Skill tool. Their prompts read the brief's Goal
and Why first, load only the picked skills their task needs (not the
skill-loading lists of the person's CLAUDE.md, which are for the lead), stop
with a `PREGUNTAS:` block when they lack something, and report in a short,
fixed form. An `agent.spawn` hook appends a `<team-context>` block to the
brief of a new spawn of those four types: the folder it runs in, the git
branch when that is the session's folder and HEAD is on one, and the picked
skills, loose and from packs. Forks, resumes, workflow agents, other types and
a brief that already ends with the block are left alone. A `tool.describe`
hook on the Agent tool puts the team's paragraph in place of the engine's
advice not to delegate unasked (or appends it, if the engine words it
otherwise); the "Delegar" switch stores `delegation` and drops the cached
answer, so a change reaches the next conversation without breaking the
prompt cache.

Sounds: each role has its own short clip in `sounds/`, plus a soft one for
failures. Interrupted agents make no sound. On Windows the clip is played by
starting `powershell.exe` with `Media.SoundPlayer` (the engine has no audio
player there); elsewhere by the engine.

Rows whose end the pane missed are closed every 15 seconds from the engine's
own agent list, or after 10 minutes without news.

`/agent-team` hides or shows the pane, and the choice is remembered in later
sessions. The mod calls no model and costs no tokens.

Resources: the drawing, usage band included, is a plain SVG image, not an
interactive frame: a frame keeps the wheel to itself and the pane would not
scroll with the pointer over it. Its SMIL animation still runs, and what
its gauges' tooltips said shows in a card under the pointer; its stars, title shimmer and bar glints move only
while something is working. The band shows wall-clock reset times, never a
countdown, so the drawing's markup does not change every minute. The cards
are text elements; their four pixel titles are plain images built once and
reused, so they add no frames. A one-second ticker redraws only while
something is alive.

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
