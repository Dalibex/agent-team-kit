import { expect } from 'claude-code/testing'
import { test } from './support'
import type { Engine } from 'claude-code/testing'

import { NOTIFY_KEY, SOUND_KEY } from '../hooks/state'
import { PANE, SURFACES, boot, finish, spawn, start } from './support'

const WINDOWS = { OS: 'Windows_NT' }

/** A press on a button of the pane, as a click does. */
const press = async ($: Engine, key: string): Promise<void> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key })
  await ui.unmount()
}

/** The label of a toggle's button: the icon the desktop app draws, nothing else. */
const toggle = async ($: Engine, key: string, surface: (typeof SURFACES)[number] = 'desktop') => {
  const ui = await $.ui.mount({ ...PANE, surface })
  const button = await ui.find({ type: 'Button', key })
  await ui.unmount()

  return button === undefined ? undefined : String(button.props.label)
}

/** A long agent run that ends, so every channel (clip, system notification) has its reason to fire. */
const longRun = async ($: Engine, world: ReturnType<typeof boot>, id: string): Promise<void> => {
  await spawn($, id, 'Explore', { description: `Job ${id}` })
  await world.clock.advance(35_000)
  await finish($, id, 'answer')
  await world.clock.settle()
}

// ------------------------------------------------------------ the buttons

for (const surface of SURFACES) {
  test(`on ${surface} both toggles are drawn, on, by default`, async ($, on) => {
    boot(on)
    await start($)

    expect(await toggle($, 'toggle-sound', surface)).toEqual('🔊')
    expect((await toggle($, 'toggle-notify', surface))).toBe('🔔')
  })
}

test('a press mutes the sounds, shows the muted icon; another turns them on', async ($, on) => {
  const world = boot(on)
  await start($)

  await press($, 'toggle-sound')
  expect(await toggle($, 'toggle-sound')).toEqual('🔇')
  expect((await toggle($, 'toggle-notify'))).toBe('🔔')
  expect(world.stored[SOUND_KEY]).toBe(false)

  await press($, 'toggle-sound')
  expect(await toggle($, 'toggle-sound')).toEqual('🔊')
  expect(world.stored[SOUND_KEY]).toBe(true)
})

test('a press turns the notifications off, shows the struck-out bell, and on again', async ($, on) => {
  const world = boot(on)
  await start($)

  await press($, 'toggle-notify')
  expect(await toggle($, 'toggle-notify')).toEqual('🔕')
  expect((await toggle($, 'toggle-sound'))).toBe('🔊')
  expect(world.stored[NOTIFY_KEY]).toBe(false)

  await press($, 'toggle-notify')
  expect(await toggle($, 'toggle-notify'))
    .toEqual('🔔')
  expect(world.stored[NOTIFY_KEY]).toBe(true)
})

test('both off show both struck-out icons', async ($, on) => {
  boot(on)
  await start($)
  await press($, 'toggle-sound')
  await press($, 'toggle-notify')

  expect(await toggle($, 'toggle-sound')).toBe('🔇')
  expect(await toggle($, 'toggle-notify')).toBe('🔕')
})

// The desktop app draws a button's label alone: a long one widened the column and squeezed the drawing to a thumbnail.
for (const surface of SURFACES) {
  test(`on ${surface} each toggle is its icon alone, with no text beside it`, async ($, on) => {
    boot(on)
    await start($)
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const key of ['toggle-sound', 'toggle-notify']) {
      const button = await ui.find({ type: 'Button', key })
      expect([...String(button?.props.label)].length).toBe(1)
      expect(button?.props.children ?? []).toEqual([])
    }
    await ui.unmount()
  })
}

// ------------------------------------------------------------ the effect

test('with the sounds on an agent that ends plays its clip', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'answer')
  await world.clock.settle()

  expect(world.clips).toEqual(['sounds/explorer.wav'])
})

test('muted, an agent that ends plays no clip off Windows, and the pane still shows its end', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await press($, 'toggle-sound')
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'answer')
  await world.clock.settle()

  expect(world.clips).toEqual([])
  expect(world.runs).toEqual([])
})

test('muted, nothing is run to play a clip on Windows either, a failure included', async ($, on) => {
  const world = boot(on, { env: WINDOWS })
  await start($)
  await press($, 'toggle-sound')
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'error')
  await world.clock.settle()

  expect(world.clips).toEqual([])
  expect(world.runs).toEqual([])
})

test('turned on again, the sounds play again', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await press($, 'toggle-sound')
  await press($, 'toggle-sound')
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'answer')
  await world.clock.settle()

  expect(world.clips).toEqual(['sounds/explorer.wav'])
})

test('muting the sounds leaves the system notifications on', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await press($, 'toggle-sound')
  await longRun($, world, 'a1')

  expect(world.clips).toEqual([])
  expect(world.notified).toEqual(['explorer terminó tras 35s: Job a1'])
})

test('with the notifications on a long run raises one; turned off it raises none, and the sounds still play', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await press($, 'toggle-notify')
  await longRun($, world, 'a1')

  expect(world.notified).toEqual([])
  expect(world.clips).toEqual(['sounds/explorer.wav'])

  await press($, 'toggle-notify')
  await longRun($, world, 'a2')
  expect(world.notified).toEqual(['explorer terminó tras 35s: Job a2'])
})

test('the toasts are not system notifications: with the notifications off an update still toasts', async ($, on) => {
  const world = boot(on)
  world.http = () => ({
    status: 200,
    ok: true,
    headers: {},
    text: JSON.stringify({ tag_name: 'v9.9.0', html_url: 'https://github.com/Dalibex/agent-team-kit/releases/tag/v9.9.0' }),
  })
  world.stored[NOTIFY_KEY] = false
  await start($)
  await world.clock.advance(3500)
  await world.clock.settle()

  expect(world.toasts.filter(text => text.includes('9.9.0'))).toHaveLength(1)
})

// ------------------------------------------------------------ across sessions

test('the choices are read from the store when a session starts', async ($, on) => {
  const world = boot(on, { env: {}, store: { [SOUND_KEY]: false, [NOTIFY_KEY]: false } })
  await start($)

  expect(await toggle($, 'toggle-sound')).toEqual('🔇')
  expect((await toggle($, 'toggle-notify'))).toBe('🔕')
  await longRun($, world, 'a1')
  expect(world.clips).toEqual([])
  expect(world.notified).toEqual([])
})

test('a store with no value, or anything but false, starts them on', async ($, on) => {
  boot(on, { store: { [SOUND_KEY]: 'no', [NOTIFY_KEY]: 0 } })
  await start($)

  expect((await toggle($, 'toggle-sound'))).toBe('🔊')
  expect((await toggle($, 'toggle-notify'))).toBe('🔔')
})

test('a store that cannot be written does not break the toggle: it still flips for this session', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  world.stored = new Proxy(world.stored, {
    set: () => {
      throw new Error('disk full')
    },
  })
  await press($, 'toggle-sound')

  expect((await toggle($, 'toggle-sound'))).toBe('🔇')
})
