// The pane's state (atoms and store keys), its limits and timings, and the pure logic over the team.

import type { AgentRow, AgentStatus, ArmedEntry, ForegroundJob, JobMatch, MainLoop, Pack, Role, RoleTotal, ShellTask, SkillChoice, SkillView, SlotPicker, Team, Tokens } from '../types'
import { opsOf } from './github'
import { classify, KIND_TEXT, looksFailed, outputPathOf } from './jobs'
import { kilo } from './usage'
import { FAIL_SOUND, LOOK, WARN } from './look'

export const PANE = 'agent-team'
export const COMMAND = 'agent-team'
/** Kept in `$.store` across sessions: false once the pane was hidden with the command. */
export const OPEN_KEY = 'isOpen'
/** Kept in `$.store` across sessions: the usage warnings already shown, per window and reset. */
export const WARNED_KEY = 'warned'
/** Kept in `$.store` across sessions: the five-hour window's readings, so its trend survives a new session. */
export const TRAIL_KEY = 'trail5h'
/** A job, shell or agent that ran this long raises a system notification when it ends. */
export const LONG_MS = 30 * 1000
/** Kept in `$.store`, which is the user's and not a project's: the skill slots, the same everywhere. */
export const SLOTS_KEY = 'skillSlots'
export const SLOT_COUNT = 8
/** Kept in `$.store`, global like the slots: the packs, each with its own skill slots. */
export const PACKS_KEY = 'skillPacks'
export const PACK_COUNT = 12
export const PACK_SIZE = 24
/** Longest pack name kept; the pixel-free button shows it whole up to this. */
export const PACK_NAME_MAX = 24
/** Kept in `$.store`: the picks, per project, so a pack picked in one project stays out of the others. */
export const ARMED_KEY = 'armedByProject'
/** Projects whose picks are kept; the ones untouched longest are dropped first. */
export const ARMED_PROJECTS = 40
/** The `expanded` id that turns the skill slots into pickers. */
export const SKILLS_EDIT = 'skills-edit'
/**
 * Where a prompt typed by the person comes from: their Enter at the prompt,
 * the desktop's bridge, an SDK host. Notifications, peers, schedules and
 * plugins are left alone: a picked skill is for the person's own next prompt.
 */
export const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

export const IDLE_MAIN: MainLoop = { status: 'idle', since: 0, calls: 0, log: [], reads: [], hasAskedExplorer: false }
export const EMPTY: Team = { agents: [], shells: [], jobs: [], main: IDLE_MAIN, notices: [], seen: [], totals: {} }

// The engine reads which state a module touches from that module's own source,
// so each module that reads or writes the pane's state declares its atoms there,
// the reference written literally. What they start from and their shape tags
// live here, once. Change a tag when a value's fields change: it declines what
// an earlier version stored, which outlives a reload.
export const TEAM_SHAPE = 'team-12'
export const USAGE_SHAPE = 'usage-2'
export const GIT_SHAPE = 'git-1'
export const NO_IDS: string[] = []
export const NO_SLOTS: (string | null)[] = Array.from({ length: SLOT_COUNT }, () => null)
export const NO_PACKS: (Pack | null)[] = Array.from({ length: PACK_COUNT }, () => null)
export const NO_CHOICES: SkillChoice[] = []
export const NO_PICKER: SlotPicker | null = null
export const PACKS_VIEW: SkillView = { kind: 'packs' }
/** The `expanded` id that asks a pack's deletion to be pressed again. */
export const packDeleteAsk = (id: string): string => `pack-delete-${id}`
// Change the tag when a row's fields change: it declines what an earlier

/** The tabs under the drawing, each one card, in the order their buttons are drawn. */
export type CardId = 'team' | 'skills' | 'jobs' | 'github'
export const TABS: readonly CardId[] = ['team', 'skills', 'jobs', 'github']
/** Kept in `$.store` across sessions: the tab last shown. */
export const TAB_KEY = 'tab'
export const FIRST_TAB: CardId = 'team'
/** A tab read back from the store, whatever it held. */
export const tabFrom = (value: unknown): CardId | undefined => TABS.find(id => id === value)

