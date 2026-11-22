import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { DEFAULT_MODELS, MODELS_KEY, MODELS_SHAPE, TEAM_DELEGATION, chosenFor, isCostlier, isCostliest, modelsFrom, teamDelegation, withTeamDelegation } from '../hooks/state'
import { PANE, SURFACES, boot, finish, spawn, start, usage } from './support'
import type { World } from './support'

const ENGLISH = { LANG: 'en_US.UTF-8' } as const

/** The texts and button labels of the team tab's models block, row by row as drawn. */
const block = async ($: Engine, surface: (typeof SURFACES)[number] = 'desktop') => {
  const ui = await $.ui.mount({ ...PANE, surface })
  const label = async (key: string): Promise<string | undefined> => {
    const found = await ui.find({ type: 'Button', key })
    return found === undefined ? undefined : String(found.props.label)
  }
  // A model or effort button's label names the control whole ("implementer model: Sonnet"): the value is what follows the colon.
  const value = async (key: string): Promise<string | undefined> => (await label(key))?.split(': ').pop()
  const roles: Record<string, { model?: string; effort?: string }> = {}
  const labels: Record<string, string | undefined> = {}
  for (const role of ['explorer', 'implementer', 'tester', 'reviewer']) {
    roles[role] = { model: await value(`model-${role}`), effort: await value(`effort-${role}`) }
    labels[`model-${role}`] = await label(`model-${role}`)
    labels[`effort-${role}`] = await label(`effort-${role}`)
  }
  const texts = (await ui.findAll({ type: 'Text' })).map(n => String((n as unknown as { text?: string }).text ?? ''))
  const reset = await label('models-reset')
  await ui.unmount()

  return { roles, labels, texts, reset }
}

const press = async ($: Engine, key: string, times = 1): Promise<void> => {
  for (let i = 0; i < times; i += 1) {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key })
    await ui.unmount()
  }
}

/** Calls the Agent tool as Claude would, and returns the input the engine beneath received. */
const callAgent = async ($: Engine, world: World, input: Record<string, unknown>): Promise<Record<string, unknown>> => {
  let seen: Record<string, unknown> = {}
  world.toolResult = e => {
    seen = { ...e }

    return { result: { status: 'async_launched' } }
  }
  await $.tool.call({ tool: 'Agent', description: 'A job', prompt: 'Goal: x. Why: y.', ...input } as never)

  return seen
}

// ------------------------------------------------------------ the store

test('a missing, older or damaged stored value reads as the defaults; a good one is kept, field by field', () => {
  expect(modelsFrom(undefined)).toEqual(DEFAULT_MODELS)
  expect(modelsFrom(null)).toEqual(DEFAULT_MODELS)
  expect(modelsFrom('opus')).toEqual(DEFAULT_MODELS)
  // another shape tag, or none, is an earlier version's: declined whole
  expect(modelsFrom({ shape: 'models-0', roles: { tester: { model: 'opus', effort: 'max' } } })).toEqual(DEFAULT_MODELS)
  expect(modelsFrom({ roles: { tester: { model: 'opus', effort: 'max' } } })).toEqual(DEFAULT_MODELS)
  // a field that is not one of the offered values is that field's default
  expect(
    modelsFrom({ shape: MODELS_SHAPE, roles: { tester: { model: 'opus', effort: 'turbo' }, reviewer: { model: 'fable' }, explorer: 7 } }),
  ).toEqual({ ...DEFAULT_MODELS, tester: { model: 'opus', effort: 'medium' } })
})

test('the defaults are what the agent files say', () => {
  expect(DEFAULT_MODELS).toEqual({
    explorer: { model: 'haiku', effort: 'low' },
    implementer: { model: 'sonnet', effort: 'medium' },
    tester: { model: 'sonnet', effort: 'medium' },
    reviewer: { model: 'opus', effort: 'high' },
  })
})

test('a choice made in the pane is stored, and the next session starts with it', async ($, on) => {
  const world = boot(on)
  await start($)
  await press($, 'model-tester', 2)
  await press($, 'effort-explorer')
  expect(world.stored[MODELS_KEY]).toEqual({
    shape: MODELS_SHAPE,
    roles: { ...DEFAULT_MODELS, tester: { model: 'haiku', effort: 'medium' }, explorer: { model: 'haiku', effort: 'medium' } },
  })
})

