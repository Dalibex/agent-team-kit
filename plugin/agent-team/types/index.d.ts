export type Role = 'main' | 'explorer' | 'implementer' | 'tester' | 'reviewer' | 'other'

/** One run's token counts, split the way they are billed. */
export type Tokens = {
  input: number
  output: number
  /** Cache reads: billed at a fraction of fresh input. */
  cacheRead: number
  /** Cache writes: billed a little above fresh input. */
  cacheWrite: number
}

/** `stopped`: interrupted, killed, or given up on after going quiet. */
export type AgentStatus = 'running' | 'done' | 'failed' | 'stopped'

export type AgentRow = {
  id: string
  type: string
  role: Role
  description: string
  /** The brief it was given, clipped; shown when the row is expanded. */
  prompt: string
  startedAt: number
  endedAt?: number
  calls: number
  lastTool?: string
  /** When it last used a tool: what tells a quiet agent from a lost one. */
  lastActiveAt: number
  status: AgentStatus
  /** Why it ended without answering, when the pane knows. */
  endNote?: string
  /** Closed from the engine's agent list before its own turn.complete arrived. */
  closedByList?: boolean
  /** The model it runs on, as the engine resolved it at spawn. */
  model?: string
  /** What its run used, once it ended. */
  tokens?: Tokens
  /** The agent's final report, clipped: what it handed back when it ended. */
  answer?: string
  /** A way the pane saw this spawn waste tokens, in words, shown on its row. */
  warn?: string
  /** The skills it loaded with the Skill tool in this run, in the order it loaded them. */
  skills?: string[]
  /** Times it was woken again after it had ended (a SendMessage continuation). */
  rounds?: number
  /** Time worked in the rounds before the current one, in ms: a wake-up resets `startedAt`, this keeps the earlier work. */
  workedMs?: number
  /** Tokens used in the rounds before the current one: a wake-up clears `tokens`, this keeps the earlier work. */
  spent?: Tokens
  /** The engine's id of its current or last turn: an end under another id is a round whose start was missed. */
  turnId?: string
  /** The questions of its last report, when that report opened with `QUESTIONS:`: it waits for answers until woken again. */
  questions?: string[]
  /** Set while the current round was woken to answer its questions; cleared when it ends. */
  answering?: boolean
}

/** What the session log already holds, so a later entry (after /clear or a resume, the process living on) repeats nothing. */
export type LoggedMark = {
  /** The role totals when it was last written. */
  totals: Partial<Record<Role, RoleTotal>>
  /** A key of each agent row as it was written: its rounds, status and end. */
  rows: Record<string, string>
}

/** What a long command is: a package install, a build or test run, or a download. */
export type JobKind = 'install' | 'build' | 'download'

/** A command recognised as a long job: its kind, its tool and what it works on. */
export type JobMatch = {
  kind: JobKind
  /** The tool that runs it: npm, pip, mvn, docker... */
  manager: string
  /** What it installs, builds or fetches, in a few words. */
  target: string
}

/** A background shell (Bash or PowerShell) started by Claude or one of its agents. */
export type ShellTask = {
  id: string
  /** The agent that started it; absent for the main Claude's own shells. */
  owner?: { id: string; role: Role }
  /** The background task id the tool answered with; what its notification names. */
  taskId?: string
  tool: string
  description: string
  command: string
  startedAt: number
  endedAt?: number
  /** The status its task notification reported (completed, failed, ...). */
  outcome?: string
  /** How the id was learnt and how the end was matched: for the unfolded row. */
  diag: string
  /** Set when the command is an install, build or download. */
  job?: JobMatch
  /** The file the engine writes its output to, when the tool said where. */
  outputPath?: string
  /** The last percentage its output printed, 0 to 100. */
  progress?: number
  /** When its output file was last seen to grow: a shell with news is still running, however long ago it started. */
  lastNewsAt?: number
}

/** An install, build or download run in the foreground: it ends with the tool call. */
export type ForegroundJob = JobMatch & {
  id: string
  owner?: { id: string; role: Role }
  tool: string
  command: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'failed' | 'stopped'
}

/** The main Claude's own loop: working while a turn of its runs. */
export type MainLoop = {
  status: 'idle' | 'working'
  since: number
  calls: number
  lastTool?: string
  lastDetail?: string
  /** When the session opened: the count of a quiet minute starts there. */
  openedAt?: number
  /** When the last turn ended, whatever the reason; cleared when the next turn starts. */
  endedAt?: number
  /** Whether that turn ended with an answer: only then the drawing checks Claude off. */
  endedOk?: boolean
  /** The last tool calls of the current turn, newest last. */
  log: string[]
  /** The distinct files Claude itself read this turn, the ones it also edited or wrote left out. */
  reads: string[]
  /** The files Claude edited or wrote this turn: reading one is part of the edit, not exploring. */
  edited?: string[]
  /** Whether Claude sent the explorer this turn. */
  hasAskedExplorer: boolean
  /** What the last finished turn used. */
  lastTokens?: Tokens
  /** Why the API cut the last turn short, in words; cleared when the next turn starts. */
  apiError?: string
  /** The skills Claude loaded with the Skill tool in this turn (the last one, while idle). */
  skills?: string[]
}

