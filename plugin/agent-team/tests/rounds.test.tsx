import { expect } from 'claude-code/testing'
import { test } from './support'
import type { Engine } from 'claude-code/testing'

import { isLateForRuns, RUNS_MIN_MS } from '../hooks/actions'
import { setLanguage } from '../hooks/i18n'
import { EMPTY, runsEntry, runsFileName, ROUNDS_LIMIT } from '../hooks/state'
import type { World } from './support'
import { boot as bootEngine, finish, shows, spawn, start, usage } from './support'

setLanguage('es')

/** The engine beneath the plugin, with the end of a session answered as the engine does. */
const boot = (on: Parameters<typeof bootEngine>[0], options?: Parameters<typeof bootEngine>[1]) => {
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))

  return bootEngine(on, options)
}

const CONFIG = '/fake/config'
/** The session log: one file per session in this folder. */
const RUNS = `${CONFIG}/agent-team/runs`
/** Where 0.8.6 and before kept the whole log in one file. */
const OLD_LOG = `${CONFIG}/agent-team/runs.md`
const env = { CLAUDE_CONFIG_DIR: CONFIG }

/** The session files written, in the order they were. */
const logFiles = (world: World): string[] => world.written.filter(path => path.startsWith(`${RUNS}/`))
/** Everything the session files hold. */
const logText = (world: World): string => logFiles(world).map(path => world.files[path] ?? '').join('')

const endSession = ($: Engine) => $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })

/** One continuation as the engine raises it: the resume spawn, then the agent's own turn. */
const wake = async ($: Engine, id: string, type: string) => {
  await spawn($, id, type, { prompt: 'again', resume: { agentId: id } })
  await $.turn.start({ text: 'again', turnId: `t-${id}`, agentId: id } as never)
}

// ------------------------------------------------------------ rounds

test('a continuation counts one round, and rounds survive the wake-up reset', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  await finish($, 'a1', 'answer', usage('claude-sonnet-5-5', 10, 10))
  expect(await shows($, 'desktop', /↻/)).toBe(false)

  await wake($, 'a1', 'agent-team:implementer')
  expect(await shows($, 'desktop', /↻1$/, 'Text', 'team')).toBe(true)
  await finish($, 'a1')
  await wake($, 'a1', 'agent-team:implementer')
  expect(await shows($, 'desktop', /↻2$/, 'Text', 'team')).toBe(true)
  expect(await shows($, 'desktop', /rondas/)).toBe(false)
})

test('from five rounds the row warns in words', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  for (let i = 0; i < ROUNDS_LIMIT; i++) {
    await finish($, 'a1')
    await wake($, 'a1', 'agent-team:implementer')
  }
  expect(await shows($, 'desktop', /^⚠ 5 rondas: Claude debería parar y preguntarte$/, 'Text', 'team')).toBe(true)
})

test('an agent outside the team, woken again, shows no rounds', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'x1', 'Explore')
  await finish($, 'x1')
  await wake($, 'x1', 'Explore')
  await finish($, 'x1')
  expect(await shows($, 'desktop', /^✓ explorer$/, 'Text', 'team')).toBe(true)
  expect(await shows($, 'desktop', /↻/)).toBe(false)
})

/** An agent's turn ending as the engine reports one whose start this plugin never heard. */
const endAlone = ($: Engine, id: string, turnId: string, tokens: ReturnType<typeof usage>) =>
  $.turn.complete({ answer: 'second report', durationMs: 4000, isAborted: false, turnId, agentId: id, usage: tokens, reason: 'answer' })

test('a turn.complete without its turn.start, for an agent that had ended, counts the missed round', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  await $.turn.start({ text: 'go', turnId: 'first', agentId: 'a1' } as never)
  await world.clock.advance(10_000)
  await $.turn.complete({ answer: 'first report', durationMs: 10_000, isAborted: false, turnId: 'first', agentId: 'a1', usage: usage('claude-sonnet-5-5', 1000, 500), reason: 'answer' })
  await world.clock.advance(60_000)
  await endAlone($, 'a1', 'second', usage('claude-sonnet-5-5', 2000, 250))

  expect(await shows($, 'desktop', /↻1$/, 'Text', 'team')).toBe(true)
  // the same end heard twice counts once
  await endAlone($, 'a1', 'second', usage('claude-sonnet-5-5', 2000, 250))
  expect(await shows($, 'desktop', /↻1$/, 'Text', 'team')).toBe(true)
  await endSession($)

  const log = logText(world)
  expect(log).toContain('rondas: 1')
  expect(log).toContain('tiempo: 14s')
  expect(log).toContain('tokens: 3.0k entrada / 750 salida')
  expect(log).toContain('implementer 3.8k ×2')
})