export const PULSE_MS = 2500
export const AFTERGLOW_MS = 6000
/** A background shell with no news for this long is no longer drawn as running. */
export const SHELL_MS = 60 * 60 * 1000
export const SHELL_DONE_MS = 2 * 60 * 1000
export const LOG_LINES = 10
/** Rows kept: running ones always stay, the oldest finished ones leave first. */
export const HISTORY = 16
export const SHOWN_ROWS = 16
/** How often running rows are checked against the engine's own agent list. */
export const RECONCILE_MS = 15 * 1000
/** A running row the engine no longer lists, quiet this long, is given up on. */
export const STALE_MS = 10 * 60 * 1000
/** The delegation rule in CLAUDE.md: reading more files than this is the explorer's job. */
export const READ_LIMIT = 5
/** Two endings this close together play one sound. */
export const CHIME_GAP_MS = 400
/** Foreground jobs kept: running ones always stay. */
export const JOB_HISTORY = 12
/** Rows the jobs card shows at most. */
export const JOB_ROWS = 12
/** How often a background job's output file is read for its progress. */
export const TAIL_MS = 2000
/** An output file past this size is not read: one read copies it whole, every two seconds. */
export const TAIL_MAX_BYTES = 512 * 1024
/** How often GitHub is asked again while a check or a run is still going. */
export const CI_POLL_MS = 2 * 60 * 1000
/** A finished main turn reads git again (locally) at most this often. */
export const GIT_LOCAL_MS = 15 * 1000
/** Shell commands that touch git or GitHub: the card is read again shortly after. */
export const TOUCHES_GIT = /(^|[\s;&|(])(git|gh)\s/
/** Stopped shells are grey like stopped agents; only real failures are red. */
export const isShellStop = (outcome: string): boolean => outcome === 'killed' || outcome === 'stopped'

export const roleOf = (type: string): Role => {
  const t = type.toLowerCase()
  if (t.includes('explorer') || t === 'explore') return 'explorer'
  if (t.includes('implementer')) return 'implementer'
  if (t.includes('tester')) return 'tester'
  if (t.includes('reviewer')) return 'reviewer'
  return 'other'
}

/** How a turn's reason reads as a row's end: an interrupt is a stop, not a failure. */
export const statusOfTurn = (reason: 'answer' | 'aborted' | 'refusal' | 'error'): AgentStatus =>
  reason === 'answer' ? 'done' : reason === 'aborted' ? 'stopped' : 'failed'

/**
 * The end the engine's list reports for an agent, or undefined while it lives.
 * `idle` is a teammate between turns: done for now (one in a terminal pane of
 * its own sends no turn.complete here at all).
 */
export const statusOfListed = (status: string): AgentStatus | undefined =>
  status === 'completed' || status === 'idle'
    ? 'done'
    : status === 'failed'
      ? 'failed'
      : status === 'killed'
        ? 'stopped'
        : undefined

/** `claude-haiku-5-5` reads as `haiku`; an unknown id stays as it is. */
export const familyOf = (model: string | undefined): string | undefined => {
  if (model === undefined || model === '') return undefined

  return /haiku|sonnet|opus|fable/i.exec(model)?.[0].toLowerCase() ?? model
}

export const isAlive = (t: Team, at: number): boolean =>
  t.main.status === 'working' ||
  t.agents.some(
    a =>
      a.status === 'running' ||
      (a.endedAt !== undefined && at - a.endedAt < AFTERGLOW_MS),
  ) ||
  t.shells.some(s => isShellShown(s, at)) ||
  t.jobs.some(j => j.status === 'running')

/**
 * Adds rows, or fills in the ones already there by id (a spawn the pane
 * adopted before it heard of it, or a resume). A merge only adds what the new
 * row knows: it never touches status or end fields, so it cannot undo an end.
 * An empty prompt (a resume's) keeps the brief already there. Past HISTORY
 * the oldest finished rows leave; running ones always stay.
 */
export const withRows = (agents: AgentRow[], rows: AgentRow[]): AgentRow[] => {
  const fresh = new Map(rows.map(r => [r.id, r]))
  const merged = agents.map(a => {
    const r = fresh.get(a.id)
    if (r === undefined) return a
    fresh.delete(a.id)

    return {
      ...a,
      type: r.type,
      role: r.role,
      description: r.description,
      prompt: r.prompt === '' ? a.prompt : r.prompt,
      model: r.model ?? a.model,
    }
  })
  const all = [...merged, ...fresh.values()]
  let excess = all.length - HISTORY

  return all.filter(a => {
    if (excess <= 0 || a.status === 'running') return true
    excess -= 1

    return false
  })
}

/** Ends a running row once and adds its run to its role's session total. */
export const closeRow = (
  t: Team,
  id: string,
  end: Partial<AgentRow> & { status: AgentStatus; endedAt: number },
): Team => {
  const row = t.agents.find(a => a.id === id && a.status === 'running')
  if (row === undefined) return t
  const closed: AgentRow = { ...row, ...end }

  return {
    ...t,
    agents: t.agents.map(a => (a === row ? closed : a)),
    totals: addRun(t.totals, row.role, closed.tokens),
  }
}

export const addRun = (totals: Team['totals'], role: Role, tokens: Tokens | undefined, runs = 1): Team['totals'] => {
  const before: RoleTotal = totals[role] ?? { runs: 0, tokens: 0 }

  return { ...totals, [role]: { runs: before.runs + runs, tokens: before.tokens + (tokens === undefined ? 0 : freshOf(tokens)) } }
}

/**
 * Records an agent's own end. A running row closes as usual; a row the
 * engine's list closed first gets the turn's real status, tokens and report,
 * its tokens added to the totals but not a second run.
 */
export const endRow = (t: Team, id: string, end: Partial<AgentRow> & { status: AgentStatus; endedAt: number }): Team => {
  const row = t.agents.find(a => a.id === id)
  if (row === undefined) return t
  if (row.status === 'running') return closeRow(t, id, end)
  if (row.closedByList !== true) return t
  const filled: AgentRow = { ...row, ...end, endedAt: row.endedAt, closedByList: undefined }

  return {
    ...t,
    agents: t.agents.map(a => (a === row ? filled : a)),
    totals: addRun(t.totals, row.role, end.tokens, 0),
  }
}

/** Adds a shell; past six, finished shells leave first so a running one is never dropped. */
export const withShell = (shells: ShellTask[], shell: ShellTask): ShellTask[] => {
  const all = [...shells, shell]
  let excess = all.length - 6

  return all.filter(sh => {
    if (excess <= 0 || sh.endedAt === undefined) return true
    excess -= 1

    return false
  })
}

export const isShellRunning = (s: ShellTask, at: number): boolean =>
  s.endedAt === undefined && at - s.startedAt < SHELL_MS

export const isShellShown = (s: ShellTask, at: number): boolean =>
  s.endedAt === undefined ? at - s.startedAt < SHELL_MS : at - s.endedAt < SHELL_DONE_MS

export type ApiUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export const tokensOf = (u: ApiUsage | undefined): Tokens | undefined =>
  u === undefined
    ? undefined
    : {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens,
        cacheWrite: u.cache_creation_input_tokens,
      }

/** Fresh tokens: what a run really weighs, cache reads (billed at a fraction) left out. */
export const freshOf = (t: Tokens): number => t.input + t.output + t.cacheWrite

/** Claude read more files this turn than the rule allows, without sending the explorer. */
export const isOverReading = (m: MainLoop): boolean => m.reads.length > READ_LIMIT && !m.hasAskedExplorer

/** How each kind of API failure reads on Claude's row: what happened and, where it helps, what to do. */
const API_ERROR_TEXT: Record<string, string> = {
  rate_limit: 'la API cortó el turno: límite de uso alcanzado',
  overloaded: 'la API cortó el turno: servidores saturados, prueba en un rato',
  server_error: 'la API cortó el turno: error del servidor',
  authentication_failed: 'la API cortó el turno: vuelve a iniciar sesión',
  oauth_org_not_allowed: 'la API cortó el turno: tu organización no permite esta cuenta',
  billing_error: 'la API cortó el turno: problema de facturación',
  invalid_request: 'la API cortó el turno: petición no válida',
  model_not_found: 'la API cortó el turno: modelo no disponible',
  max_output_tokens: 'la respuesta se cortó por larga',
}

/** An API failure's kind, as StopFailure names it, in the row's words. */
export const apiErrorText = (kind: string): string => API_ERROR_TEXT[kind] ?? `la API cortó el turno (${kind})`

/** Builds a shell row from a background Bash or PowerShell call and its answer. */
export const shellOf = (
  e: { tool: string; tool_use_id?: string; command: string; description?: string },
  ran: { result?: unknown; text?: string },
  at: number,
  owner?: { id: string; role: Role },
): ShellTask => {
  const answered = (ran.result ?? undefined) as Record<string, unknown> | undefined
  const fromResult =
    typeof answered?.backgroundTaskId === 'string' ? answered.backgroundTaskId : undefined
  // Only an id written as "ID: x" or "task id: x": a loose match took the next
  // word ("task running" gave "running") and the shell never closed by id.
  const fromText = /\b(?:task\s+id|task|ID)\s*[:=#]\s*([A-Za-z0-9_-]{4,})/i.exec(ran.text ?? '')?.[1]
  const taskId = fromResult ?? fromText
  const diag =
    taskId === undefined
      ? `no task id; result keys: ${Object.keys(answered ?? {}).join(', ') || 'none'}; text: ${(ran.text ?? '').slice(0, 80)}`
      : `task id ${taskId} (${fromResult !== undefined ? 'from result' : 'from text'})`
  const job = classify(e.command)
  const outputPath = outputPathOf(ran.text)

  return {
    id: e.tool_use_id ?? String(at),
    owner,
    taskId,
    tool: e.tool,
    description: e.description ?? e.command.slice(0, 80),
    command: e.command,
    startedAt: at,
    diag,
    ...(job === undefined ? {} : { job }),
    ...(outputPath === undefined ? {} : { outputPath }),
  }
}

/** Adds a foreground job; past JOB_HISTORY, finished ones leave first. */
export const withJob = (jobs: ForegroundJob[], job: ForegroundJob): ForegroundJob[] => {
  const all = [...jobs, job]
  let excess = all.length - JOB_HISTORY

  return all.filter(j => {
    if (excess <= 0 || j.status === 'running') return true
    excess -= 1

    return false
  })
}

/**
 * Stops the foreground jobs of a loop (Claude's, or one agent's) still
 * marked running when its turn ends. A foreground call always ends before
 * its turn does, so such a job lost its end: a reload mid-call, or a hook
 * the engine abandoned. Left alone, it would spin and keep the ticker busy.
 */
export const stopLeftovers = (jobs: ForegroundJob[], loop: string | undefined, at: number): ForegroundJob[] =>
  jobs.some(j => j.status === 'running' && j.owner?.id === loop)
    ? jobs.map(j => (j.status === 'running' && j.owner?.id === loop ? { ...j, status: 'stopped', endedAt: at } : j))
    : jobs

/** How a finished foreground call ended, as its job's status. */
export const jobEndOf = (ran: { deny?: string; isError?: true; text?: string; result?: unknown }): ForegroundJob['status'] => {
  if (ran.deny !== undefined) return 'stopped'
  const result = (ran.result ?? {}) as { stdout?: unknown; stderr?: unknown; interrupted?: unknown }
  if (result.interrupted === true) return 'stopped'
  const output =
    ran.isError === true
      ? (ran.text ?? '')
      : `${typeof result.stdout === 'string' ? result.stdout : ''}\n${typeof result.stderr === 'string' ? result.stderr : ''}`
  // A command piped through `tail` or `| cat` exits 0 whatever the build did:
  // its own verdict in the output counts too.
  return ran.isError !== true && !looksFailed(output) ? 'done' : 'failed'
}

/** One short line saying what a tool call touches, for the lead's log. */
export const detailOf = (e: { tool: string } & Record<string, unknown>): string => {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  switch (e.tool) {
    case 'Bash':
    case 'PowerShell':
      return str(e.description) || str(e.command).slice(0, 80)
    case 'Read':
    case 'Edit':
    case 'Write':
      return str(e.file_path).split(/[\\/]/).slice(-2).join('/')
    case 'Grep':
    case 'Glob':
      return str(e.pattern)
    default:
      return str(e.description)
  }
}

/** The file a Read call opens, or undefined for any other call. */
export const readPathOf = (e: { tool: string } & Record<string, unknown>): string | undefined =>
  e.tool === 'Read' && typeof e.file_path === 'string' ? e.file_path.replace(/\\/g, '/').toLowerCase() : undefined

/** The clip for how something ended: its role's own, a soft one for a failure, none for a stop. */
export const soundFor = (role: Role, status: AgentStatus): string | undefined =>
  status === 'done' ? LOOK[role].sound : status === 'failed' ? FAIL_SOUND : undefined

/** The clip for a background shell's end: its owner's sound, a soft one on failure. */
export const shellSound = (sh: ShellTask): string | undefined =>
  sh.outcome === 'completed' ? LOOK[sh.owner?.role ?? 'main'].sound : sh.outcome === 'failed' ? FAIL_SOUND : undefined

/** Each role's fresh tokens this session, cache reads left out: "Claude 1.2k (1 turno) · explorer 3.0k (1×)". */
export const sessionTokensOf = (t: Team): string =>
  (['main', 'explorer', 'implementer', 'tester', 'reviewer', 'other'] as const)
    .filter(role => t.totals[role] !== undefined)
    .map(role => {
      const total = t.totals[role] as RoleTotal
      const runs = role === 'main' ? `${total.runs} turno${total.runs === 1 ? '' : 's'}` : `${total.runs}×`

      return `${LOOK[role].name} ${kilo(total.tokens)} (${runs})`
    })
    .join(' · ')

/** One row of the jobs card: a foreground job or a background shell, alike. */
export type JobRow = {
  id: string
  /** The tool and the kind of job ("maven · build"); a plain shell's own description. */
  title: string
  state: 'running' | 'done' | 'failed' | 'stopped'
  owner?: { id: string; role: Role }
  startedAt: number
  endedAt?: number
  /** The last percentage a background job's output printed. */
  progress?: number
}

export const titleOf = (job: JobMatch): string => `${job.manager} · ${KIND_TEXT[job.kind]}`

/**
 * The jobs card's rows: running ones first, then the latest ended. A
 * background shell that is not a job shows only while fresh.
 */
export const jobRowsOf = (t: Team, at: number): JobRow[] => {
  const fromJobs = t.jobs.map(
    (j): JobRow => ({
      id: j.id,
      title: titleOf(j),
      state: j.status,
      ...(j.owner === undefined ? {} : { owner: j.owner }),
      startedAt: j.startedAt,
      ...(j.endedAt === undefined ? {} : { endedAt: j.endedAt }),
    }),
  )
  const fromShells = t.shells
    .filter(sh => sh.job !== undefined || isShellShown(sh, at))
    .map((sh): JobRow => {
      const outcome = sh.outcome ?? 'completed'
      const state: JobRow['state'] =
        sh.endedAt === undefined
          ? isShellRunning(sh, at)
            ? 'running'
            : 'stopped'
          : outcome === 'completed'
            ? 'done'
            : isShellStop(outcome)
              ? 'stopped'
              : 'failed'

      return {
        id: sh.id,
        title: sh.job === undefined ? sh.description : titleOf(sh.job),
        state,
        ...(sh.owner === undefined ? {} : { owner: sh.owner }),
        startedAt: sh.startedAt,
        ...(sh.endedAt === undefined ? {} : { endedAt: sh.endedAt }),
        ...(sh.progress === undefined ? {} : { progress: sh.progress }),
      }
    })
  const all = [...fromJobs, ...fromShells]
  const running = all.filter(r => r.state === 'running').sort((a, b) => b.startedAt - a.startedAt)
  const ended = all
    .filter(r => r.state !== 'running')
    .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))

  return [...running, ...ended].slice(0, Math.max(JOB_ROWS, running.length))
}

