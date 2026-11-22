import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextBreakdown } from 'claude-code'

import { setLanguage } from '../hooks/i18n'
import { tabFrom } from '../hooks/state'
import {
  barCells,
  cacheShare,
  contextOf,
  contextPercent,
  groupItems,
  inTokens,
  NO_STATS,
  promptWords,
  resultTokens,
  shortPath,
  toolItems,
  TOOL_KEPT,
  topRest,
  withToolResult,
  withTurnEnd,
} from '../hooks/stats'
import { boot, finish, onTab, PANE, SURFACES, shows, spawn, start, usage } from './support'
import type { World } from './support'

setLanguage('es')

const ENGLISH = { LANG: 'en_US.UTF-8' } as const

const cat = (name: string, tokens: number, kind: 'used' | 'free' | 'buffer' | 'deferred') => ({
  name,
  tokens,
  color: 'x',
  isDeferred: kind === 'deferred',
  kind,
})

/** A summary breakdown as the engine answers it: seven plugins, three MCP servers (one tool not loaded), two memory files, an agent. */
const BREAKDOWN = {
  categories: [
    cat('System prompt', 6000, 'used'),
    cat('Skills', 4000, 'used'),
    cat('Messages', 26_000, 'used'),
    cat('MCP tools (deferred)', 9000, 'deferred'),
    cat('Free space', 130_000, 'free'),
    cat('Autocompact buffer', 33_000, 'buffer'),
  ],
  totalTokens: 36_000,
  maxTokens: 200_000,
  rawMaxTokens: 200_000,
  autocompactSource: 'auto',
  percentage: 18,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [
    { path: 'C:\\Users\\ana\\proj\\CLAUDE.md', type: 'Project', tokens: 1200 },
    { path: '/home/ana/.claude/CLAUDE.md', type: 'User', tokens: 300 },
  ],
  mcpTools: [
    { name: 'create_issue', serverName: 'github', tokens: 800, isLoaded: true },
    { name: 'list_prs', serverName: 'github', tokens: 700, isLoaded: true },
    { name: 'query', serverName: 'postgres', tokens: 500, isLoaded: true },
    { name: 'later', serverName: 'postgres', tokens: 400, isLoaded: false },
  ],
  agents: [{ agentType: 'explorer', source: 'plugin', tokens: 250 }],
  skills: {
    totalSkills: 9,
    includedSkills: 9,
    tokens: 4000,
    skillFrontmatter: [
      ...['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'].map((pluginName, i) => ({
        name: `skill-${pluginName}`,
        source: 'plugin',
        pluginName,
        tokens: 700 - i * 100,
      })),
      { name: 'mine', source: 'projectSettings', tokens: 50 },
      { name: 'mine-too', source: 'projectSettings', tokens: 30 },
    ],
  },
  isAutoCompactEnabled: true,
  apiUsage: null,
} as unknown as SessionContextBreakdown

/** The engine answers the breakdown to a `summary` ask, and only to that one. */
const answerBreakdown = (on: On, world: World, asked: string[] = []) => {
  on('session.usage', (_, e) => {
    // the status figures (no breakdown asked) are not what these tests count
    if (e.breakdown !== undefined) asked.push(e.breakdown)

    return {
      value: {
        startedAt: world.clock.now(),
        context: { window: 200_000, tokens: 36_000, percent: 18, breakdown: BREAKDOWN },
        rateLimits: [],
      },
    }
  })
}

/** Every text the usage card draws, on `surface`. */
const cardTexts = async ($: Engine, surface: (typeof SURFACES)[number]): Promise<string[]> => {
  const ui = await $.ui.mount({ ...PANE, surface })
  const nodes = await ui.findAll({ type: 'Text' })
  await ui.unmount()

  return nodes.map(n => String((n as unknown as { text?: string }).text ?? ''))
}