test('a session whose store holds choices draws them and runs on them', async ($, on) => {
  const world = boot(on, { store: { [MODELS_KEY]: { shape: MODELS_SHAPE, roles: { ...DEFAULT_MODELS, implementer: { model: 'opus', effort: 'high' } } } } })
  await start($)
  expect((await block($)).roles.implementer).toEqual({ model: 'Opus', effort: 'high' })
  const sent = await callAgent($, world, { subagent_type: 'agent-team:implementer' })
  expect(sent.model).toBe('opus')
  expect(sent.effort).toBe('high')
})

// ------------------------------------------------------------ the Agent call

test('a role moved off its defaults fills what the call left unset', () => {
  const models = { ...DEFAULT_MODELS, tester: { model: 'opus', effort: 'xhigh' } } as const
  expect(chosenFor({ subagent_type: 'agent-team:tester' }, models)).toEqual({ model: 'opus', effort: 'xhigh' })
  // Claude's own model for the call wins; the effort it left unset is the chosen one
  expect(chosenFor({ subagent_type: 'agent-team:tester', model: 'sonnet' }, models)).toEqual({ model: 'sonnet', effort: 'xhigh' })
  expect(chosenFor({ subagent_type: 'agent-team:tester', model: 'haiku', effort: 'low' }, models)).toEqual({ model: 'haiku', effort: 'low' })
  // a role on its defaults, another agent type, the old bare names or no type: the call is left as it came
  expect(chosenFor({ subagent_type: 'agent-team:reviewer' }, models)).toBeUndefined()
  expect(chosenFor({ subagent_type: 'general-purpose' }, models)).toBeUndefined()
  expect(chosenFor({ subagent_type: 'tester' }, models)).toBeUndefined()
  expect(chosenFor({}, models)).toBeUndefined()
})

test('the Agent call carries the chosen model and effort; an explicit model from Claude wins', async ($, on) => {
  const world = boot(on)
  await start($)
  // implementer: Sonnet → Opus, medium → high
  await press($, 'model-implementer')
  await press($, 'effort-implementer')

  const plain = await callAgent($, world, { subagent_type: 'agent-team:implementer' })
  expect(plain.model).toBe('opus')
  expect(plain.effort).toBe('high')

  const escalated = await callAgent($, world, { subagent_type: 'agent-team:implementer', model: 'sonnet' })
  expect(escalated.model).toBe('sonnet')
  expect(escalated.effort).toBe('high')

  const both = await callAgent($, world, { subagent_type: 'agent-team:implementer', model: 'haiku', effort: 'low' })
  expect(both.model).toBe('haiku')
  expect(both.effort).toBe('low')
})

test('a role on its defaults and other agent types are called as Claude wrote it', async ($, on) => {
  const world = boot(on)
  await start($)
  await press($, 'model-tester')

  const reviewer = await callAgent($, world, { subagent_type: 'agent-team:reviewer' })
  expect('model' in reviewer).toBe(false)
  expect('effort' in reviewer).toBe(false)

  for (const type of ['general-purpose', 'tester', 'Explore']) {
    const other = await callAgent($, world, { subagent_type: type })
    expect('model' in other, type).toBe(false)
    expect('effort' in other, type).toBe(false)
  }
})

test("a call from inside an agent is rewritten too, and the spawned agent's row shows the model it runs on", async ($, on) => {
  const world = boot(on)
  await start($)
  await press($, 'model-explorer')
  const sent = await callAgent($, world, { subagent_type: 'agent-team:explorer', agentId: 'impl-1' })
  expect(sent.model).toBe('sonnet')
  expect(sent.effort).toBe('low')

  // The engine spawns with the call's model: the row names it, and keeps it when the turn ends.
  await spawn($, 'e1', 'agent-team:explorer', { model: 'sonnet' })
  const shown = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const found = (await ui.findAll({ type: 'Text' })).map(n => String((n as unknown as { text?: string }).text ?? ''))
    await ui.unmount()

    return found
  }
  const onRow = /(^|· )sonnet( ·|$)/
  expect((await shown()).some(text => onRow.test(text))).toBe(true)
  await finish($, 'e1', 'answer', usage('claude-sonnet-5-5', 10, 10))
  expect((await shown()).some(text => onRow.test(text))).toBe(true)
})

