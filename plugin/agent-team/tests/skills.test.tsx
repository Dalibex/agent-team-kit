import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { boot as bootAt, PANE, shows, start as startAt } from './support'
import type { World } from './support'


/** The engine beneath the plugin, the pane opening on the skills tab. */
const boot: typeof bootAt = (on, options = {}) => bootAt(on, { ...options, store: { tab: 'skills', ...options.store } })

/** Starts the session and opens the loose skills, where these slots live. */
const start = async ($: Engine): Promise<void> => {
  await startAt($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'skills-loose' })
  await ui.unmount()
}

const SLOTS = ['code-review', 'frontend-design:frontend-design', null, null, null, null, null, null]

/** Sends a prompt the way the person's Enter does. */
const ask = ($: Engine, text: string, kind: 'composer' | 'task-notification' = 'composer') =>
  $.prompt.submit({ text, origin: { kind }, wait: false } as never)

const commandsOf = (world: World) => {
  world.commands = [
    { name: 'frontend-design:frontend-design', description: 'Design', source: 'plugin' },
    { name: 'clear', description: 'Clears', source: 'builtin' },
    { name: 'code-review', description: 'Reviews', source: 'user' },
    { name: 'agent-team', description: 'This pane', source: 'plugin' },
  ] as never
}

test('eight empty slots offer to be filled', async ($, on) => {
  boot(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^＋$/ })).toHaveLength(8)
  expect(await ui.find({ type: 'Text', text: /^0 de 8 huecos$/ })).toBeUndefined()
  await ui.unmount()
})

/** Presses the Buttons keyed `keys` in turn, each on a fresh drawing, as clicks in the pane do. */
const press = async ($: Engine, ...keys: string[]): Promise<void> => {
  for (const key of keys) {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key })
    await ui.unmount()
  }
}

/** The label of the Button keyed `key` on the desktop, if it is drawn. */
const labelOf = async ($: Engine, key: string): Promise<string | undefined> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = await ui.find({ type: 'Button', key })
  await ui.unmount()

  return found === undefined ? undefined : String(found.props.label)
}

test('an empty slot opens a picker of buttons: a group, then the skill', async ($, on) => {
  const world = boot(on)
  commandsOf(world)
  await start($)
  await press($, 'slot-btn-0')

  // built-ins and this pane's own command are left out; plugin-less skills first
  expect(await labelOf($, 'skills-group-0')).toBe('sin plugin (1)')
  expect(await labelOf($, 'skills-group-1')).toBe('frontend-design (1)')
  expect(await labelOf($, 'skills-group-2')).toBeUndefined()
  expect(await labelOf($, 'skills-back')).toBe('← Volver')

  await press($, 'skills-group-0')
  expect(await labelOf($, 'skills-choice-0')).toBe('code-review')
  await press($, 'skills-choice-0')

  // the picker closes on the filled slot
  expect(await labelOf($, 'slot-btn-0')).toBe('code-review')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^＋$/ })).toHaveLength(7)
  await ui.unmount()
})

test('Volver steps back: from the skills to the groups, from the groups to the slots', async ($, on) => {
  const world = boot(on)
  commandsOf(world)
  await start($)
  await press($, 'slot-btn-3', 'skills-group-1')
  expect(await labelOf($, 'skills-choice-0')).toBe('frontend-design')

  await press($, 'skills-back')
  expect(await labelOf($, 'skills-choice-0')).toBeUndefined()
  expect(await labelOf($, 'skills-group-0')).toBe('sin plugin (1)')

  await press($, 'skills-back')
  expect(await labelOf($, 'skills-group-0')).toBeUndefined()
  expect(await labelOf($, 'slot-btn-3')).toBe('＋')
})

test('a long group pages ten at a time', async ($, on) => {
  const world = boot(on)
  world.commands = Array.from({ length: 23 }, (_, i) => ({
    name: `skill-${String(i).padStart(2, '0')}`,
    description: '',
    source: 'user',
  })) as never
  await start($)
  await press($, 'slot-btn-0', 'skills-group-0')
  expect(await labelOf($, 'skills-choice-9')).toBe('skill-09')
  expect(await labelOf($, 'skills-choice-10')).toBeUndefined()
  expect(await labelOf($, 'skills-prev')).toBeUndefined()

  await press($, 'skills-next', 'skills-next')
  expect(await labelOf($, 'skills-choice-0')).toBe('skill-20')
  expect(await labelOf($, 'skills-next')).toBeUndefined()
  await press($, 'skills-prev')
  expect(await labelOf($, 'skills-choice-0')).toBe('skill-10')
})

test('edit mode turns filled slots into ✎ buttons that open their picker, and Volver leaves it', async ($, on) => {
  const world = boot(on, { store: { skillSlots: SLOTS } })
  commandsOf(world)
  await start($)
  await press($, 'skills-edit')
  expect(await labelOf($, 'slot-btn-0')).toBe('✎ code-review')
  expect(await labelOf($, 'skills-edit')).toBe('← Volver')

  // a press in edit mode opens the picker instead of picking
  await press($, 'slot-btn-1', 'skills-group-0', 'skills-choice-0')
  expect(await labelOf($, 'slot-btn-1')).toBe('✎ code-review')

  await press($, 'skills-edit')
  expect(await labelOf($, 'slot-btn-0')).toBe('code-review')
  expect(await labelOf($, 'skills-edit')).toBe('✎ Editar')
})

