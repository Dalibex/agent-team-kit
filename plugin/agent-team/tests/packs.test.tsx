import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { armedBookFrom, packsFrom, pickedSkills, projectKeyOf, withArmed } from '../hooks/state'
import { boot as bootAt, PANE, shows } from './support'


/** The engine beneath the plugin, the pane opening on the skills tab. */
const boot: typeof bootAt = (on, options = {}) => bootAt(on, { ...options, store: { tab: 'skills', ...options.store } })

/** Sends a prompt the way the person's Enter does. */
const ask = ($: Engine, text: string) => $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false } as never)

/** Starts a session in `cwd` with the skills tab on the loose skills. */
const startIn = async ($: Engine, cwd: string): Promise<void> => {
  await $.session.start({ cwd, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'skills-loose' })
  await ui.unmount()
}

/** Presses the Buttons keyed `keys` in turn, each on a fresh drawing, as clicks in the pane do. */
const press = async ($: Engine, ...keys: string[]): Promise<void> => {
  for (const key of keys) {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key })
    await ui.unmount()
  }
}

const PACK = {
  id: 'p1',
  name: 'UrbanPulse',
  skills: ['urbanpulse-dev:urbanpulse-dev', 'code-review', null, null, null, null, null, null, null, null, null, null],
}

// ------------------------------------------------------------ migration from 0.7

test('the 0.7 slots come back as the loose skills, all eight kept', async ($, on) => {
  const slots = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  boot(on, { store: { skillSlots: slots } })
  await startIn($, '/work')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (let i = 0; i < 8; i += 1) {
    const found = await ui.find({ type: 'Button', key: `slot-btn-${i}` })
    expect(String(found?.props.label)).toBe(slots[i])
  }
  await ui.unmount()
})

test('a 0.7 store with no packs and no picks starts with nothing picked', async ($, on) => {
  const world = boot(on, { store: { skillSlots: ['a', null, null, null, null, null, null, null] } })
  await startIn($, '/work')
  await ask($, 'hola')
  expect(world.submitted.at(-1)?.context).toEqual([])
})

// ------------------------------------------------------------ picks kept per project

test('picking a skill keeps it for the project in the store, unpicking it clears it', async ($, on) => {
  const store: Record<string, unknown> = { skillSlots: ['code-review', null, null, null, null, null, null, null] }
  const world = boot(on, { store })
  await startIn($, 'C:\\Users\\Ana\\proyecto\\')
  await press($, 'slot-btn-0')
  expect(armedBookFrom(world.stored.armedByProject)['c:/users/ana/proyecto']?.skills).toEqual(['code-review'])
  // unpicking it leaves nothing kept for the project
  await press($, 'slot-btn-0')
  expect(armedBookFrom(world.stored.armedByProject)).toEqual({})
})

test('picks stored for a project come back for it and not for another', async ($, on) => {
  const store = {
    skillSlots: ['code-review', null, null, null, null, null, null, null],
    skillPacks: [PACK],
    armedByProject: { '/work': { skills: ['code-review'], packs: ['p1'], at: 5 } },
  }
  const world = boot(on, { store })
  await startIn($, '/elsewhere')
  await ask($, 'hola')
  expect(world.submitted.at(-1)?.context).toEqual([])
})

test('picks stored for the project ride along with its prompts', async ($, on) => {
  const store = {
    skillSlots: ['code-review', null, null, null, null, null, null, null],
    skillPacks: [PACK],
    armedByProject: { '/work': { skills: ['code-review'], packs: ['p1'], at: 5 } },
  }
  const world = boot(on, { store })
  await startIn($, '/work/')
  await ask($, 'hola')
  const context = world.submitted.at(-1)?.context ?? []
  expect(context).toHaveLength(2)
  expect(context[0]).toContain('"code-review"')
  // the pack offers what the loose pick does not already load
  expect(context[1]).toContain('"UrbanPulse": "urbanpulse-dev:urbanpulse-dev"')
  expect(context[1]).not.toContain('"code-review"')
  expect(context[1]).toContain('only the ones this request needs')
})

test('a stored pick whose slot or pack is gone is dropped', async ($, on) => {
  const store = {
    skillSlots: [null, null, null, null, null, null, null, null],
    skillPacks: [],
    armedByProject: { '/work': { skills: ['code-review'], packs: ['p1'], at: 5 } },
  }
  const world = boot(on, { store })
  await startIn($, '/work')
  await ask($, 'hola')
  expect(world.submitted.at(-1)?.context).toEqual([])
})