/** A session with two Claude turns (the second the dearer), a Read result of about a thousand tokens and an explorer. */
const play = async ($: Engine, world: World) => {
  await start($)
  await $.turn.start({ text: 'Refactor the\nparser please', turnId: 't1' })
  world.toolResult = () => ({ result: { stdout: '' }, text: 'x'.repeat(4000) })
  await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 4000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: usage('claude-opus-5-5', 500, 1500, 2000, 8000),
  })
  await spawn($, 'a1', 'agent-team:explorer')
  await finish($, 'a1', 'answer', usage('claude-haiku-5-5', 3000, 1000))
  await $.turn.start({ text: 'Now the tests', turnId: 't2' })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 9000,
    isAborted: false,
    turnId: 't2',
    reason: 'answer',
    usage: usage('claude-opus-5-5', 1000, 3000, 4000, 16_000),
  })
}

// ------------------------------------------------------------ the pure parts

test('skills group by plugin (else by source) and MCP tools by server, loaded ones only, the deferred counted apart', () => {
  const view = contextOf(BREAKDOWN)
  expect(view.skills[0]).toEqual({ name: 'alpha', tokens: 700, count: 1 })
  expect(view.skills.find(g => g.name === 'projectSettings')).toEqual({ name: 'projectSettings', tokens: 80, count: 2 })
  expect(view.mcp).toEqual([
    { name: 'github', tokens: 1500, count: 2 },
    { name: 'postgres', tokens: 500, count: 1 },
  ])
  expect(view.mcpDeferred).toBe(1)
  expect(view.memory.map(f => f.name)).toEqual(['proj/CLAUDE.md', '.claude/CLAUDE.md'])
  expect(view.agents).toEqual([{ name: 'explorer', tokens: 250 }])
  // the deferred row is outside the window: the bar and the legend leave it out
  expect(view.rows.map(r => r.name)).toEqual(['System prompt', 'Skills', 'Messages', 'Free space', 'Autocompact buffer'])
  expect(contextPercent(view)).toBe(18)
})

test('groupItems sums per key, biggest first, ties by name', () => {
  const groups = groupItems([{ k: 'b', tokens: 5 }, { k: 'a', tokens: 5 }, { k: 'b', tokens: 1 }], i => i.k)
  expect(groups).toEqual([{ name: 'a', tokens: 5, count: 1 }, { name: 'b', tokens: 6, count: 2 }].reverse())
})

test('a list keeps its top five and sums the rest', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ name: `i${i}`, tokens: (i + 1) * 10 }))
  const { top, rest } = topRest(items)
  expect(top.map(i => i.name)).toEqual(['i7', 'i6', 'i5', 'i4', 'i3'])
  expect(rest).toEqual({ count: 3, tokens: 60 })
  expect(topRest(items.slice(0, 5)).rest).toBeUndefined()
})

test('short paths keep the last two parts, with either slash', () => {
  expect(shortPath('C:\\Users\\ana\\proj\\CLAUDE.md')).toBe('proj/CLAUDE.md')
  expect(shortPath('/home/ana/.claude/CLAUDE.md')).toBe('.claude/CLAUDE.md')
  expect(shortPath('CLAUDE.md')).toBe('CLAUDE.md')
})

test('the cache share is the cached part of what went in, and nothing before any input', () => {
  expect(cacheShare(NO_STATS)).toBeUndefined()
  const s = { input: 500, cacheWrite: 1500, cacheRead: 8000 }
  expect(inTokens(s)).toBe(10_000)
  expect(cacheShare(s)).toBe(80)
})