// ------------------------------------------------------------ the block

for (const [lang, env, words] of [
  ['Spanish', undefined, { title: 'Modelos', mark: 'por defecto', reset: 'Restablecer', costly: /^Opus, xhigh y max gastan más/, model: 'modelo de implementer: Sonnet', effort: 'esfuerzo de implementer: medium' }],
  ['English', ENGLISH, { title: 'Models', mark: 'default', reset: 'Reset', costly: /^Opus, xhigh and max use more/, model: 'implementer model: Sonnet', effort: 'implementer effort: medium' }],
] as const) {
  for (const surface of SURFACES) {
    test(`the models block in ${lang} on ${surface}: one row a role, the default mark, cycling and reset`, async ($, on) => {
      boot(on, env === undefined ? {} : { env })
      await start($)

      const fresh = await block($, surface)
      expect(fresh.texts).toContain(words.title)
      expect(fresh.roles).toEqual({
        explorer: { model: 'Haiku', effort: 'low' },
        implementer: { model: 'Sonnet', effort: 'medium' },
        tester: { model: 'Sonnet', effort: 'medium' },
        reviewer: { model: 'Opus', effort: 'high' },
      })
      for (const role of ['explorer', 'implementer', 'tester', 'reviewer']) expect(fresh.texts).toContain(role)
      // each button is named whole, its value drawn on it
      expect(fresh.labels['model-implementer']).toBe(words.model)
      expect(fresh.labels['effort-implementer']).toBe(words.effort)
      expect(fresh.texts.filter(text => text === words.mark)).toHaveLength(4)
      // nothing to reset and nothing costly the person chose: the reviewer's own Opus says nothing
      expect(fresh.reset).toBeUndefined()
      expect(fresh.texts.some(text => words.costly.test(text))).toBe(false)

      // Haiku → Sonnet → Opus → Haiku; low → medium → high → xhigh → max → low
      await press($, 'model-explorer')
      expect((await block($, surface)).roles.explorer).toEqual({ model: 'Sonnet', effort: 'low' })
      await press($, 'model-explorer', 2)
      expect((await block($, surface)).roles.explorer).toEqual({ model: 'Haiku', effort: 'low' })
      const efforts: string[] = []
      for (let i = 0; i < 5; i += 1) {
        await press($, 'effort-explorer')
        efforts.push((await block($, surface)).roles.explorer?.effort ?? '')
      }
      expect(efforts).toEqual(['medium', 'high', 'xhigh', 'max', 'low'])

      // a moved role loses its mark; Opus or an effort past high says what it spends
      await press($, 'model-tester')
      const moved = await block($, surface)
      expect(moved.texts.filter(text => text === words.mark)).toHaveLength(3)
      expect(moved.reset).toBe(words.reset)
      expect(moved.texts.some(text => words.costly.test(text))).toBe(true)

      await press($, 'models-reset')
      const back = await block($, surface)
      expect(back.roles).toEqual(fresh.roles)
      expect(back.texts.filter(text => text === words.mark)).toHaveLength(4)
      expect(back.reset).toBeUndefined()
    })
  }
}

test('a role moved to a cheaper setting is not called costly', async ($, on) => {
  boot(on)
  await start($)
  // implementer: medium → high, still Sonnet
  await press($, 'effort-implementer')
  const shown = await block($)
  expect(shown.reset).toBe('Restablecer')
  expect(shown.texts.some(text => /gastan más/.test(text))).toBe(false)
  // high → xhigh
  await press($, 'effort-implementer')
  expect((await block($)).texts.some(text => /gastan más/.test(text))).toBe(true)
})

test('reset stores the defaults, so a later session starts on them', async ($, on) => {
  const world = boot(on)
  await start($)
  await press($, 'model-reviewer')
  await press($, 'models-reset')
  expect(modelsFrom(world.stored[MODELS_KEY])).toEqual(DEFAULT_MODELS)
  const sent = await callAgent($, world, { subagent_type: 'agent-team:reviewer' })
  expect('model' in sent).toBe(false)
})