/** A PR's checks as one glyph and its colour: any failure wins, then anything running. */
export const ciMark = (c: { ok: number; failed: number; pending: number }): { mark: string; color: string } =>
  c.failed > 0
    ? { mark: '✗', color: '#ff5c5c' }
    : c.pending > 0
      ? { mark: '●', color: WARN }
      : c.ok > 0
        ? { mark: '✓', color: '#4caf50' }
        : { mark: '–', color: '#8a879c' }

/** A workflow run's state, as the GitHub card writes it. */
export const runMark = (run: { status: string; conclusion: string }): { mark: string; color: string; text: string } =>
  run.status !== 'completed'
    ? { mark: '●', color: WARN, text: 'en curso' }
    : run.conclusion === 'success'
      ? { mark: '✓', color: '#4caf50', text: 'pasó' }
      : run.conclusion === 'cancelled' || run.conclusion === 'skipped'
        ? { mark: '■', color: '#8a879c', text: run.conclusion === 'cancelled' ? 'cancelada' : 'omitida' }
        : { mark: '✗', color: '#ff5c5c', text: 'falló' }

// ------------------------------------------------------------ skill slots

/** Eight slots read back from the store, whatever it held: a name or null each. */
export const slotsFrom = (value: unknown): (string | null)[] =>
  Array.from({ length: SLOT_COUNT }, (_, i) => {
    const one = Array.isArray(value) ? (value[i] as unknown) : undefined

    return typeof one === 'string' && one.trim() !== '' ? one.trim() : null
  })

