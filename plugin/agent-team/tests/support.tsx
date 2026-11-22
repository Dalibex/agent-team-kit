import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, CommandInfo, EngineInterface, HttpInit, HttpResponse, On, ProcessRunInit, ToolCallResult } from 'claude-code'

export const PANE = {
  plugin: 'agent-team',
  component: 'Pane',
  requestId: 'agent-team',
  props: {
    title: 'Agent team',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/** The environment of a Spanish system: the suite's texts are asserted in Spanish unless a test says otherwise. */
export const SPANISH = { LANG: 'es_ES.UTF-8' } as const

/** The version the mocked manifest (`.claude-plugin/plugin.json`) states: the one "running". */
export const MANIFEST_VERSION = '0.9.3'

/**
 * A path as the tests name it: forward slashes and no drive. The engine hands a
 * path back resolved on its own system (`/home/ana` reads as `C:\home\ana` on Windows).
 */
export const plainPath = (path: string): string => {
  const slashed = path.replace(/\\/g, '/')
  // On Linux the engine reads a Windows path as relative and prefixes the plugin folder: what follows the drive is the path.
  const drive = slashed.match(/(?:^|\/)[A-Za-z]:(\/.*)$/)

  return drive?.[1] ?? slashed
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 of some bytes. */
export const base64Of = (bytes: readonly number[]): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = bytes.slice(i, i + 3)
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63] ?? ''
    out += B64[(n >> 12) & 63] ?? ''
    out += i + 1 < bytes.length ? (B64[(n >> 6) & 63] ?? '') : '='
    out += i + 2 < bytes.length ? (B64[n & 63] ?? '') : '='
  }

  return out
}

export const SURFACES = ['terminal', 'desktop'] as const

/** What the test hooks beneath the plugin saw, and what they answer from. */
export type World = {
  clock: ReturnType<typeof mock.clock>
  /** What `$.agent.list()` answers: the test edits it. */
  listed: AgentInfo[]
  /** The panes `$.ui.panes()` answers. */
  panes: string[]
  /** The title of each `$.ui.open`. */
  opened: string[]
  closed: string[]
  /** Each `$.ui.status` line, in order. */
  statuses: (string | undefined)[]
  /** The argv and init of each `$.process.run`, git and gh left out. */
  runs: { argv: readonly string[]; init: ProcessRunInit | undefined }[]
  /** What a run answers instead of the plain success, when the test says: it may throw (a command that cannot start) or take its time. */
  onRun: ((argv: readonly string[], init: ProcessRunInit | undefined) => ProcessAnswer | undefined | Promise<ProcessAnswer | undefined>) | undefined
  /** The argv of each git or gh run, joined by spaces. */
  gitRuns: string[]
  /** The init (env, timeout) each git or gh run carried, in step with `gitRuns`. */
  gitInits: (ProcessRunInit | undefined)[]
  /**
   * What git and gh answer, by their first two words ("git status", "gh pr");
   * one not listed answers as outside a repository.
   */
  gitAnswers: Record<string, ProcessAnswer>
  /** Runs inside each `$.agent.list()`, before it answers: a call that lands while the list is taken. */
  onList: (() => Promise<void>) | undefined
  /** Runs inside each spawn, before the engine answers it: an agent's own event that lands before the spawn resolves. */
  onSpawn: (() => Promise<void>) | undefined
  /** Runs inside each `$.ui.open`, before it answers: what the pane draws as it opens. */
  onOpen: (($: EngineInterface) => Promise<void>) | undefined
  /** Runs inside each `$.store.get`, the value already read: a store that answers late, with what it held when asked. */
  onStoreGet: ((key: string) => Promise<void> | undefined) | undefined
  /** Each `$.ui.log` text, in order, whatever its sink. */
  logs: string[]
  /** The asset of each `$.audio.play`. */
  clips: (string | undefined)[]
  /** Each `$.ui.toast` text, in order. */
  toasts: string[]
  /**
   * What `$.fs.read`, `$.fs.stat` and `$.fs.exists` answer, by path; `$.fs.write` writes here
   * too. It starts with the plugin's own manifest, at the version `MANIFEST_VERSION`.
   */
  files: Record<string, string>
  /** The path of each `$.fs.write`, in order. */
  written: string[]
  /** Files whose bytes are not the UTF-8 of their text: `$.fs.read` as bytes answers these, as text it answers them decoded with replacement characters. */
  rawBytes: Record<string, number[]>
  /** Symbolic links: the path of a link, and the file it leads to. */
  links: Record<string, string>
  /** Makes a `$.fs.write` to this path fail, once the test says. */
  failWrite: ((path: string) => boolean) | undefined
  /** Makes a `$.fs.read` of this path fail, once the test says. */
  failRead: ((path: string) => boolean) | undefined
  /** What each `$.command.register` declared. */
  registered: { name: string; description?: string; argumentHint?: string }[]
  /** The files the plugin removed (through `rm` or PowerShell's Remove-Item), by path. */
  removed: string[]
  /** What `$.http.fetch` answers; left out, the network is down and the call fails. */
  http: ((url: string, init: HttpInit | undefined) => HttpResponse | Promise<HttpResponse>) | undefined
  /** The url and init of each `$.http.fetch`. */
  fetched: { url: string; init: HttpInit | undefined }[]
  /** What a tool call answers, when the test says; else an empty Bash result. It may take its time. */
  toolResult: ((e: { tool: string } & Record<string, unknown>) => ToolCallResult | Promise<ToolCallResult>) | undefined
  /** Each `$.ui.notify` text, in order. */
  notified: string[]
  /** How many times `$.session.compact` was asked. */
  compactions: number
  /** Whether a compaction runs (its summary is the one message); by default the test engine skips it. */
  isCompacting: boolean
  /** What `$.command.list` answers. */
  commands: CommandInfo[]
  /** Each prompt that reached the bottom of `prompt.submit`: its text and the context hooks added. */
  submitted: { text: string; context: readonly string[] }[]
  /** What `$.session.root()` answers: the folder the session started in until the test moves it, as `/cd` does. */
  root: string
  /** The input of each spawn that reached the engine, as the plugin's hooks left it. */
  spawned: AgentSpawnInput[]
  /** What `$.store` holds: the test's seed, then every write the plugin makes. */
  stored: Record<string, unknown>
}