test('the three costliest Claude turns are kept, biggest first, with the first words of their prompts; agents add tokens but no turn', () => {
  const tokens = (n: number) => ({ input: n, output: 0, cacheRead: 100, cacheWrite: 0 })
  let s = NO_STATS
  for (const [n, prompt] of [[10, 'one'], [40, 'two'], [20, 'three'], [30, undefined], [5, 'five']] as const) {
    const { prompt: _drop, ...bare } = s
    s = prompt === undefined ? bare : { ...bare, prompt }
    s = withTurnEnd(s, { isMain: true, durationMs: n * 100, tokens: tokens(n) })
  }
  s = withTurnEnd(s, { isMain: false, durationMs: 1, tokens: tokens(999) })
  expect(s.turns).toBe(5)
  expect(s.top.map(t => [t.n, t.tokens])).toEqual([[2, 40], [4, 30], [3, 20]])
  expect(s.top[0]?.prompt).toBe('two')
  expect(s.top[1]?.prompt).toBeUndefined()
  expect(s.input).toBe(10 + 40 + 20 + 30 + 5 + 999)
  expect(s.cacheRead).toBe(600)
})

test('a prompt is cut to its first words; a tag or a notification is not a prompt', () => {
  expect(promptWords('  fix\n the   bug ')).toBe('fix the bug')
  expect(promptWords('x'.repeat(100))).toHaveLength(60)
  expect(promptWords('<task-notification>done</task-notification>')).toBeUndefined()
  expect(promptWords('   ')).toBeUndefined()
})

test('a tool result weighs its text over four, or its data when it has none', () => {
  expect(resultTokens({ text: 'x'.repeat(4000) })).toBe(1000)
  expect(resultTokens({ text: 'x'.repeat(5) })).toBe(2)
  expect(resultTokens({ result: 'x'.repeat(40) })).toBe(10)
  expect(resultTokens({ result: { a: 'x'.repeat(30) } })).toBe(Math.ceil(JSON.stringify({ a: 'x'.repeat(30) }).length / 4))
  expect(resultTokens({})).toBe(0)
})

test('the tool table keeps only the biggest tools, and never drops the one just counted', () => {
  let tools: ReturnType<typeof withToolResult> = {}
  for (let i = 0; i < TOOL_KEPT + 10; i += 1) tools = withToolResult(tools, `tool-${i}`, i + 1)
  expect(Object.keys(tools)).toHaveLength(TOOL_KEPT)
  // the biggest stay; a newcomer smaller than all is still kept the moment it arrives
  expect(tools[`tool-${TOOL_KEPT + 9}`]).toEqual({ tokens: TOOL_KEPT + 10, calls: 1 })
  tools = withToolResult(tools, 'newcomer', 1)
  expect(tools.newcomer).toEqual({ tokens: 1, calls: 1 })
  expect(Object.keys(tools)).toHaveLength(TOOL_KEPT)
  tools = withToolResult(tools, 'newcomer', 9)
  expect(tools.newcomer).toEqual({ tokens: 10, calls: 2 })
  expect(toolItems(tools)[0]?.name).toBe(`tool-${TOOL_KEPT + 9}`)
})

test('the bar gives each row cells in proportion, adds up to its width and keeps a thin row visible', () => {
  const rows = [{ tokens: 6000 }, { tokens: 26_000 }, { tokens: 130_000 }, { tokens: 33_000 }, { tokens: 10 }]
  const cells = barCells(rows, 20).map(r => r.cells)
  expect(cells.reduce((a, b) => a + b, 0)).toBe(20)
  expect(cells.every(c => c >= 1)).toBe(true)
  expect(barCells([{ tokens: 0 }], 10)[0]?.cells).toBe(0)
})

test('a stored tab id of the usage tab is read back; an unknown one is not', () => {
  expect(tabFrom('usage')).toBe('usage')
  expect(tabFrom('team')).toBe('team')
  expect(tabFrom('nope')).toBeUndefined()
})

// ------------------------------------------------------------ the tab

test('before any turn, and with no breakdown to read, the usage tab says there is nothing counted', async ($, on) => {
  boot(on)
  await start($)
  expect(await shows($, 'desktop', /^Aún no hay nada contado/, 'Text', 'usage')).toBe(true)
})