/** How a slot names its skill on its button: the part after a plugin's prefix, cut to fit. */
export const slotLabel = (name: string): string => {
  const short = name.includes(':') ? (name.split(':').pop() ?? name) : name

  return short.length > 28 ? `${short.slice(0, 27)}…` : short
}

/** The group a skill is listed under in the picker: its plugin, or "sin plugin". */
export const groupOf = (name: string): string => (name.includes(':') ? (name.split(':')[0] ?? name) : NO_GROUP)
export const NO_GROUP = 'sin plugin'
/** Skills a picker page lists. */
export const PICK_PAGE = 10

/** Skills kept per row: a run that loads more shows the last ones. */
export const SKILLS_SEEN = 12

/** A list of loaded skills with one more: each name once, the newest last. */
export const withSkill = (list: readonly string[] | undefined, name: string): string[] =>
  [...(list ?? []).filter(one => one !== name), name].slice(-SKILLS_SEEN)

/** What the model reads beside the person's prompt: load the picked skills, then answer. */
export const skillContext = (names: readonly string[]): string =>
  `The user keeps ${names.length === 1 ? 'this skill' : 'these skills'} picked in the agent-team pane: ` +
  `${names.map(n => `"${n}"`).join(', ')}. Before you answer, load ${names.length === 1 ? 'it' : 'each one'} ` +
  `with the Skill tool, the name exactly as written, unless it is already loaded in this conversation, ` +
  `and follow ${names.length === 1 ? 'it' : 'them'}.`