test('the slots come back from the store, short names on the buttons', async ($, on) => {
  boot(on, { store: { skillSlots: SLOTS } })
  await start($)
  expect(await shows($, 'desktop', /^code-review$/, 'Button')).toBe(true)
  expect(await shows($, 'desktop', /^frontend-design$/, 'Button')).toBe(true)
})

test('a picked skill stays picked and rides with every prompt until it is unpicked', async ($, on) => {
  const world = boot(on, { store: { skillSlots: SLOTS } })
  await start($)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'slot-btn-0' })
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'slot-btn-0' }))?.props.label).toBe('● code-review')
  expect(await ui.find({ type: 'Text', text: /^✦ code-review$/ })).toBeDefined()
  await ui.unmount()

  await ask($, 'revisa el diff')
  expect(world.submitted[0]?.text).toBe('revisa el diff')
  const said = world.submitted[0]?.context.join('\n') ?? ''
  expect(said).toContain('"code-review"')
  expect(said).toContain('Skill tool')
  // a skill already loaded is not loaded again on every prompt
  expect(said).toContain('unless it is already loaded')

  // still picked: the next prompt carries it too
  expect(await shows($, 'desktop', /^✦ code-review$/)).toBe(true)
  await ask($, 'y ahora otra cosa')
  expect(world.submitted[1]?.context.join('\n')).toContain('"code-review"')

  // unpicked: the prompts after it go bare
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'slot-btn-0' })
  await ui.unmount()
  await ask($, 'sin skills')
  expect(world.submitted[2]?.context).toEqual([])
  expect(await shows($, 'desktop', /^✦ code-review$/)).toBe(false)
})

test('two picks ride together; pressing a pick again drops it', async ($, on) => {
  const world = boot(on, { store: { skillSlots: SLOTS } })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'slot-btn-0' })
  await ui.press({ key: 'slot-btn-1' })
  await ui.press({ key: 'slot-btn-0' })
  await ui.press({ key: 'slot-btn-0' })
  await ui.unmount()

  await ask($, 'diseña y revisa')
  const context = world.submitted[0]?.context.join('\n') ?? ''
  expect(context).toContain('"frontend-design:frontend-design"')
  expect(context).toContain('"code-review"')
})

test('a prompt the person did not type leaves the picks for theirs', async ($, on) => {
  const world = boot(on, { store: { skillSlots: SLOTS } })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'slot-btn-0' })
  await ui.unmount()

  await ask($, '<task-notification>done</task-notification>', 'task-notification')
  expect(world.submitted[0]?.context).toEqual([])
  expect(await shows($, 'desktop', /^✦ code-review$/)).toBe(true)
})

test('emptying a slot drops its skill from the picks', async ($, on) => {
  const world = boot(on, { store: { skillSlots: SLOTS } })
  commandsOf(world)
  await start($)
  // picked, then emptied through edit mode's picker
  await press($, 'slot-btn-0', 'skills-edit', 'slot-btn-0', 'skills-clear')
  expect(await labelOf($, 'slot-btn-0')).toBe('＋')

  await ask($, 'hola')
  expect(world.submitted[0]?.context).toEqual([])
})

const LONG = 'react-native-best-practices:react-native-best-practices'

test('a slot is wide enough for its name, and the pointer on it shows the whole name and what it does', async ($, on) => {
  const world = boot(on, { store: { skillSlots: [LONG, 'code-review', null, null, null, null, null, null] } })
  world.commands = [
    { name: LONG, description: 'Lists, Metro and navigation in React Native', source: 'plugin' },
    { name: 'code-review', description: 'Reviews a diff', source: 'user' },
  ] as never
  await start($)
  // the descriptions are read once the session is up
  await world.clock.advance(2100)

  expect(await labelOf($, 'slot-btn-0')).toBe('react-native-best-practices')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // two to a row
  const cell = (await ui.findAll({ type: 'Box' })).find(box => box.key === 'slots-0')
  expect(cell?.props.width).toBe('50%')
  // the tooltip: hidden until the pointer rests on its slot, with the full name and the description
  // (the drawing's own card, under the pointer over the drawing, is the first hidden box: left out)
  const tips = (await ui.findAll({ type: 'Box' })).filter(box => box.props.display === 'none').slice(1)
  expect(tips).toHaveLength(2)
  // (the hover that reveals them is applied by the surface; the test kit does not expose it)
  expect(await ui.find({ type: 'Text', text: new RegExp(`^${LONG}$`) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Lists, Metro and navigation in React Native$/ })).toBeDefined()
  // the right-hand slot's card opens leftwards, inside the pane
  expect(tips[1]?.props.right).toBe(0)
  await ui.unmount()
})

test('keys 1 to 8 press the slots while the pane holds the keyboard', async ($, on) => {
  boot(on, { store: { skillSlots: SLOTS } })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (let i = 0; i < 8; i += 1) {
    expect((await ui.find({ type: 'Button', key: `slot-btn-${i}` }))?.props.hotkey).toBe(String(i + 1))
  }
  await ui.unmount()
})