for (const [lang, env, words] of [
  ['Spanish', undefined, { tokens: 'Tokens', size: 'desglose: 36k de 200k', context: 'Contexto ahora · 18%', more: '+3 más', free: 'Espacio libre', turn: 'Turno 2', deferred: '1 más sin cargar aún', cache: '70% leído de la caché' }],
  ['English', ENGLISH, { tokens: 'Tokens', size: 'breakdown: 36k of 200k', context: 'Context now · 18%', more: '+3 more', free: 'Free space', turn: 'Turn 2', deferred: '1 more not loaded yet', cache: '70% read from cache' }],
] as const) {
  for (const surface of SURFACES) {
    test(`the usage tab in ${lang} on ${surface}: session, context, groups and where it goes, with no money`, async ($, on) => {
      const world = boot(on, env === undefined ? {} : { env })
      answerBreakdown(on, world)
      await play($, world)
      await onTab($, 'usage')

      const texts = await cardTexts($, surface)
      const all = texts.join('\n')
      for (const piece of [
        words.tokens,
        // 8k + 16k cache read, 0.5k + 1k input, 2k + 4k cache write, the agent's 3k input: 34.5k in, 5.5k out
        '35k entrada · 5.5k salida',
        words.cache,
        words.context,
        words.size,
        words.more,
        words.free,
        'proj/CLAUDE.md',
        'explorer',
        'github ×2',
        words.deferred,
        words.turn,
        'Read ×1',
      ]) {
        if (lang === 'English' && piece.includes('entrada')) continue
        expect(all, `${lang} ${surface}: ${piece}`).toContain(piece)
      }
      // no cost, no prices, in the card or in its plate
      expect(all).not.toMatch(/\$|USD|usd/)
    })
  }
}

test('English figures, and the costliest turn names its prompt', async ($, on) => {
  const world = boot(on, { env: ENGLISH })
  answerBreakdown(on, world)
  await play($, world)
  await onTab($, 'usage')
  const all = (await cardTexts($, 'desktop')).join('\n')
  expect(all).toContain('35k in · 5.5k out')
  expect(all).toContain('Biggest turns')
  expect(all).toContain('Now the tests')
  expect(all).toContain('Refactor the parser please')
  expect(all).toContain('2 turns')
})

test('the spend line moved from the team tab to the usage tab', async ($, on) => {
  const world = boot(on)
  answerBreakdown(on, world)
  await play($, world)
  expect(await shows($, 'desktop', /^Sesión$/, 'Text', 'usage')).toBe(true)
  expect(await shows($, 'desktop', /^Sesión$/, 'Text', 'team')).toBe(false)
})

test('the breakdown is asked as a summary when the tab opens, and at Claude’s turn end or a compaction only while the tab is shown', async ($, on) => {
  const world = boot(on)
  const asked: string[] = []
  answerBreakdown(on, world, asked)
  await start($)
  const turn = () => $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage('claude-opus-5-5', 1, 1) })
  await spawn($, 'a1', 'agent-team:explorer')
  await finish($, 'a1', 'answer', usage('claude-haiku-5-5', 10, 10))
  // hidden tab: nothing is read, whoever's turn ended
  await turn()
  await world.clock.advance(5000)
  expect(asked).toEqual([])
  await onTab($, 'usage')
  expect(asked).toEqual(['summary'])
  // shown: Claude's turn end reads again, an agent's does not, the ticker never
  await finish($, 'a1', 'answer', usage('claude-haiku-5-5', 10, 10))
  await world.clock.advance(5000)
  expect(asked).toEqual(['summary'])
  await turn()
  await world.clock.advance(0)
  expect(asked).toEqual(['summary', 'summary'])
  // a counted compaction reads it again too
  world.isCompacting = true
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  await world.clock.advance(0)
  expect(asked).toHaveLength(3)
})