// ------------------------------------------------------------ the Agent tool's team paragraph

/** The paragraph as 0.9.0 wrote it, byte for byte: what every role on its defaults still reads. */
const OLD_PARAGRAPH =
  "**The user's agent team.** The user set up a team for this work: `agent-team:explorer` (Haiku, cheap read-only " +
  'search), `agent-team:implementer` (Sonnet, makes an agreed change and verifies it), `agent-team:tester` (Sonnet, ' +
  'writes and runs tests) and `agent-team:reviewer` (Opus, reviews a finished diff; the costliest, so only for ' +
  "non-trivial changes). Delegate to them as the team rules in the user's instructions say, without asking first; " +
  'where there are no such rules, send the explorer when an answer needs more than five files. A spawn starts ' +
  'without this conversation, so its brief carries the goal, why, files with lines, done-when and limits. To follow ' +
  'up with an agent that already has the context (an answer to its QUESTIONS, a fix to its own work), continue it ' +
  'with SendMessage instead of spawning a new one. For anything else work inline with your own tools, and spawn ' +
  'other agent types only when the user asks.'

test('on the defaults the team paragraph is the old text, byte for byte', () => {
  expect(teamDelegation(DEFAULT_MODELS)).toBe(OLD_PARAGRAPH)
  expect(TEAM_DELEGATION).toBe(OLD_PARAGRAPH)
  expect(withTeamDelegation('Spawn an agent.')).toBe(`Spawn an agent.\n\n${OLD_PARAGRAPH}`)
})

test('a moved role is named with its chosen model, and its effort when that moved', () => {
  const text = teamDelegation({
    ...DEFAULT_MODELS,
    explorer: { model: 'sonnet', effort: 'low' },
    tester: { model: 'opus', effort: 'max' },
    reviewer: { model: 'sonnet', effort: 'high' },
  })
  expect(text).toContain('`agent-team:explorer` (Sonnet, cheap read-only search)')
  expect(text).toContain('`agent-team:implementer` (Sonnet, makes an agreed change')
  expect(text).toContain('`agent-team:tester` (Opus at max effort, writes and runs tests)')
  // off Opus the reviewer is no longer called the costliest
  expect(text).toContain('`agent-team:reviewer` (Sonnet, reviews a finished diff; only for non-trivial changes)')
  expect(text).not.toContain('Haiku')
})

test('the Agent tool is described with the models in the store, even before the session read them', async ($, on) => {
  boot(on, { store: { [MODELS_KEY]: { shape: MODELS_SHAPE, roles: { ...DEFAULT_MODELS, explorer: { model: 'opus', effort: 'low' } } } } })
  on('tool.describe', (_, e) => ({ description: e.description }))
  const describe = async () =>
    (await $.tool.describe({ tool: 'Agent', description: 'Launch.', provider: { plugin: 'engine', tier: 'core' } } as never)).description
  // no session.start yet
  expect(await describe()).toContain('`agent-team:explorer` (Opus, cheap read-only search)')

  await start($)
  await press($, 'models-reset')
  expect(await describe()).toBe(`Launch.\n\n${OLD_PARAGRAPH}`)
  await press($, 'model-reviewer')
  expect(await describe()).toContain('`agent-team:reviewer` (Haiku, reviews a finished diff; only for')
})

// ------------------------------------------------------------ one store for every window

test("a press applies to what the store holds: another window's choice made since this one started is kept", async ($, on) => {
  const world = boot(on)
  await start($)
  // another window moves the tester after this one read the store
  world.stored[MODELS_KEY] = { shape: MODELS_SHAPE, roles: { ...DEFAULT_MODELS, tester: { model: 'opus', effort: 'medium' } } }
  await press($, 'model-explorer')
  expect(modelsFrom(world.stored[MODELS_KEY])).toEqual({
    ...DEFAULT_MODELS,
    tester: { model: 'opus', effort: 'medium' },
    explorer: { model: 'sonnet', effort: 'low' },
  })
  // and this window draws both now
  const shown = await block($)
  expect(shown.roles.tester).toEqual({ model: 'Opus', effort: 'medium' })
  expect(shown.roles.explorer).toEqual({ model: 'Sonnet', effort: 'low' })
})