/** One role's runs this session and the fresh tokens they used (cache reads left out). */
export type RoleTotal = { runs: number; tokens: number }

export type Team = {
  agents: AgentRow[]
  shells: ShellTask[]
  /** Installs, builds and downloads run in the foreground, newest last. */
  jobs: ForegroundJob[]
  main: MainLoop
  /** The last task notifications seen, clipped: a trace for the unfolded rows. */
  notices: string[]
  /** Keys of the notifications already handled: one notice may arrive by several paths. */
  seen: string[]
  /** Per role, this session: kept apart from the rows, which are trimmed. */
  totals: Partial<Record<Role, RoleTotal>>
}

/** One rate-limit window: five_hour, seven_day or a gateway's spend_limit. */
export type LimitWindow = {
  kind: string
  /** 0 to 100, past 100 on an exceeded spend limit. */
  percent: number
  /** When it resets, in clock milliseconds. */
  resetsAt?: number
}

/**
 * The readings of the five-hour window since it opened, oldest first, as
 * `[clock ms, percent]`: what its trend line and its projection are drawn from.
 */
export type Trail = {
  /** The window the points belong to; a new reset starts a new trail. */
  resetsAt?: number
  points: [number, number][]
}

/** The account's limits and the context window, as the engine last measured them. */
export type Usage = {
  /** When the figures were taken; 0 before the first measurement. */
  at: number
  windows: LimitWindow[]
  context?: { percent?: number; tokens?: number; window: number }
  /** The five-hour window's readings, kept across sessions. */
  trail?: Trail
}

/** A CI summary: how many checks passed, failed and are still running. */
export type Checks = {
  ok: number
  failed: number
  pending: number
  /** Of the pending ones, those GitHub still waits to hear of (EXPECTED): nothing is running for them. */
  waiting?: number
  /** The first check that failed, with the page of its log, when GitHub gave one. */
  firstFailure?: { name: string; url: string }
}

/** What Claude did with git this session, as the Bash tool reported it. */
export type GitOp = { at: number; text: string; url?: string }

/** The repository the session works in, as git and gh describe it. */
export type GitInfo = {
  /**
   * `unknown` before the first look; `none` outside a git repository;
   * `ok` with the fields below; `error` when git itself failed.
   */
  state: 'unknown' | 'none' | 'ok' | 'error'
  /** When it was last read; 0 before the first look. */
  at: number
  /** When gh was last asked; GitHub figures are older than `at` between two asks. */
  remoteAt: number
  isLoading: boolean
  /** owner/name, when the origin remote is on GitHub. */
  repo?: string
  branch?: string
  /** HEAD is detached: there is no branch to name. */
  detached?: boolean
  ahead: number
  behind: number
  /** Changed or untracked files in the working tree. */
  dirty: number
  pr?: {
    number: number
    title: string
    url: string
    isDraft: boolean
    /** APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED or '' as gh spells it. */
    review: string
    checks: Checks
    /** Set when the PR is no longer open: its checks are history, not live. */
    ended?: 'merged' | 'closed'
    /** Each check's status and conclusion as one text: it differs when a check moves on, though the counts do not. */
    stamp?: string
  }
  /** When the CI figures (checks or run) last changed; the polling backs off from it. */
  ciChangedAt?: number
  /** The last workflow run on the branch, when it has no pull request. */
  run?: { name: string; status: string; conclusion: string; url: string }
  /** Pull requests that wait for the person's review. */
  reviewRequested: number
  /** The person's own open pull requests. */
  mine: number
  /** Why gh gave nothing (missing, signed out, offline). */
  remoteError?: string
  /** Why git gave nothing. */
  error?: string
  /** The last things Claude did with git, newest last. */
  ops: GitOp[]
}

