import { expect } from 'claude-code/testing'
import { test } from './support'
import type { Engine } from 'claude-code/testing'

import { DEFAULT_MODELS, MODELS_KEY, MODELS_SHAPE } from '../hooks/state'
import { PANE, SURFACES, boot, start } from './support'

const stored = (roles: Partial<typeof DEFAULT_MODELS>) => ({ shape: MODELS_SHAPE, roles: { ...DEFAULT_MODELS, ...roles } })

/** The keys of every button the team tab draws, in the order it draws them. */
const buttonKeys = async ($: Engine, surface: (typeof SURFACES)[number] = 'desktop'): Promise<string[]> => {
  const ui = await $.ui.mount({ ...PANE, surface })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => String(b.key))
  await ui.unmount()

  return keys
}

const press = async ($: Engine, key: string): Promise<void> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key })
  await ui.unmount()
}

/** The value a model or effort button shows ("Sonnet", "medium"). */
const valueOf = async ($: Engine, key: string): Promise<string | undefined> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = await ui.find({ type: 'Button', key })
  await ui.unmount()

  return found === undefined ? undefined : String(found.props.label)
}

// ------------------------------------------------------------ the two sections

for (const surface of SURFACES) {
  test(`on ${surface} the team tab has a "Equipo" section over a "Acciones del equipo" one, both unfolded`, async ($, on) => {
    boot(on)
    await start($)
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Button', key: 'fold-config' }))?.props.label).toBe('Equipo')
    expect((await ui.find({ type: 'Button', key: 'fold-actions' }))?.props.label).toBe('Acciones del equipo')
    await ui.unmount()

    const keys = await buttonKeys($, surface)
    const at = (key: string): number => keys.indexOf(key)
    for (const key of ['fold-config', 'delegation', 'model-explorer', 'model-reviewer', 'fold-actions', 'main-row-x']) expect(at(key)).toBeGreaterThanOrEqual(0)
    // Delegate and Models sit under the first header, Claude and the agents under the second
    expect(at('fold-config')).toBeLessThan(at('delegation'))
    expect(at('delegation')).toBeLessThan(at('model-reviewer'))
    expect(at('model-reviewer')).toBeLessThan(at('fold-actions'))
    expect(at('fold-actions')).toBeLessThan(at('main-row-x'))
  })
}

test('the sections are titled in English when the pane is', { options: { language: 'en' } }, async ($, on) => {
  boot(on, { env: { LANG: 'en_US.UTF-8' } })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Button', key: 'fold-config' }))?.props.label).toBe('Team')
  expect((await ui.find({ type: 'Button', key: 'fold-actions' }))?.props.label).toBe('Team actions')
  await ui.unmount()
})

test('folding the first section hides Delegate and Models and keeps the second; folding it again brings them back', async ($, on) => {
  boot(on)
  await start($)

  await press($, 'fold-config')
  const folded = await buttonKeys($)
  expect(folded).toContain('fold-config')
  expect(folded).not.toContain('delegation')
  expect(folded).not.toContain('model-tester')
  expect(folded).not.toContain('models-reset')
  expect(folded).toContain('main-row-x')

  await press($, 'fold-config')
  expect(await buttonKeys($)).toContain('delegation')
})

test('folding the second section hides Claude and the agents and keeps the first', async ($, on) => {
  boot(on)
  await start($)

  await press($, 'fold-actions')
  const folded = await buttonKeys($)
  expect(folded).toContain('fold-actions')
  expect(folded).not.toContain('main-row-x')
  expect(folded).toContain('delegation')
  expect(folded).toContain('model-tester')

  await press($, 'fold-actions')
  expect(await buttonKeys($)).toContain('main-row-x')
})

test('the Delegate button is a normal button, not a plain one, and still switches delegation', async ($, on) => {
  boot(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const button = await ui.find({ type: 'Button', key: 'delegation' })
  await ui.unmount()

  expect(button?.props.label).toBe('Delegar: sí')
  expect(button?.props.plain).toBeFalsy()

  await press($, 'delegation')
  expect(await valueOf($, 'delegation')).toBe('Delegar: no')
})

// ------------------------------------------------------------ two presses in a row

/** Presses without waiting between presses, then lets everything they started finish. */
const pressTogether = async ($: Engine, keys: string[]): Promise<void> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await Promise.all(keys.map(key => ui.press({ key })))
  await ui.unmount()
}

