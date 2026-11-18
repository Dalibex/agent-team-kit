import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CATALOG, CATALOG_SIZE, systemLanguage } from '../hooks/i18n'
import type { Key } from '../hooks/i18n'
import { FONT, titlePlate } from '../hooks/look'
import { TEAM_DELEGATION } from '../hooks/state'
import { AGENT_TEAM_COMMAND, PANE, SPANISH, boot, finish, onTab, shows, spawn, start } from './support'

const ENGLISH = { LANG: 'en_US.UTF-8' } as const

/** The label of each tab's button, in the order they are drawn. */
const tabLabels = async ($: Engine): Promise<string[]> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const labels: string[] = []
  for (const id of ['team', 'skills', 'jobs', 'github'] as const) {
    labels.push(String((await ui.find({ type: 'Button', key: `tab-${id}` }))?.props.label))
  }
  await ui.unmount()

  return labels
}

const IN_ENGLISH = ['Team', 'Skills', 'Jobs', 'GitHub']
const IN_SPANISH = ['Equipo', 'Skills', 'Procesos', 'GitHub']

// ------------------------------------------------------------ the catalog

test('both languages hold the same texts, with the same slots, and the plates only use drawable letters', () => {
  const keys = Object.keys(CATALOG.en) as Key[]
  expect(Object.keys(CATALOG.es).sort()).toEqual([...keys].sort())
  expect(keys).toHaveLength(CATALOG_SIZE)
  const slots = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1] ?? '').sort()
  for (const key of keys) {
    expect(CATALOG.en[key], key).not.toBe('')
    expect(CATALOG.es[key], key).not.toBe('')
    expect(slots(CATALOG.es[key]), key).toEqual(slots(CATALOG.en[key]))
  }
  for (const key of ['plate.team', 'plate.skills', 'plate.jobs', 'plate.github'] as const) {
    for (const lang of ['en', 'es'] as const) {
      expect([...CATALOG[lang][key]].every(ch => FONT[ch] !== undefined), `${lang} ${key}`).toBe(true)
    }
  }
})

test('the texts the model reads stay English in both languages, and the agents ask with QUESTIONS', () => {
  expect(TEAM_DELEGATION).toContain('QUESTIONS')
  expect(TEAM_DELEGATION).not.toContain('PREGUNTAS')
})

// -------------------------------------------------------- English

test('English: the tabs, their cards and the skills tab hint', { options: { language: 'en' } }, async ($, on) => {
  boot(on, { env: ENGLISH })
  await start($)

  expect(await tabLabels($)).toEqual(IN_ENGLISH)
  expect(await shows($, 'desktop', /^Press ＋ to create a pack\.$/, 'Text', 'skills')).toBe(true)
  expect(await shows($, 'desktop', /^Pulsa ＋/)).toBe(false)
  expect(await shows($, 'desktop', /^Nothing running\.$/, 'Text', 'jobs')).toBe(true)
  expect(await shows($, 'terminal', /^Team$/)).toBe(true)
})

test('English: a working row and the delegation footer', async ($, on) => {
  boot(on, { env: ENGLISH })
  await start($)
  await spawn($, 'a1', 'Explore', { description: 'Map the repo' })
  expect(await shows($, 'desktop', /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] working\.+$/, 'Text', 'team')).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(String((await ui.find({ type: 'Button', key: 'delegation' }))?.props.label)).toBe('Delegate: yes')
  expect(await ui.find({ type: 'Text', text: /^per your rules; a change applies from the next conversation$/ })).toBeDefined()
  await ui.press({ key: 'delegation' })
  expect(String((await ui.find({ type: 'Button', key: 'delegation' }))?.props.label)).toBe('Delegate: no')
  expect(await ui.find({ type: 'Text', text: /^only when you ask; a change applies from the next conversation$/ })).toBeDefined()
  await ui.unmount()
})

test('English: a brief without Goal or Why is flagged in English, and the status line and the command speak it', async ($, on) => {
  const world = boot(on, { env: ENGLISH })
  await start($)
  await spawn($, 'a1', 'agent-team:implementer', { prompt: 'Fix the login bug in auth.ts' })

  expect(await shows($, 'desktop', /^⚠ brief without Goal or Why: the agent will have to guess or explore$/)).toBe(true)
  expect(world.statuses[world.statuses.length - 1]).toBe('agent team: 1 agent working')

  world.panes = ['agent-team']
  expect((await $.command.run(AGENT_TEAM_COMMAND)).text).toBe('Pane Agent team hidden, in later sessions too. /agent-team shows it again.')
  world.panes = []
  expect((await $.command.run(AGENT_TEAM_COMMAND)).text).toBe('Pane Agent team open.')
})

test('English: the card titles are pixel plates TEAM, SKILLS, JOBS and GITHUB, with English alt texts', async ($, on) => {
  boot(on, { env: ENGLISH })
  await start($)
  const alts: unknown[] = []
  const widths: unknown[] = []
  for (const id of ['team', 'skills', 'jobs', 'github'] as const) {
    await onTab($, id)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const images = await ui.findAll({ type: 'Svg' })
    alts.push(images[1]?.props.alt)
    widths.push(images[1]?.props.width)
    await ui.unmount()
  }
  expect(alts).toEqual(['Team', 'Skills', 'Installs and processes', 'GitHub'])
  expect(widths).toEqual(['TEAM', 'SKILLS', 'JOBS', 'GITHUB'].map(word => titlePlate(word, '#000000').width))
  await onTab($, 'team')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  expect(String(svg?.props.alt)).toBe(
    'Agent team: Claude on top and its agents below; each one wakes up while it works. At the bottom, usage, which arrives with the first answer.',
  )
})