test('a skill the session no longer has is left out of the prompt', async ($, on) => {
  const store = {
    skillSlots: ['gone', 'code-review', null, null, null, null, null, null],
    armedByProject: { '/work': { skills: ['gone', 'code-review'], packs: [], at: 5 } },
  }
  const world = boot(on, { store })
  world.commands = [{ name: 'code-review', description: 'Reviews', source: 'user' }] as never
  await startIn($, '/work')
  await ask($, 'hola')
  const context = world.submitted.at(-1)?.context ?? []
  expect(context).toHaveLength(1)
  expect(context[0]).toContain('"code-review"')
  expect(context[0]).not.toContain('"gone"')
})

// ------------------------------------------------------------ the pure logic

test('packs read back from anything the store held', () => {
  expect(packsFrom(undefined)).toHaveLength(12)
  expect(packsFrom('nope').every(p => p === null)).toBe(true)
  const [one, two] = packsFrom([{ id: 'x', name: '  Mi   pack  ', skills: [' a ', 3, ''] }, { name: 'sin id' }])
  expect(one).toEqual({ id: 'x', name: 'Mi pack', skills: ['a', ...Array.from({ length: 23 }, () => null)] })
  expect(two).toBeNull()
})

test('a skill in two picked packs is offered once, by the first', () => {
  const other = { ...PACK, id: 'p2', name: 'Revisión', skills: ['code-review', 'security-review', ...PACK.skills.slice(2)] }
  const picked = pickedSkills([], [PACK, other], ['p1', 'p2'], [])
  expect(picked.offer).toEqual([
    { name: 'UrbanPulse', skills: ['urbanpulse-dev:urbanpulse-dev', 'code-review'] },
    { name: 'Revisión', skills: ['security-review'] },
  ])
})

test('an unpicked pack offers nothing', () => {
  expect(pickedSkills([], [PACK], [], []).offer).toEqual([])
})

test('project keys ignore the slash style and a Windows drive path ignores case', () => {
  expect(projectKeyOf('C:\\Users\\Ana\\Proyecto\\')).toBe('c:/users/ana/proyecto')
  expect(projectKeyOf('/home/ana/Proyecto/')).toBe('/home/ana/Proyecto')
  expect(projectKeyOf('/')).toBe('/')
})

test('a project with nothing picked leaves the book; past the limit the oldest go', () => {
  let book = withArmed({}, '/a', { skills: ['x'], packs: [], at: 1 })
  book = withArmed(book, '/a', { skills: [], packs: [], at: 2 })
  expect(book).toEqual({})
  for (let i = 0; i < 45; i += 1) book = withArmed(book, `/p${i}`, { skills: ['x'], packs: [], at: i })
  expect(Object.keys(book)).toHaveLength(40)
  expect(book['/p0']).toBeUndefined()
  expect(book['/p44']).toBeDefined()
})

// ------------------------------------------------------------ the packs view

const COMMANDS = [
  { name: 'code-review', description: 'Reviews', source: 'user' },
  { name: 'frontend-design:frontend-design', description: 'Design', source: 'plugin' },
]

/** Starts in `/work` on the skills tab's packs view, the one it opens on. */
const startOnPacks = ($: Engine) => $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

/** The label of the Button keyed `key` on the desktop, if it is drawn. */
const labelOf = async ($: Engine, key: string): Promise<string | undefined> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = await ui.find({ type: 'Button', key })
  await ui.unmount()

  return found === undefined ? undefined : String(found.props.label)
}

test('the skills tab opens on twelve empty pack slots, with the loose skills a press away', async ($, on) => {
  boot(on)
  await startOnPacks($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^＋$/ })).toHaveLength(12)
  expect(String((await ui.find({ type: 'Button', key: 'skills-loose' }))?.props.label)).toBe('Skills sueltas')
  await ui.press({ key: 'skills-loose' })
  await ui.unmount()
  expect(await labelOf($, 'slot-btn-0')).toBe('＋')
  await press($, 'skills-packs')
  expect(await labelOf($, 'pack-btn-0')).toBe('＋')
})