/** A picked pack as the model reads it: its name and the skills it offers. */
export type OfferedPack = { name: string; skills: string[] }

/**
 * What the model reads beside the person's prompt for the picked packs: their
 * skills are on offer, and only those the request needs are loaded. Twelve
 * skills loaded whole on every prompt would cost more than the answer.
 */
export const packContext = (offered: readonly OfferedPack[]): string => {
  const lines = offered.map(p => `- ${p.name === '' ? 'unnamed pack' : `"${p.name}"`}: ${p.skills.map(n => `"${n}"`).join(', ')}`)

  return (
    `The user keeps ${offered.length === 1 ? 'this skill pack' : 'these skill packs'} picked in the agent-team pane:\n` +
    `${lines.join('\n')}\n` +
    'Before you answer, load with the Skill tool, the name exactly as written, only the ones this request ' +
    'needs and that are not already loaded in this conversation; skip the rest. When you brief a subagent, ' +
    'name the ones that fit its task.'
  )
}

/** A pack or slot skill the session cannot run, once the session's list is known; unknown, every name counts. */
const isInstalled = (name: string, installed: readonly SkillChoice[]): boolean =>
  installed.length === 0 || installed.some(c => c.name === name)

/**
 * What a prompt carries: the loose skills picked, loaded whole, and the picked
 * packs, offered. A skill picked loose is not offered again by a pack, a skill
 * in two picked packs is offered by the first, and a skill the session no
 * longer has is left out of both.
 */
export const pickedSkills = (
  armed: readonly string[],
  packs: readonly (Pack | null)[],
  armedPacks: readonly string[],
  installed: readonly SkillChoice[],
): { load: string[]; offer: OfferedPack[] } => {
  const load = armed.filter(n => isInstalled(n, installed))
  const seen = new Set(load)
  const offer: OfferedPack[] = []
  for (const pack of packs) {
    if (pack === null || !armedPacks.includes(pack.id)) continue
    const skills: string[] = []
    for (const name of pack.skills) {
      if (name === null || seen.has(name) || !isInstalled(name, installed)) continue
      seen.add(name)
      skills.push(name)
    }
    if (skills.length > 0) offer.push({ name: pack.name, skills })
  }

  return { load, offer }
}