test('the Agent call runs on what another window stored, as the team paragraph says', async ($, on) => {
  const world = boot(on)
  await start($)
  world.stored[MODELS_KEY] = { shape: MODELS_SHAPE, roles: { ...DEFAULT_MODELS, implementer: { model: 'haiku', effort: 'high' } } }
  const sent = await callAgent($, world, { subagent_type: 'agent-team:implementer' })
  expect(sent.model).toBe('haiku')
  expect(sent.effort).toBe('high')
})

test("a store that cannot be read gives the Agent call this window's choice, and the paragraph the defaults", async ($, on) => {
  const world = boot(on)
  on('tool.describe', (_, e) => ({ description: e.description }))
  await start($)
  await press($, 'model-tester')
  world.onStoreGet = key => (key === MODELS_KEY ? Promise.reject(new Error('store is down')) : undefined)
  const described = await $.tool.describe({ tool: 'Agent', description: 'Launch.', provider: { plugin: 'engine', tier: 'core' } } as never)
  expect(described.description).toBe(`Launch.\n\n${OLD_PARAGRAPH}`)
  const sent = await callAgent($, world, { subagent_type: 'agent-team:tester' })
  expect(sent.model).toBe('opus')
})

test('an explicit model the pane does not offer survives the rewrite, and a fork is called as written', async ($, on) => {
  const world = boot(on)
  await start($)
  await press($, 'model-implementer')
  const fable = await callAgent($, world, { subagent_type: 'agent-team:implementer', model: 'fable' })
  expect(fable.model).toBe('fable')
  expect(fable.effort).toBe('medium')
  const fork = await callAgent($, world, { subagent_type: 'fork' })
  expect('model' in fork).toBe(false)
  expect('effort' in fork).toBe(false)
})

// ------------------------------------------------------------ what costs more

test('only a role moved up is costlier: to Opus from below, or its effort past its default to xhigh or max', () => {
  expect(isCostlier('explorer', { model: 'opus', effort: 'low' })).toBe(true)
  expect(isCostlier('implementer', { model: 'sonnet', effort: 'xhigh' })).toBe(true)
  expect(isCostlier('reviewer', { model: 'opus', effort: 'max' })).toBe(true)
  // the reviewer lowered, or a rise that stays below xhigh
  expect(isCostlier('reviewer', { model: 'opus', effort: 'low' })).toBe(false)
  expect(isCostlier('reviewer', { model: 'haiku', effort: 'high' })).toBe(false)
  expect(isCostlier('implementer', { model: 'sonnet', effort: 'high' })).toBe(false)
  expect(isCostlier('explorer', { model: 'sonnet', effort: 'low' })).toBe(false)
})

test('a reviewer lowered to Opus at low says nothing of the limits', async ($, on) => {
  boot(on)
  await start($)
  // high → xhigh → max → low
  await press($, 'effort-reviewer', 3)
  const shown = await block($)
  expect(shown.roles.reviewer).toEqual({ model: 'Opus', effort: 'low' })
  expect(shown.reset).toBe('Restablecer')
  expect(shown.texts.some(text => /gastan más/.test(text))).toBe(false)
})

test('"the costliest" stays with the reviewer only while no other role runs on as much', () => {
  expect(isCostliest(DEFAULT_MODELS, 'reviewer')).toBe(true)
  const tester = { ...DEFAULT_MODELS, tester: { model: 'opus', effort: 'max' } } as const
  expect(isCostliest(tester, 'reviewer')).toBe(false)
  expect(teamDelegation(tester)).toContain('reviews a finished diff; only for non-trivial changes')
  // a tie is no superlative either
  const tie = { ...DEFAULT_MODELS, implementer: { model: 'opus', effort: 'high' } } as const
  expect(teamDelegation(tie)).not.toContain('the costliest')
  // the reviewer lowered in effort but still alone on top keeps it
  expect(teamDelegation({ ...DEFAULT_MODELS, reviewer: { model: 'opus', effort: 'low' } })).toContain('the costliest, so only for')
})