// ------------------------------------------------------------ the session log

test('the formatter lays out the heading, one item per team agent and the spend', () => {
  const squad = {
    ...EMPTY,
    agents: [
      {
        id: 'a1', type: 'agent-team:implementer', role: 'implementer' as const, description: 'Add paging', prompt: '',
        startedAt: 0, endedAt: 65_000, calls: 3, lastActiveAt: 0, status: 'done' as const, model: 'claude-sonnet-5-5',
        rounds: 2, warn: 'brief repeated', tokens: { input: 3000, output: 1000, cacheRead: 0, cacheWrite: 0 },
      },
      { id: 'x', type: 'Explore', role: 'explorer' as const, description: 'ignored', prompt: '', startedAt: 0, calls: 0, lastActiveAt: 0, status: 'done' as const },
    ],
    totals: { implementer: { tokens: 4000, runs: 1 } },
  }
  const text = runsEntry(squad, { folder: '/work/app', branch: 'main' }, new Date(2026, 10, 20, 14, 5).getTime())

  expect(text).toBe(
    [
      '## 2026-11-20 14:05 · /work/app (rama main)',
      '',
      '- **implementer (claude-sonnet-5-5): Add paging**',
      '  estado: hecho · tiempo: 1m 5s · rondas: 2 · tokens: 3.0k entrada / 1.0k salida · aviso: brief repeated',
      '',
      'Sesión: implementer 4.0k ×1 · equipo 100%',
      '',
      '',
    ].join('\n'),
  )
  expect(runsEntry({ ...squad, agents: [squad.agents[1]!] }, { folder: '/work/app' }, 0)).toBe('')
})

test('a session that used the team writes its entry to a file of its own', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:tester')
  await finish($, 'a1', 'answer', usage('claude-sonnet-5-5', 100, 50))
  await endSession($)

  const name = runsFileName(world.clock.now(), 's1')
  expect(world.written).toEqual([`${RUNS}/${name}.md`])
  expect(world.files[`${RUNS}/${name}.md`]).toMatch(/^## .* · \/\n\n- \*\*tester \(.*\): Job a1\*\*\n/)
})

test('a session file is named by its time and the start of the session id', () => {
  const at = new Date(2026, 10, 20, 14, 5).getTime()
  expect(runsFileName(at, '1a2b3c4d-5e6f-7a8b')).toBe('2026-11-20-1405-1a2b3c4d')
  expect(runsFileName(at, '../x y')).toBe('2026-11-20-1405-xy')
  expect(runsFileName(at, '')).toBe('2026-11-20-1405-session')
})

test('two sessions write two files, neither reading the other', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer', { description: 'first window' })
  await $.session.end({ reason: 'other', sessionId: 'aaaa1111', resume: { id: 'aaaa1111' } })
  await spawn($, 'a2', 'agent-team:tester', { description: 'second window' })
  await $.session.end({ reason: 'other', sessionId: 'bbbb2222', resume: { id: 'bbbb2222' } })

  expect(logFiles(world)).toHaveLength(2)
  expect(world.files[logFiles(world)[0] ?? '']).toContain('first window')
  expect(world.files[logFiles(world)[1] ?? '']).toContain('second window')
  expect(world.files[logFiles(world)[1] ?? '']).not.toContain('first window')
})

test('an older runs.md is neither read nor written', async ($, on) => {
  const world = boot(on, { env })
  world.files[OLD_LOG] = 'precious history\n'
  let isRead = false
  world.failRead = path => {
    if (path === OLD_LOG) isRead = true

    return false
  }
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)

  expect(isRead).toBe(false)
  expect(world.files[OLD_LOG]).toBe('precious history\n')
  expect(world.written).not.toContain(OLD_LOG)
  expect(logFiles(world)).toHaveLength(1)
})

test('with the sessionLog option off nothing is written', { options: { sessionLog: false } }, async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)

  expect(world.written).toEqual([])
})

test('without a team agent nothing is written', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'general-purpose')
  await endSession($)

  expect(world.written).toEqual([])
})

test('a log that cannot be written does not hold the end back', async ($, on) => {
  const world = boot(on, { env })
  world.failWrite = () => true
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')

  expect(await endSession($)).toEqual({ sessionId: 's1' })
})