/** Every skill name the picks hold, loose and in picked packs: what the session's list must know. */
export const namesPicked = (armed: readonly string[], packs: readonly (Pack | null)[], armedPacks: readonly string[]): string[] => [
  ...armed,
  ...packs.flatMap(p => (p !== null && armedPacks.includes(p.id) ? p.skills.filter((n): n is string => n !== null) : [])),
]

/** The context lines a prompt carries for the picks: none when nothing is picked. */
export const contextFor = (picked: { load: string[]; offer: OfferedPack[] }): string[] => [
  ...(picked.load.length > 0 ? [skillContext(picked.load)] : []),
  ...(picked.offer.length > 0 ? [packContext(picked.offer)] : []),
]

/** The pack slots read back from the store, whatever it held: a pack or null each. */
export const packsFrom = (value: unknown): (Pack | null)[] =>
  Array.from({ length: PACK_COUNT }, (_, i) => {
    const one = Array.isArray(value) ? (value[i] as unknown) : undefined
    if (one === null || typeof one !== 'object') return null
    const fields = one as Record<string, unknown>
    if (typeof fields.id !== 'string' || fields.id === '') return null
    const listed = Array.isArray(fields.skills) ? (fields.skills as unknown[]) : []

    return {
      id: fields.id,
      name: typeof fields.name === 'string' ? cleanPackName(fields.name) : '',
      skills: Array.from({ length: PACK_SIZE }, (_, j) => {
        const name = listed[j]

        return typeof name === 'string' && name.trim() !== '' ? name.trim() : null
      }),
    }
  })

/** A typed pack name as it is kept: one line, trimmed, cut to fit. */
export const cleanPackName = (typed: string): string => typed.replace(/\s+/g, ' ').trim().slice(0, PACK_NAME_MAX)

/**
 * The key a project's picks are kept under: its folder with forward slashes
 * and no trailing one; a Windows drive path in lower case, as Windows reads it.
 */
export const projectKeyOf = (cwd: string): string => {
  const plain = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const key = plain === '' ? '/' : plain

  return /^[a-z]:\//i.test(key) || /^[a-z]:$/i.test(key) ? key.toLowerCase() : key
}

/** The per-project picks read back from the store, whatever it held. */
export const armedBookFrom = (value: unknown): Record<string, ArmedEntry> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const book: Record<string, ArmedEntry> = {}
  for (const [project, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object') continue
    const fields = entry as Record<string, unknown>
    const names = (list: unknown): string[] =>
      Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string' && n !== '') : []
    book[project] = {
      skills: names(fields.skills),
      packs: names(fields.packs),
      at: typeof fields.at === 'number' && Number.isFinite(fields.at) ? fields.at : 0,
    }
  }

  return book
}

/**
 * The book with one project's picks set: a project with nothing picked leaves
 * it, and past the limit the projects untouched longest go.
 */
export const withArmed = (book: Record<string, ArmedEntry>, project: string, entry: ArmedEntry): Record<string, ArmedEntry> => {
  const rest = Object.entries(book).filter(([key]) => key !== project)
  const kept = entry.skills.length === 0 && entry.packs.length === 0 ? rest : [...rest, [project, entry] as const]

  return Object.fromEntries(kept.sort((a, b) => b[1].at - a[1].at).slice(0, ARMED_PROJECTS))
}

/** A Bash or PowerShell call as the pane reads it. */
export type ShellCall = { tool: string; tool_use_id?: string; command: string; description?: string }
/** What a tool call answered, as far as the pane reads it. */
export type Ran = { deny?: string; isError?: true; text?: string; result?: unknown }

export type GitOperation = Parameters<typeof opsOf>[0]

/** A running background shell whose output file may say how far it got. */
export const needsTail = (sh: ShellTask, at: number): boolean => sh.outputPath !== undefined && isShellRunning(sh, at)

// ------------------------------------------------------------ the team's briefs

/** Kept in `$.store`: false once the person turned off the Agent tool's team text. */
export const DELEGATION_KEY = 'delegation'

/**
 * The agents this plugin ships, as the Agent tool names them. The kit's older
 * agent files (bare `explorer`...) are left alone: they have no Skill tool and
 * know nothing of the block, and a project's own `reviewer` is not ours.
 */
export const TEAM_TYPES = new Set(['agent-team:explorer', 'agent-team:implementer', 'agent-team:tester', 'agent-team:reviewer'])

/** Opens and closes the block; a brief that already ends with one is not given a second. */
export const TEAM_CONTEXT_TAG = '<team-context>'
const TEAM_CONTEXT_END = '</team-context>'

/**
 * What a team agent's brief gets at its end: the project, its branch and the
 * skills the person has picked, all on offer. The agent's own instructions
 * say to load only those its task needs; nothing here repeats them.
 */
export const teamContext = (
  where: { folder: string; branch?: string },
  picked: { load: string[]; offer: OfferedPack[] },
): string => {
  const skills = [...picked.load, ...picked.offer.flatMap(p => p.skills)]
  const lines = [
    `Project folder: ${where.folder === '' ? 'unknown' : where.folder}${where.branch === undefined ? '' : `, git branch ${where.branch}`}.`,
    skills.length === 0
      ? 'The user has no skills picked in the pane.'
      : `Skills the user has picked in the pane (load with the Skill tool only those this task needs): ${skills.map(n => `"${n}"`).join(', ')}.`,
  ]

  return `\n\n${TEAM_CONTEXT_TAG}\n${lines.join('\n')}\n${TEAM_CONTEXT_END}`
}