test('a new pack is named in its text field and filled with the picker; both are kept', async ($, on) => {
  const world = boot(on)
  world.commands = COMMANDS as never
  await startOnPacks($)
  await press($, 'pack-btn-0')

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'pack-name', text: '  Revisión   web  ', kind: 'change' })
  await ui.unmount()
  // the empty pack slot picks from the same picker as the loose ones
  await press($, 'pack-slot-0', 'skills-group-0', 'skills-choice-0')
  await press($, 'pack-slot-1', 'skills-group-1', 'skills-choice-0')
  expect(await labelOf($, 'pack-slot-0')).toBe('code-review')
  expect(await labelOf($, 'pack-slot-1')).toBe('frontend-design')

  const kept = packsFrom(world.stored.skillPacks)[0]
  expect(kept?.name).toBe('Revisión web')
  expect(kept?.skills.slice(0, 2)).toEqual(['code-review', 'frontend-design:frontend-design'])

  await press($, 'pack-back')
  expect(await labelOf($, 'pack-btn-0')).toBe('Revisión web (2)')
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^＋$/ })).toHaveLength(11)
  await ui.unmount()
})

test('a picked pack lights up, rides with prompts as an offer and is kept for the project', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [PACK] } })
  await startOnPacks($)
  await press($, 'pack-btn-0')
  expect(await labelOf($, 'pack-btn-0')).toBe('● UrbanPulse (2)')
  expect(armedBookFrom(world.stored.armedByProject)['/work']?.packs).toEqual(['p1'])

  await ask($, 'hola')
  expect(world.submitted.at(-1)?.context?.[0]).toContain('"UrbanPulse": "urbanpulse-dev:urbanpulse-dev", "code-review"')
  expect(await shows($, 'desktop', /▣ UrbanPulse/)).toBe(true)

  await press($, 'pack-btn-0')
  await ask($, 'otra')
  expect(world.submitted.at(-1)?.context).toEqual([])
})

test('in edit mode a press opens the pack; deleting it takes two presses and drops its pick', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [PACK], armedByProject: { '/work': { skills: [], packs: ['p1'], at: 1 } } } })
  await startOnPacks($)
  await press($, 'skills-edit')
  expect(await labelOf($, 'pack-btn-0')).toBe('✎ UrbanPulse')
  await press($, 'pack-btn-0')
  expect(await labelOf($, 'pack-pick')).toBe('● Marcado')

  await press($, 'pack-delete')
  expect(await labelOf($, 'pack-delete')).toBe('¿Seguro? Pulsa otra vez')
  expect(packsFrom(world.stored.skillPacks)[0]).not.toBeNull()
  await press($, 'pack-delete')

  expect(packsFrom(world.stored.skillPacks)[0]).toBeNull()
  expect(armedBookFrom(world.stored.armedByProject)).toEqual({})
  expect(await labelOf($, 'pack-delete')).toBeUndefined()
})

test('a skill the session no longer has is flagged in its slot and its pack', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [PACK], skillSlots: ['gone', null, null, null, null, null, null, null] } })
  world.commands = COMMANDS as never
  await startOnPacks($)
  await world.clock.advance(2500)
  expect(await shows($, 'desktop', /1 no instalada$/)).toBe(true)
  await press($, 'skills-loose')
  expect(await labelOf($, 'slot-btn-0')).toBe('⚠ gone')
})

test('keys 1 to 9 press the first nine packs; an empty slot takes no key', async ($, on) => {
  const many = Array.from({ length: 10 }, (_, i) => ({ ...PACK, id: `p${i}`, name: `Pack ${i}` }))
  boot(on, { store: { skillPacks: [...many, null, null] } })
  await startOnPacks($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'pack-btn-0' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ type: 'Button', key: 'pack-btn-8' }))?.props.hotkey).toBe('9')
  expect((await ui.find({ type: 'Button', key: 'pack-btn-9' }))?.props.hotkey).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'pack-btn-10' }))?.props.hotkey).toBeUndefined()
  await ui.unmount()
})

test('an empty pack slot takes no key, so a stray digit makes no pack', async ($, on) => {
  boot(on)
  await startOnPacks($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'pack-btn-0' }))?.props.hotkey).toBeUndefined()
  await ui.unmount()
})