test('a read asked while another is in flight runs once more when it settles', async ($, on) => {
  const world = boot(on, { store: { tab: 'usage' } })
  let asks = 0
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  on('session.usage', async (_, e) => {
    if (e.breakdown !== undefined) {
      asks += 1
      if (asks === 1) await gate
    }

    return { value: { startedAt: 0, context: { window: 200_000, breakdown: BREAKDOWN }, rateLimits: [] } }
  })
  // the stored tab starts a read, which waits at the gate; two turn ends meanwhile ask for more
  await start($)
  const turn = () => $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage('claude-opus-5-5', 1, 1) })
  await turn()
  await turn()
  expect(asks).toBe(1)
  release()
  await world.clock.advance(10)
  expect(asks).toBe(2)
})

test('a user and a project CLAUDE.md that shorten alike say which they are', () => {
  const file = (path: string, type: string, tokens: number) => ({ path, type, tokens })
  const view = contextOf({
    ...BREAKDOWN,
    memoryFiles: [file('/home/ana/.claude/CLAUDE.md', 'User', 300), file('/work/.claude/CLAUDE.md', 'Project', 900), file('/work/AGENTS.md', 'Project', 50)],
  } as unknown as SessionContextBreakdown)
  expect(view.memory.map(m => m.name)).toEqual(['Project: .claude/CLAUDE.md', 'User: .claude/CLAUDE.md', 'work/AGENTS.md'])
})

test('two files of the same type that shorten alike take more of their path until they differ', () => {
  const file = (path: string, type: string, tokens: number) => ({ path, type, tokens })
  const view = contextOf({
    ...BREAKDOWN,
    memoryFiles: [
      file('C:\\code\\repo\\.claude\\CLAUDE.md', 'Project', 900),
      file('/code/repo/sub/.claude/CLAUDE.md', 'Project', 500),
      file('/home/ana/.claude/CLAUDE.md', 'User', 300),
      file('/a/x/y/CLAUDE.md', 'Local', 20),
      file('/b/a/x/y/CLAUDE.md', 'Local', 10),
    ],
  } as unknown as SessionContextBreakdown)
  const names = view.memory.map(m => m.name)
  expect(names).toEqual([
    'Project: repo/.claude/CLAUDE.md',
    'Project: sub/.claude/CLAUDE.md',
    'User: .claude/CLAUDE.md',
    // one path is the other's end: the shorter is named whole, the longer by one more part
    'Local: a/x/y/CLAUDE.md',
    'Local: b/a/x/y/CLAUDE.md',
  ])
  expect(new Set(names).size).toBe(names.length)
})

test('a stored usage tab opens on it, with its breakdown already read', async ($, on) => {
  const world = boot(on, { store: { tab: 'usage' } })
  const asked: string[] = []
  answerBreakdown(on, world, asked)
  await start($)
  await world.clock.advance(0)
  expect(asked).toEqual(['summary'])
  expect(await shows($, 'desktop', /^Contexto ahora · 18%$/, 'Text', 'usage')).toBe(true)
})

test('a context past 80 % names itself on the tab button, and below that it says nothing', async ($, on) => {
  boot(on)
  await start($)
  const label = async (): Promise<string> => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const text = String((await ui.find({ type: 'Button', key: 'tab-usage' }))?.props.label)
    await ui.unmount()

    return text
  }
  expect(await label()).toBe('Uso')
  await $.session.measure({ context: { window: 200_000, tokens: 170_000, percent: 85 }, rateLimits: [], changed: ['context'] })
  expect(await label()).toBe('Uso 85%')
})

test('a compaction that ran is counted on the tab; one the engine skipped is not', async ($, on) => {
  const world = boot(on)
  answerBreakdown(on, world)
  await start($)
  const compact = (): Promise<unknown> =>
    $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  const count = async (): Promise<string> => {
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage('claude-opus-5-5', 1, 1) })
    await onTab($, 'usage')

    return (await cardTexts($, 'desktop')).join('\n')
  }
  await compact()
  expect(await count()).not.toMatch(/[0-9] compactaci/)
  world.isCompacting = true
  await compact()
  expect(await count()).toContain('1 compactación')
})