/**
 * Where a team agent runs and on which branch: the spawn's own folder when it
 * names one, else the session's; the branch only where it is the session's
 * folder (git was read there) and HEAD is on a branch.
 */
export const whereOf = (
  spawnCwd: string | undefined,
  sessionCwd: string,
  git: { state: string; branch?: string },
): { folder: string; branch?: string } => {
  const folder = spawnCwd ?? sessionCwd
  const isSessionFolder = spawnCwd === undefined || projectKeyOf(spawnCwd) === projectKeyOf(sessionCwd)
  const branch = git.state === 'ok' && isSessionFolder && git.branch !== undefined && git.branch !== DETACHED ? git.branch : undefined

  return branch === undefined ? { folder } : { folder, branch }
}

/** What github.ts calls a detached HEAD in the pane; no branch to name in a brief. */
const DETACHED = 'HEAD suelto'

/** Whether a spawn is one of the team's, new and briefed by a caller: a resume, a fork or a workflow's agent is left alone. */
export const isTeamBrief = (e: { subagentType: string; fork: boolean; resume?: unknown; workflow?: unknown; prompt: string }): boolean =>
  TEAM_TYPES.has(e.subagentType) &&
  !e.fork &&
  e.resume === undefined &&
  e.workflow === undefined &&
  !e.prompt.trimEnd().endsWith(TEAM_CONTEXT_END)

/** What the Agent tool says about the team, in place of the engine's advice not to delegate unasked. */
export const TEAM_DELEGATION =
  "**The user's agent team.** The user set up a team for this work: `agent-team:explorer` (Haiku, cheap read-only " +
  'search), `agent-team:implementer` (Sonnet, makes an agreed change and verifies it), `agent-team:tester` (Sonnet, ' +
  'writes and runs tests) and `agent-team:reviewer` (Opus, reviews a finished diff; the costliest, so only for ' +
  "non-trivial changes). Delegate to them as the team rules in the user's instructions say, without asking first; " +
  'where there are no such rules, send the explorer when an answer needs more than five files. A spawn starts ' +
  'without this conversation, so its brief carries the goal, why, files with lines, done-when and limits. To follow ' +
  'up with an agent that already has the context (an answer to its PREGUNTAS, a fix to its own work), continue it ' +
  'with SendMessage instead of spawning a new one. For anything else work inline with your own tools, and spawn ' +
  'other agent types only when the user asks.'

/** The engine's paragraph that tells the model not to spawn agents unless the person asks, up to its web-fetch note. */
const NO_SPAWN = /\*\*Do not spawn agents unless the user asks\.\*\*[^\r\n]*?(?=This does not cover the `web-fetch`|\r?\n|$)/

/**
 * The Agent tool's description with the team's paragraph in place of the
 * advice not to delegate; where the engine words it otherwise, the paragraph
 * is added at the end and the engine's text is kept.
 */
export const withTeamDelegation = (description: string): string =>
  NO_SPAWN.test(description)
    ? description.replace(NO_SPAWN, `${TEAM_DELEGATION} `)
    : `${description}\n\n${TEAM_DELEGATION}`

// ------------------------------------------------------------ waste the pane can see

/**
 * A heading of the team's brief template, as a line opens with it: plain,
 * bulleted or bold and followed by a colon, or a Markdown heading on its own.
 */
const heading = (names: string): RegExp =>
  new RegExp(
    `(^|\\n)[ \\t]*(?:(?:[-*][ \\t]+)?(?:\\*\\*)?(?:${names})(?:\\*\\*)?[ \\t]*:|#{1,6}[ \\t]+(?:${names})[ \\t]*:?[ \\t]*(?=\\r?\\n|$))`,
    'i',
  )
const GOAL = heading('goal|objetivo')
const WHY = heading('why|por qu[eé]')

/** A team brief missing the template's Goal or Why: the agent will guess what matters, or explore to find out. */
export const briefWarning = (prompt: string): string | undefined => {
  const missing = [GOAL.test(prompt) ? undefined : 'Goal', WHY.test(prompt) ? undefined : 'Why'].filter(
    (part): part is string => part !== undefined,
  )

  return missing.length === 0 ? undefined : `encargo sin ${missing.join(' ni ')}: el agente tendrá que adivinar o explorar`
}

/** A spawn's words, for telling a brief sent again from a new one. */
const wordsOf = (text: string): Set<string> => new Set(text.toLowerCase().match(/[\p{L}\p{N}_./-]{3,}/gu) ?? [])

/** How alike two briefs read, 0 to 1: the share of words they have in common. */
export const likeness = (a: string, b: string): number => {
  const x = wordsOf(a)
  const y = wordsOf(b)
  if (x.size === 0 || y.size === 0) return 0
  let shared = 0
  for (const word of x) if (y.has(word)) shared += 1

  return shared / (x.size + y.size - shared)
}

