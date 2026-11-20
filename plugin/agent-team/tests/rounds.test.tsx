import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { setLanguage } from '../hooks/i18n'
import { EMPTY, runsEntry, ROUNDS_LIMIT } from '../hooks/state'
import { boot as bootEngine, finish, shows, spawn, start, usage } from './support'

setLanguage('es')

/** The engine beneath the plugin, with the end of a session answered as the engine does. */
const boot = (on: Parameters<typeof bootEngine>[0], options?: Parameters<typeof bootEngine>[1]) => {
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))

  return bootEngine(on, options)
}

const CONFIG = '/fake/config'
const LOG = `${CONFIG}/agent-team/runs.md`
const env = { CLAUDE_CONFIG_DIR: CONFIG }

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
      { id: 'x', type: 'Explore', role: 'other' as const, description: 'ignored', prompt: '', startedAt: 0, calls: 0, lastActiveAt: 0, status: 'done' as const },
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
      'Sesión: implementer 4.0k ×1 · equipo 100 %',
      '',
      '',
    ].join('\n'),
  )
  expect(runsEntry({ ...squad, agents: [squad.agents[1]!] }, { folder: '/work/app' }, 0)).toBe('')
})

test('a session that used the team appends its entry, keeping what the log had', async ($, on) => {
  const world = boot(on, { env })
  world.files[LOG] = 'older entry\n'
  await start($)
  await spawn($, 'a1', 'agent-team:tester')
  await finish($, 'a1', 'answer', usage('claude-sonnet-5-5', 100, 50))
  await endSession($)

  expect(world.written).toEqual([LOG])
  expect(world.files[LOG]).toMatch(/^older entry\n## .* · \/\n\n- \*\*tester \(.*\): Job a1\*\*\n/)
})

test('the log is created when missing', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)

  expect(world.files[LOG]).toMatch(/^## /)
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

test('a log that cannot be read is left as it is', async ($, on) => {
  const world = boot(on, { env })
  world.files[LOG] = 'precious history\n'
  world.failRead = path => path === LOG
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)

  expect(world.files[LOG]).toBe('precious history\n')
  expect(world.written).toEqual([])
})

test('a session that ends twice (a /clear) logs the second time only what is new', async ($, on) => {
  const world = boot(on, { env })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer', { description: 'first job' })
  await finish($, 'a1', 'answer', usage('claude-haiku-5-5', 3000, 1000))
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const first = world.files[LOG] ?? ''
  expect(first).toContain('first job')

  await spawn($, 'a2', 'agent-team:tester', { description: 'second job' })
  await finish($, 'a2', 'answer', usage('claude-sonnet-5-5', 200, 100))
  await endSession($)
  const second = (world.files[LOG] ?? '').slice(first.length)
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

  const log = world.files[LOG] ?? ''
  expect(log).toContain('rondas: 1')
  expect(log).toContain('tiempo: 15s')
  expect(log).toContain('tokens: 3.0k entrada / 750 salida')
})

test('a symbolic link to the log stays a link', async ($, on) => {
  const world = boot(on, { env })
  world.files['/elsewhere/runs.md'] = 'old\n'
  world.files[LOG] = 'old\n'
  world.links[LOG] = '/elsewhere/runs.md'
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)

  expect(world.links[LOG]).toBe('/elsewhere/runs.md')
  expect(world.files['/elsewhere/runs.md']).toMatch(/^old\n## /)
})

test('the log is where the config folder is: USERPROFILE before HOME, HOME alone, never the real one', async ($, on) => {
  const world = boot(on, { env: { USERPROFILE: 'C:\\Users\\ana\\', HOME: '/home/ana' } })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)
  expect(world.written).toEqual(['/Users/ana/.claude/agent-team/runs.md'])
})

test('the log is under HOME when USERPROFILE is not set', async ($, on) => {
  const world = boot(on, { env: { HOME: '/home/ana' } })
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await endSession($)
  expect(world.written).toEqual(['/home/ana/.claude/agent-team/runs.md'])
})