test('two model presses fired together both apply: Haiku to Sonnet to Opus', async ($, on) => {
  const world = boot(on)
  // a store that answers late, with what it held when asked: two unqueued changes would both read Haiku
  world.onStoreGet = async key => {
    if (key !== MODELS_KEY) return
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  }
  await start($)

  await pressTogether($, ['model-explorer', 'model-explorer'])
  await world.clock.settle()

  expect(world.stored[MODELS_KEY]).toEqual(stored({ explorer: { model: 'opus', effort: 'low' } }))
  expect(await valueOf($, 'model-explorer')).toBe('Opus')
})

test('a model and an effort pressed together are both kept', async ($, on) => {
  const world = boot(on)
  world.onStoreGet = async key => {
    if (key !== MODELS_KEY) return
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  }
  await start($)

  await pressTogether($, ['model-tester', 'effort-tester', 'model-reviewer'])
  await world.clock.settle()

  expect(world.stored[MODELS_KEY]).toEqual(
    stored({
      tester: { model: 'opus', effort: 'high' },
      reviewer: { model: 'haiku', effort: 'high' },
    }),
  )
})

test('a store write that fails does not block the press after it', async ($, on) => {
  const world = boot(on)
  await start($)
  let failures = 0
  const real = world.stored
  world.stored = new Proxy(real, {
    set: (target, key, value) => {
      if (key === MODELS_KEY && failures === 0) {
        failures += 1
        throw new Error('EBUSY: store is locked')
      }
      ;(target as Record<PropertyKey, unknown>)[key] = value

      return true
    },
  })

  await press($, 'model-explorer')
  expect(failures).toBe(1)
  await press($, 'model-explorer')

  // the first write never landed, so the second moves Haiku to Sonnet; the point is that it is applied at all
  expect(real[MODELS_KEY]).toEqual(stored({ explorer: { model: 'sonnet', effort: 'low' } }))
  expect(await valueOf($, 'model-explorer')).toBe('Sonnet')
})

// ------------------------------------------------------------ another window's change

const describe = ($: Engine) => $.tool.describe({ tool: 'Agent', description: 'Launch.', provider: { plugin: 'engine', tier: 'core' } } as never)

test('a change another window made shows in the Models block after the Agent tool is described', async ($, on) => {
  const world = boot(on)
  on('tool.describe', (_, e) => ({ description: e.description }))
  await start($)
  expect(await valueOf($, 'model-tester')).toBe('Sonnet')

  // another window's choice, written to the shared store
  world.stored[MODELS_KEY] = stored({ tester: { model: 'opus', effort: 'max' } })
  expect(await valueOf($, 'model-tester')).toBe('Sonnet')

  await describe($)
  expect(await valueOf($, 'model-tester')).toBe('Opus')
  expect(await valueOf($, 'effort-tester')).toBe('max')
})

test('a change another window made shows in the Models block after an Agent call', async ($, on) => {
  const world = boot(on)
  world.toolResult = () => ({ result: { status: 'async_launched' } })
  await start($)

  world.stored[MODELS_KEY] = stored({ reviewer: { model: 'haiku', effort: 'low' } })
  expect(await valueOf($, 'model-reviewer')).toBe('Opus')

  await $.tool.call({ tool: 'Agent', description: 'A job', prompt: 'Goal: x.', subagent_type: 'agent-team:tester' } as never)
  expect(await valueOf($, 'model-reviewer')).toBe('Haiku')
  expect(await valueOf($, 'effort-reviewer')).toBe('low')
})

test('a store that cannot be read leaves the Models block as it was', async ($, on) => {
  const world = boot(on)
  on('tool.describe', (_, e) => ({ description: e.description }))
  await start($)
  await press($, 'model-tester')
  expect(await valueOf($, 'model-tester')).toBe('Opus')

  world.onStoreGet = key => (key === MODELS_KEY ? Promise.reject(new Error('store is down')) : undefined)
  await describe($)

  expect(await valueOf($, 'model-tester')).toBe('Opus')
})

test('with delegation off the Agent description is untouched and the block keeps its own choice', async ($, on) => {
  const world = boot(on)
  on('tool.describe', (_, e) => ({ description: e.description }))
  await start($)
  await press($, 'delegation')
  world.stored[MODELS_KEY] = stored({ tester: { model: 'opus', effort: 'max' } })

  expect((await describe($)).description).toBe('Launch.')
  expect(await valueOf($, 'model-tester')).toBe('Sonnet')
})