test('a pack another window made meanwhile survives a change made here', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [PACK] } })
  await startOnPacks($)
  // another window adds a pack in the second slot after this session read the store
  world.stored.skillPacks = [PACK, { ...PACK, id: 'p2', name: 'Otra ventana' }]
  await press($, 'skills-edit', 'pack-btn-0')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'pack-name', text: 'Urban', kind: 'change' })
  await ui.unmount()
  const kept = packsFrom(world.stored.skillPacks)
  expect(kept[0]?.name).toBe('Urban')
  expect(kept[1]?.name).toBe('Otra ventana')
})

test('a name keeps its spaces while it is typed and is tidied on leaving the pack', async ($, on) => {
  const world = boot(on)
  await startOnPacks($)
  await press($, 'pack-btn-0')
  let before = ''
  for (const typed of ['C', 'Co', 'Code', 'Code ', 'Code R', 'Code Review ']) {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect((await ui.find({ type: 'Input', key: 'pack-name' }))?.props.value).toBe(before)
    await ui.input({ key: 'pack-name', text: typed, kind: 'change' })
    await ui.unmount()
    before = typed
  }
  await press($, 'pack-back')
  expect(packsFrom(world.stored.skillPacks)[0]?.name).toBe('Code Review')
  expect(await labelOf($, 'pack-btn-0')).toBe('Code Review (0)')
})

test('a pack left unnamed and empty is dropped on leaving it', async ($, on) => {
  const world = boot(on)
  await startOnPacks($)
  await press($, 'pack-btn-0', 'pack-back')
  expect(packsFrom(world.stored.skillPacks)[0]).toBeNull()
  expect(await labelOf($, 'pack-btn-0')).toBe('＋')
})

test('a delete asked and left waits for two presses again', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [PACK] } })
  await startOnPacks($)
  await press($, 'skills-edit', 'pack-btn-0', 'pack-delete', 'pack-back', 'pack-btn-0')
  expect(await labelOf($, 'pack-delete')).toBe('Borrar pack')
  await press($, 'pack-delete')
  expect(packsFrom(world.stored.skillPacks)[0]).not.toBeNull()
})

test('a pack with a skill the session no longer has shows ⚠ on its button', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [PACK] } })
  world.commands = COMMANDS as never
  await startOnPacks($)
  await world.clock.advance(2500)
  expect(await labelOf($, 'pack-btn-0')).toBe('⚠ UrbanPulse (2)')
})

test('after /cd the picks are the new project’s, and the old project’s are left as they were', async ($, on) => {
  const store = {
    skillSlots: ['code-review', null, null, null, null, null, null, null],
    armedByProject: { '/a': { skills: ['code-review'], packs: [], at: 1 } },
  }
  const world = boot(on, { store })
  await $.session.start({ cwd: '/a', surface: 'desktop', isInteractive: true })
  world.root = '/b'
  await ask($, 'hola')
  expect(world.submitted.at(-1)?.context).toEqual([])
  await press($, 'skills-loose', 'slot-btn-0')
  const book = armedBookFrom(world.stored.armedByProject)
  expect(book['/a']?.skills).toEqual(['code-review'])
  expect(book['/b']?.skills).toEqual(['code-review'])
  world.root = '/a'
  await ask($, 'otra')
  expect(world.submitted.at(-1)?.context?.[0]).toContain('"code-review"')
})

test('a pack has 24 skill slots, and an old 12-slot pack keeps its skills', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [PACK] } })
  await startOnPacks($)
  await press($, 'skills-edit', 'pack-btn-0')
  expect(await labelOf($, 'pack-slot-0')).toBe('urbanpulse-dev')
  expect(await labelOf($, 'pack-slot-23')).toBe('＋')
  expect(await labelOf($, 'pack-slot-24')).toBeUndefined()
  expect(world.stored.skillPacks).toEqual([PACK])
})

test('in a pack, a skill another slot holds is marked and does not go in twice', async ($, on) => {
  const world = boot(on, { store: { skillPacks: [{ ...PACK, skills: ['code-review', ...PACK.skills.slice(2)] }] } })
  world.commands = COMMANDS as never
  await startOnPacks($)
  await press($, 'skills-edit', 'pack-btn-0', 'pack-slot-1', 'skills-group-0')
  expect(await labelOf($, 'skills-choice-0')).toBe('✓ code-review')
  await press($, 'skills-choice-0')
  // the picker stays open and the pack is unchanged
  expect(await labelOf($, 'skills-choice-0')).toBe('✓ code-review')
  expect(packsFrom(world.stored.skillPacks)[0]?.skills[1]).toBeNull()
})
