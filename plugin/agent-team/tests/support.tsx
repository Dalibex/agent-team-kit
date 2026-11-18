import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, CommandInfo, On, ProcessRunInit, ToolCallResult } from 'claude-code'

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
  /** The argv of each git or gh run, joined by spaces. */
  gitRuns: string[]
  /**
   * What git and gh answer, by their first two words ("git status", "gh pr");
   * one not listed answers as outside a repository.
   */
  gitAnswers: Record<string, ProcessAnswer>
  /** Runs inside each `$.agent.list()`, before it answers: a call that lands while the list is taken. */
  onList: (() => Promise<void>) | undefined
  /** The asset of each `$.audio.play`. */
  clips: (string | undefined)[]
  /** Each `$.ui.toast` text, in order. */
  toasts: string[]
  /** What `$.fs.read` and `$.fs.stat` answer, by path. */
  files: Record<string, string>
  /** What a tool call answers, when the test says; else an empty Bash result. It may take its time. */
  toolResult: ((e: { tool: string } & Record<string, unknown>) => ToolCallResult | Promise<ToolCallResult>) | undefined
  /** Each `$.ui.notify` text, in order. */
  notified: string[]
  /** How many times `$.session.compact` was asked. */
  compactions: number
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
    gitRuns: [],
    gitAnswers: {},
    onList: undefined,
    clips: [],
    toasts: [],
    files: {},
    toolResult: undefined,
    notified: [],
    compactions: 0,
    commands: [],
    submitted: [],
    stored: { ...options.store },
    spawned: [],
    root: '/',
  }
  // The store as a plain record the test can read back after the plugin writes.
  on('store.get', (_, e) => ({ value: world.stored[e.key] }))
  on('store.set', (_, e) => {
    world.stored[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete world.stored[e.key]

    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(world.stored) }))
  mock.env(on, options.env ?? {})
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', (_, e) => {
    world.opened.push(e.title ?? e.id)

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
  on('agent.spawn', (_, e) => {
    world.spawned.push(e)

    return { agentId: e.tool_use_id, model: e.model ?? e.parentModel }
  })
  on('tool.call', async (_, e) => (await world.toolResult?.(e)) ?? { result: { stdout: '', stderr: '', interrupted: false } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('process.run', (_, e) => {
    const done = { isStdoutTruncated: false, isStderrTruncated: false }
    if (e.argv[0] === 'git' || e.argv[0] === 'gh') {
      world.gitRuns.push(e.argv.join(' '))
      const answer = world.gitAnswers[e.argv.slice(0, 2).join(' ')] ?? OUTSIDE_REPO

      return { value: { ...answer, ...done } }
    }
    world.runs.push({ argv: e.argv, init: e.init })

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

    return { skip: 'probado desde el test' }
  })
  on('ui.toast', (_, e) => {
    world.toasts.push(e.text)

    return { value: undefined }
  })
  // A test names files as the tool output would on its own system; the engine
  // may hand the path back resolved against the plugin folder (a Windows path
  // on Linux reads as relative), so a file matches by the path it ends with.
  const fileAt = (path: string): string | undefined => {
    const plain = (p: string) => p.replace(/\\/g, '/')
    const asked = plain(path)
    const key = Object.keys(world.files).find(k => asked === plain(k) || asked.endsWith(`/${plain(k)}`))

    return key === undefined ? undefined : world.files[key]
  }
  on('fs.stat', (_, e) => {
    const text = fileAt(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)

    return { value: { kind: 'file', size: text.length, mtimeMs: 0, isLink: false } }
  })
  on('fs.read', (_, e) => {
    const text = fileAt(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)

    return { value: text }
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

export const TAB_IDS = ['team', 'skills', 'jobs', 'github'] as const

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