declare module 'claude-code' {
  interface PluginState {
    'agent-team': {
      team: Shaped<Team>
      now: number
      expanded: string[]
      usage: Shaped<Usage>
      git: Shaped<GitInfo>
      /** The tab shown under the drawing; kept in `$.store` across sessions. */
      tab: 'team' | 'skills' | 'jobs' | 'github' | 'usage'
      /** The eight skill slots, a slash command's name or null; mirrored in `$.store`, so global. */
      slots: (string | null)[]
      /** The slot skills picked: every prompt the person sends carries them until they are unpicked. */
      armed: string[]
      /** The pack slots, a pack or null; mirrored in `$.store`, so global. */
      packs: (Pack | null)[]
      /** The ids of the packs picked: every prompt offers their skills until they are unpicked. */
      armedPacks: string[]
      /** The session's project, as the picks are kept by: its folder, normalised; '' before the start. */
      project: string
      /** The session's folder as the engine gave it, for the team's briefs; '' before the start. */
      cwd: string
      /** What a slot can hold: the session's own slash commands and skills, built-ins left out. */
      choices: SkillChoice[]
      /** The slot being filled, while its picker is open. */
      picker: SlotPicker | null
      /** Whether the Agent tool carries the team's paragraph; kept in `$.store`, read when a session draws the tool. */
      delegation: boolean
      /** A newer release than the one running, once the day's check found one; null otherwise. */
      update: UpdateNotice | null
      /** What the skills tab shows: the packs, the loose skills, or one pack open to be edited. */
      skillView: SkillView
      /** What the session log already holds; empty until the first entry is written. */
      logged: LoggedMark
      /** Where the session's tokens go: the context breakdown and what the hooks counted; no money, no model call. */
      stats: Shaped<Stats>
      /** The model and effort each team role runs on; mirrored in `$.store`, so global. */
      models: TeamModels
      /** Whether the pane plays its sounds; kept in `$.store` across sessions. */
      soundOn: boolean
      /** Whether the pane raises system notifications; kept in `$.store` across sessions. */
      notifyOn: boolean
      /** True while "Update now" runs: the chip shows it and a second press does nothing. */
      updating: boolean
    }
  }
}

/** A model the pane offers a team role, as the Agent tool's `model` names it. */
export type TeamModel = 'haiku' | 'sonnet' | 'opus'

/** An effort level the pane offers a team role, as the Agent tool's `effort` names it. */
export type TeamEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** What one team role runs on. */
export type ModelChoice = { model: TeamModel; effort: TeamEffort }

/** The four roles of the team's own agents. */
export type TeamRole = 'explorer' | 'implementer' | 'tester' | 'reviewer'

/** The team roles' choices, each one of the four. */
export type TeamModels = Record<TeamRole, ModelChoice>

/** The newest release of the kit, when it is newer than the plugin that is running. */
export type UpdateNotice = { version: string; url: string }

/** A named set of skills: picking it offers them all to the model, which loads the ones a request needs. */
export type Pack = {
  /** Stable across renames and moves, so a pick survives them. */
  id: string
  /** What the person called it; '' until named. */
  name: string
  /** Its skill slots, a slash command's name or null. */
  skills: (string | null)[]
}

/** The picks of one project, kept across sessions. */
export type ArmedEntry = {
  /** Loose skills picked. */
  skills: string[]
  /** Pack ids picked. */
  packs: string[]
  /** When they last changed: the oldest projects are dropped first. */
  at: number
}

/** A slash command or skill a slot can hold. */
export type SkillChoice = { name: string; description: string }

/**
 * The picker of one slot: first a group (a plugin, or none), then a page of
 * its skills. The slot is a loose one, or one of the pack `pack` names.
 */
export type SlotPicker = { slot: number; pack?: string; group?: string; page: number }

/** The skills tab's view. */
export type SkillView = { kind: 'packs' } | { kind: 'loose' } | { kind: 'pack'; id: string }

/** One line of the usage tab's lists: a plugin, a server, a file or an agent, its tokens and how many items it groups. */
export type StatItem = { name: string; tokens: number; count?: number }

/** One row of the context window's breakdown. */
export type ContextRow = { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' }

/** The context window as the engine's summary breakdown counted it (estimates), trimmed to what the tab draws. */
export type ContextView = {
  /** Tokens in use and the window they are measured against. */
  used: number
  window: number
  rows: ContextRow[]
  /** Skills grouped by plugin (else by source), MCP tools by server (loaded ones), memory files, custom agents; biggest first. */
  skills: StatItem[]
  mcp: StatItem[]
  /** MCP tools not loaded yet (their schemas wait to be asked for). */
  mcpDeferred: number
  memory: StatItem[]
  agents: StatItem[]
}

/** One main turn, kept while it is among the three that used most. */
export type TurnStat = { n: number; tokens: number; ms: number; prompt?: string }

/** Where the session's tokens go, as the hooks counted them. */
export type Stats = {
  /** The last breakdown; undefined until the first one was read. */
  context?: ContextView
  /** Every turn of the session, agents' included: uncached input, cache writes and reads, output. */
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
  /** Claude's own turns, and the compactions that ran. */
  turns: number
  compactions: number
  /** The first words of the prompt the running turn answers. */
  prompt?: string
  /** Per tool name, the estimated tokens its results added (length / 4) and its calls; bounded. */
  tools: Record<string, { tokens: number; calls: number }>
  /** The three most expensive main turns, biggest first. */
  top: TurnStat[]
}