/** A finished agent of the same type this recent, with a brief this alike, could have been continued instead. */
export const REPEAT_MS = 20 * 60 * 1000
/** Two Goals this alike ask for the same thing. */
export const REPEAT_GOAL_LIKENESS = 0.6
/** Two whole briefs without Goals, the template's own words left out, this alike. */
export const REPEAT_LIKENESS = 0.8

/** The template's own words: shared by every brief, they say nothing about the task. */
const TEMPLATE_WORDS = /\b(goal|why|files|done|when|limits|never|commit|push|objetivo|por|qué)\b/gi

/** A brief's Goal: the text after its heading, up to the next heading or blank line. */
export const goalOf = (prompt: string): string | undefined => {
  const found = GOAL.exec(prompt)
  if (found === null) return undefined
  const after = prompt.slice(found.index + found[0].length)
  const end = after.search(/\n[ \t]*\n|\n[ \t]*(?:[-*][ \t]+)?(?:\*\*)?[A-Za-zÁÉÍÓÚáéíóú ]{2,20}(?:\*\*)?[ \t]*:|\n[ \t]*#{1,6}[ \t]/)
  const goal = (end < 0 ? after : after.slice(0, end)).trim()

  return goal === '' ? undefined : goal
}

/**
 * A new spawn that repeats a recent one of the same role: continuing that
 * agent with SendMessage keeps what it read, at a fraction of a new start.
 */
export const repeatWarning = (agents: readonly AgentRow[], row: AgentRow): string | undefined => {
  const goal = goalOf(row.prompt)
  const isAlike = (earlier: string): boolean => {
    const before = goalOf(earlier)
    if (goal !== undefined && before !== undefined) return likeness(goal, before) >= REPEAT_GOAL_LIKENESS

    return likeness(earlier.replace(TEMPLATE_WORDS, ' '), row.prompt.replace(TEMPLATE_WORDS, ' ')) >= REPEAT_LIKENESS
  }
  // Only an agent that finished well: one that failed or stopped is rightly sent again.
  const earlier = agents.find(
    a =>
      a.id !== row.id &&
      a.type === row.type &&
      a.status === 'done' &&
      a.endedAt !== undefined &&
      row.startedAt - a.endedAt <= REPEAT_MS &&
      isAlike(a.prompt),
  )
  if (earlier === undefined || earlier.endedAt === undefined) return undefined
  const minutes = Math.max(1, Math.round((row.startedAt - earlier.endedAt) / 60000))

  return `parecido al encargo de hace ${minutes} min: continuar ese agente con SendMessage costaba menos`
}

/** A diff this small does not need the costliest member. */
export const SMALL_DIFF_LINES = 10

/** The changed lines `git diff --shortstat` reports, or undefined when it says none or nothing readable. */
export const shortstatLines = (out: string): number | undefined => {
  const added = /(\d+) insertions?\(\+\)/.exec(out)
  const removed = /(\d+) deletions?\(-\)/.exec(out)
  const total = Number(added?.[1] ?? 0) + Number(removed?.[1] ?? 0)

  return total === 0 ? undefined : total
}

/** A reviewer sent on a change this small: Opus on what a glance would settle. */
export const reviewWarning = (lines: number | undefined): string | undefined =>
  lines !== undefined && lines <= SMALL_DIFF_LINES
    ? `revisión con Opus de un cambio de ${lines} línea${lines === 1 ? '' : 's'}: para algo así no hacía falta`
    : undefined

/** The first warning a spawn earns, in the order they cost; the template is checked on the whole brief. */
export const spawnWarning = (agents: readonly AgentRow[], row: AgentRow, isTeam: boolean, brief: string): string | undefined =>
  repeatWarning(agents, row) ?? (isTeam ? briefWarning(brief) : undefined)

/**
 * What each role used this session, as pieces the team tab lays out and wraps
 * whole: "Claude 12k · 3 turnos", "explorer 4.0k ×2", and the team's share.
 */
export const spendParts = (t: Team): { parts: { role: Role; text: string }[]; share: string } => {
  const roles = (['main', 'explorer', 'implementer', 'tester', 'reviewer', 'other'] as const).filter(role => t.totals[role] !== undefined)
  const parts = roles.map(role => {
    const total = t.totals[role] as RoleTotal
    const runs = role === 'main' ? ` · ${total.runs} turno${total.runs === 1 ? '' : 's'}` : ` ×${total.runs}`

    return { role, text: `${LOOK[role].name} ${kilo(total.tokens)}${runs}` }
  })
  const total = Object.values(t.totals).reduce((sum, one) => sum + (one?.tokens ?? 0), 0)
  const team = total - (t.totals.main?.tokens ?? 0)

  return { parts, share: total === 0 || team === 0 ? '' : `equipo ${Math.round((team / total) * 100)} %` }
}

/** The same spend as one line, for places with room for it. */
export const spendLine = (t: Team): string => {
  const all = sessionTokensOf(t)
  if (all === '') return ''
  const total = Object.values(t.totals).reduce((sum, one) => sum + (one?.tokens ?? 0), 0)
  const team = total - (t.totals.main?.tokens ?? 0)
  const share = total === 0 || team === 0 ? '' : ` · equipo ${Math.round((team / total) * 100)} %`

  return `Sesión: ${all}${share}`
}