// ------------------------------------------------------------ what the log must never lose or repeat

test('a session that ends twice (a /clear) writes the second time only what is new, to a new file', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer', { description: 'first job' })
  await finish($, 'a1', 'answer', usage('claude-haiku-5-5', 3000, 1000))
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const [firstFile = ''] = logFiles(world)
  const first = world.files[firstFile] ?? ''
  expect(first).toContain('first job')

  await spawn($, 'a2', 'agent-team:tester', { description: 'second job' })
  await finish($, 'a2', 'answer', usage('claude-sonnet-5-5', 200, 100))
  await endSession($)
  // the same session in the same minute: its first file is kept, the new entry gets a name of its own
  expect(logFiles(world)).toEqual([firstFile, firstFile.replace(/\.md$/, '-2.md')])
  expect(world.files[firstFile]).toBe(first)
  const second = world.files[logFiles(world)[1] ?? ''] ?? ''
  expect(second).toContain('second job')
  expect(second).not.toContain('first job')
  expect(second).toContain('tester 300')
  expect(second).not.toContain('explorer')

  // nothing new since: nothing more is written
  const before = world.written.length
  await endSession($)
  expect(world.written.length).toBe(before)
})

test('an agent woken again logs its time and tokens over all its rounds', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  await world.clock.advance(10_000)
  await finish($, 'a1', 'answer', usage('claude-sonnet-5-5', 1000, 500))
  await world.clock.advance(60_000)
  await wake($, 'a1', 'agent-team:implementer')
  await world.clock.advance(5000)
  await finish($, 'a1', 'answer', usage('claude-sonnet-5-5', 2000, 250))
  await endSession($)

  const log = logText(world)
  expect(log).toContain('rondas: 1')
  expect(log).toContain('tiempo: 15s')
  expect(log).toContain('tokens: 3.0k entrada / 750 salida')
})

test('the log is where the config folder is: on Windows USERPROFILE before HOME, never the real one', async ($, on) => {
  const world = boot(on, { env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\ana\\', HOME: '/home/ana' } })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)
  expect(world.written).toEqual([`/Users/ana/.claude/agent-team/runs/${runsFileName(world.clock.now(), 's1')}.md`])
})

test('the log is under HOME when USERPROFILE is not set', async ($, on) => {
  const world = boot(on, { env: { HOME: '/home/ana' } })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)
  expect(world.written).toEqual([`/home/ana/.claude/agent-team/runs/${runsFileName(world.clock.now(), 's1')}.md`])
})

test('off Windows (WSL) the log is under HOME even when USERPROFILE is set', async ($, on) => {
  const world = boot(on, { env: { USERPROFILE: 'C:\\Users\\ana', HOME: '/home/ana' } })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)
  expect(world.written).toEqual([`/home/ana/.claude/agent-team/runs/${runsFileName(world.clock.now(), 's1')}.md`])
})

// The harness meters session.end like any hook, its time standing still during `$` calls, so the
// 1.5 s cut cannot be reached from a test: the check writeRuns makes on `next.budget` just before its write is pinned here.
test('an end with little of its budget left writes nothing', () => {
  expect(isLateForRuns(RUNS_MIN_MS - 1)).toBe(true)
  expect(isLateForRuns(0)).toBe(true)
  expect(isLateForRuns(RUNS_MIN_MS)).toBe(false)
  expect(isLateForRuns(Number.POSITIVE_INFINITY)).toBe(false)
})

test('on Windows with neither OS nor HOME set the log is still under USERPROFILE', async ($, on) => {
  const world = boot(on, { env: { USERPROFILE: 'C:\\Users\\ana' } })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)
  expect(world.written).toEqual([`/Users/ana/.claude/agent-team/runs/${runsFileName(world.clock.now(), 's1')}.md`])
})

test('a missed round ends like any other: its sound, and a notice when it ran long', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  await $.turn.start({ text: 'go', turnId: 'first', agentId: 'a1' } as never)
  await finish($, 'a1')
  await world.clock.advance(60_000)
  await world.clock.settle()
  const clips = world.clips.length
  await $.turn.complete({ answer: 'late report', durationMs: 45_000, isAborted: false, turnId: 'second', agentId: 'a1', reason: 'answer' })
  await world.clock.settle()

  expect(world.clips.slice(clips)).toEqual(['sounds/implementer.wav'])
  expect(world.notified.some(line => line.includes('Job a1'))).toBe(true)
})