export type ProcessAnswer = { exitCode: number; stdout: string; stderr: string }

const OUTSIDE_REPO: ProcessAnswer = { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }

// The mod keeps the time of its last chime, so a test that starts its clock
// before an earlier test's chime would find itself inside the gap. Each test
// starts later than the last.
let epoch = 0
export const nextNow = (): number => {
  epoch += 1

  return epoch * 1_000_000
}

/** The engine beneath the plugin, as every test here needs it. */
export const boot = (
  on: On,
  options: { store?: Record<string, unknown>; env?: Record<string, string> } = {},
): World => {
  const world: World = {
    clock: mock.clock(on, { now: nextNow() }),
    listed: [],
    panes: [],
    opened: [],
    closed: [],
    statuses: [],
    runs: [],
    onRun: undefined,
    gitRuns: [],
    gitInits: [],
    gitAnswers: {},
    onList: undefined,
    onSpawn: undefined,
    onOpen: undefined,
    onStoreGet: undefined,
    logs: [],
    clips: [],
    toasts: [],
    files: { '.claude-plugin/plugin.json': JSON.stringify({ name: 'agent-team', version: MANIFEST_VERSION }) },
    written: [],
    rawBytes: {},
    links: {},
    failWrite: undefined,
    failRead: undefined,
    removed: [],
    registered: [],
    http: undefined,
    fetched: [],
    toolResult: undefined,
    notified: [],
    compactions: 0,
    isCompacting: false,
    commands: [],
    submitted: [],
    stored: { ...options.store },
    spawned: [],
    root: '/',
  }
  // The store as a plain record the test can read back after the plugin writes.
  on('store.get', async (_, e) => {
    const value = world.stored[e.key]
    await world.onStoreGet?.(e.key)

    return { value }
  })
  on('store.set', (_, e) => {
    world.stored[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete world.stored[e.key]

    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(world.stored) }))
  mock.env(on, { ...SPANISH, ...options.env })
  on('command.register', (_, e) => {
    world.registered.push(e)

    return { value: { command: 'agent-team' } }
  })
  on('ui.open', async ($, e) => {
    world.opened.push(e.title ?? e.id)
    await world.onOpen?.($)

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    world.closed.push(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: world.panes.map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.status', (_, e) => {
    world.statuses.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => {
    world.root = e.cwd

    return { cwd: e.cwd }
  })
  on('session.root', () => ({ value: world.root }))
  on('agent.list', async () => {
    await world.onList?.()

    return { value: world.listed }
  })
  // The tool_use_id of a spawn is the id of the agent it starts; with no model
  // asked for, the parent's is what the engine resolves.
  on('agent.spawn', async (_, e) => {
    world.spawned.push(e)
    await world.onSpawn?.()

    return { agentId: e.tool_use_id, model: e.model ?? e.parentModel }
  })
  on('ui.log', (_, e) => {
    world.logs.push(e.text)

    return { value: undefined }
  })
  on('tool.call', async (_, e) => (await world.toolResult?.(e)) ?? { result: { stdout: '', stderr: '', interrupted: false } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('process.run', async (_, e) => {
    const done = { isStdoutTruncated: false, isStderrTruncated: false }
    if (e.argv[0] === 'git' || e.argv[0] === 'gh') {
      world.gitRuns.push(e.argv.join(' '))
      world.gitInits.push(e.init)
      const answer = world.gitAnswers[e.argv.slice(0, 2).join(' ')] ?? OUTSIDE_REPO

      return { value: { ...answer, ...done } }
    }
    world.runs.push({ argv: e.argv, init: e.init })
    const custom = await world.onRun?.(e.argv, e.init)
    if (custom !== undefined) return { value: { ...custom, ...done } }
    // A removal, as the plugin asks for one: `rm -f -- <path>`, or PowerShell with the path in AGENT_TEAM_DELETE.
    const doomed = e.argv[0] === 'rm' ? e.argv[e.argv.length - 1] : e.init?.env?.AGENT_TEAM_DELETE
    if (doomed !== undefined) {
      world.removed.push(plainPath(doomed))
      delete world.files[plainPath(doomed)]
    }

    return { value: { exitCode: 0, stdout: '', stderr: '', ...done } }
  })
  on('command.list', () => ({ value: world.commands }))
  on('classic.StopFailure', () => ({}))
  on('prompt.submit', (_, e) => {
    world.submitted.push({ text: e.text, context: e.context ?? [] })

    return { text: e.text, ...(e.context === undefined ? {} : { context: e.context }) }
  })
  on('ui.notify', (_, e) => {
    world.notified.push(e.text)

    return { value: { isSent: true, channel: 'client' } }
  })
  on('session.compact', () => {
    world.compactions += 1

    return world.isCompacting ? { messages: [{ role: 'user', text: 'summary', toolUses: [] }] } : { skip: 'probado desde el test' }
  })
  on('ui.toast', (_, e) => {
    world.toasts.push(e.text)

    return { value: undefined }
  })
  // A test names files as the tool output would on its own system; the engine
  // may hand the path back resolved against the plugin folder (a Windows path
  // on Linux reads as relative), so a file matches by the path it ends with.
  /** Where a path leads: a link is followed to its file. */
  const target = (path: string): string => world.links[plainPath(path)] ?? plainPath(path)
  const fileAt = (path: string): string | undefined => {
    const plain = plainPath
    const asked = target(path)
    const keys = Object.keys(world.files)
    const key = keys.find(k => asked === plain(k)) ?? keys.find(k => asked.endsWith(`/${plain(k)}`))

    return key === undefined ? undefined : world.files[key]
  }
  on('fs.stat', (_, e) => {
    const text = fileAt(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    const isLink = world.links[plainPath(e.path)] !== undefined

    return { value: { kind: 'file', size: text.length, mtimeMs: 0, isLink, ...(e.resolve ? { realPath: target(e.path) } : {}) } }
  })
  on('fs.read', (_, e) => {
    if (world.failRead?.(plainPath(e.path)) === true) throw new Error('EBUSY: resource busy')
    const text = fileAt(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    const raw = world.rawBytes[target(e.path)]
    if (e.as === 'bytes') return { value: { base64: base64Of(raw ?? [...new TextEncoder().encode(text)]) } }

    return { value: raw === undefined ? text : new TextDecoder('utf-8').decode(new Uint8Array(raw)) }
  })
  on('fs.exists', (_, e) => ({ value: fileAt(e.path) !== undefined }))
  on('fs.list', (_, e) => {
    const dir = plainPath(e.path).replace(/\/+$/, '')
    const names = Object.keys(world.files)
      .filter(k => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/'))
      .map(k => k.slice(dir.length + 1))

    return { value: names.map(name => ({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('fs.write', (_, e) => {
    if (world.failWrite?.(plainPath(e.path)) === true) throw new Error('EACCES: permission denied')
    // a write over a link's own path replaces the link with a file: only a write to what it leads to keeps it
    const at = plainPath(e.path)
    world.written.push(at)
    delete world.links[at]
    world.files[at] = e.text

    return { value: undefined }
  })
  on('http.fetch', async (_, e) => {
    world.fetched.push({ url: e.url, init: e.init })
    if (world.http === undefined) throw new Error('network is down')

    return { value: await world.http(e.url, e.init) }
  })
  on('audio.play', (_, e) => {
    world.clips.push(e.clip.asset)

    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  return world
}

/** The input of a spawn: what the caller says, the engine's own fields filled in. */
export const spawnInput = (
  input: Pick<AgentSpawnInput, 'subagentType'> & Partial<AgentSpawnInput>,
): AgentSpawnInput => ({
  tool_use_id: 'agent-1',
  prompt: 'Do the job',
  description: 'The job',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...input,
})

/** What the person types to run `/agent-team`. */
export const AGENT_TEAM_COMMAND = {
  command: 'agent-team',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

/** Spawns an agent whose id is `id`. */
export const spawn = (
  $: Engine,
  id: string,
  subagentType: string,
  more: Partial<AgentSpawnInput> = {},
) => $.agent.spawn(spawnInput({ tool_use_id: id, subagentType, description: `Job ${id}`, ...more }))

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  model: string
}

/** Ends the agent's turn the way `reason` says. */
export const finish = (
  $: Engine,
  agentId: string | undefined,
  reason: 'answer' | 'aborted' | 'refusal' | 'error' = 'answer',
  usage?: Usage,
) =>
  $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: reason === 'aborted',
    turnId: `turn-${agentId ?? 'main'}`,
    agentId,
    usage,
    ...(reason === 'refusal'
      ? { reason, refusal: { category: null, explanation: null } }
      : { reason }),
  })

export const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

export const TAB_IDS = ['team', 'skills', 'jobs', 'github', 'usage'] as const

/** Shows a tab, as a press on its button does. */
export const onTab = async ($: Engine, id: (typeof TAB_IDS)[number]): Promise<void> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: `tab-${id}` })
  await ui.unmount()
}

/** The tab the pane shows now, read off the pressed-looking button. */
const shownTab = async ($: Engine): Promise<(typeof TAB_IDS)[number]> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  let current: (typeof TAB_IDS)[number] = 'team'
  for (const id of TAB_IDS) {
    const button = await ui.find({ type: 'Button', key: `tab-${id}` })
    if (button?.props.variant === 'primary') current = id
  }
  await ui.unmount()

  return current
}

/**
 * Whether the pane shows a Text matching `text`, on `surface`, in any tab
 * (or in `tab` alone): the tabs are tried in turn and the one shown before is
 * shown again.
 */
export const shows = async (
  $: Engine,
  surface: (typeof SURFACES)[number],
  text: RegExp,
  type = 'Text',
  tab?: (typeof TAB_IDS)[number],
): Promise<boolean> => {
  const was = await shownTab($)
  let found = false
  // With `tab`, only that tab is looked at: where the text is drawn is part of the check.
  const order = tab === undefined ? [was, ...TAB_IDS.filter(one => one !== was)] : [tab]
  for (const id of order) {
    if (id !== was) await onTab($, id)
    const ui = await $.ui.mount({ ...PANE, surface })
    found = (await ui.find({ type, text })) !== undefined
    await ui.unmount()
    if (found) break
  }
  if ((await shownTab($)) !== was) await onTab($, was)

  return found
}

export const usage = (model: string, input = 0, output = 0, cacheWrite = 0, cacheRead = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cacheWrite,
  cache_read_input_tokens: cacheRead,
  model,
})

/** Unfolds a team row: an agent's by its id, or Claude's with `main`. It stays unfolded on every surface. */
export const unfold = async ($: Engine, id: string): Promise<void> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: id === 'main' ? 'main-row-x' : `agent-${id}-x` })
  await ui.unmount()
}

/** The drawing's markup as the desktop draws it: the team and its usage band. */
export const drawing = async ($: Engine): Promise<string> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return String(svg?.props.source ?? '')
}