test('English: an API failure and the usage tooltips', async ($, on) => {
  boot(on, { env: ENGLISH })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.classic.StopFailure({ error: 'overloaded' } as never)
  await finish($, undefined, 'error')

  expect(await shows($, 'desktop', /^⚠ the API cut the turn: servers overloaded, try again in a while$/)).toBe(true)
  expect(await shows($, 'desktop', /^The figures arrive with the model's first answer\.$/)).toBe(true)
})

// ------------------------------------------------------ the language option

test('language en overrides a Spanish system', { options: { language: 'en' } }, async ($, on) => {
  boot(on, { env: SPANISH })
  await start($)

  expect(await tabLabels($)).toEqual(IN_ENGLISH)
})

test('language es overrides an English system', { options: { language: 'es' } }, async ($, on) => {
  boot(on, { env: ENGLISH })
  await start($)

  expect(await tabLabels($)).toEqual(IN_SPANISH)
})

test('an option that is neither en nor es leaves it to the system', { options: { language: 'fr' } }, async ($, on) => {
  boot(on, { env: SPANISH })
  await start($)

  expect(await tabLabels($)).toEqual(IN_SPANISH)
})

// ------------------------------------------------------- auto detection

for (const [what, env, expected] of [
  ['LANG in English', { LANG: 'en_US.UTF-8' }, IN_ENGLISH],
  ['LANG in Spanish', { LANG: 'es_ES.UTF-8' }, IN_SPANISH],
  ['LANG in another language', { LANG: 'fr_FR.UTF-8' }, IN_ENGLISH],
  ['the C locale', { LANG: 'C' }, IN_ENGLISH],
  ['LC_ALL over LANG', { LC_ALL: 'es_MX.UTF-8', LANG: 'en_US.UTF-8' }, IN_SPANISH],
  ['LC_ALL in English over a Spanish LANG', { LC_ALL: 'en_GB.UTF-8', LANG: 'es_ES.UTF-8' }, IN_ENGLISH],
  ['LC_MESSAGES over LANG', { LC_MESSAGES: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' }, IN_SPANISH],
  ['LANGUAGE alone, a list', { LANG: '', LANGUAGE: 'es:en' }, IN_SPANISH],
  ['an empty variable counts as unset', { LC_ALL: '', LANG: 'es_ES.UTF-8' }, IN_SPANISH],
] as const) {
  test(`auto: ${what} gives ${expected === IN_ENGLISH ? 'English' : 'Spanish'}`, async ($, on) => {
    boot(on, { env })
    await start($)

    expect(await tabLabels($)).toEqual(expected)
  })
}

test('auto with no environment variable asks Intl, and speaks English where Intl has nothing', async ($, on) => {
  boot(on, { env: { LANG: '' } })
  await start($)
  const intl = typeof Intl === 'undefined' ? undefined : Intl.DateTimeFormat().resolvedOptions().locale
  const expected = intl !== undefined && /^es($|[^a-z])/i.test(intl) ? 'es' : 'en'

  expect(await tabLabels($)).toEqual(expected === 'es' ? IN_SPANISH : IN_ENGLISH)
})

test('the language is worked out from the variables first, then from the runtime locale', () => {
  expect(systemLanguage(['es_ES.UTF-8', undefined, 'en_US', undefined], 'en-US')).toBe('es')
  expect(systemLanguage([undefined, undefined, 'en_US.UTF-8', 'es'], 'es-ES')).toBe('en')
  expect(systemLanguage([undefined, '', '  ', undefined], 'es-ES')).toBe('es')
  expect(systemLanguage([undefined, '', undefined, undefined], 'es')).toBe('es')
  expect(systemLanguage([undefined, '', undefined, undefined], 'en-GB')).toBe('en')
  expect(systemLanguage([undefined, '', undefined, undefined], 'est')).toBe('en')
  expect(systemLanguage([undefined, undefined, undefined, undefined], undefined)).toBe('en')
  expect(systemLanguage(['ES_es'], undefined)).toBe('es')
})

// ------------------------------------------------------- a detached HEAD

for (const [lang, env, word] of [
  ['English', ENGLISH, '⎇ detached HEAD'],
  ['Spanish', SPANISH, '⎇ HEAD suelto'],
] as const) {
  test(`a detached HEAD is worded in ${lang} where it is drawn, and links no branch`, async ($, on) => {
    const world = boot(on, { env })
    world.gitAnswers['git status'] = { exitCode: 0, stdout: '# branch.head (detached)\n', stderr: '' }
    world.gitAnswers['git remote'] = { exitCode: 0, stdout: 'https://github.com/a/b.git\n', stderr: '' }
    await start($)
    await world.clock.advance(2000)

    expect(await shows($, 'desktop', new RegExp(`^${word}$`), 'Text', 'github')).toBe(true)
    expect(await shows($, 'desktop', new RegExp(`^${word}`), 'Text', 'team')).toBe(true)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Link', key: 'link-branch' })).toBeUndefined()
    expect(await ui.find({ type: 'Link', key: 'link-new-pr' })).toBeUndefined()
    await ui.unmount()
  })
}
