import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { AGENT_TEAM_COMMAND, PANE, SURFACES, boot, shows, spawn, start } from './support'

const SUBTITLE = 'AGENT SQUAD'

/** The Svg's props on the desktop. */
const svgOf = async ($: Engine): Promise<{ source: string; alt: string }> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  const { source, alt } = svg?.props ?? {}
  if (typeof source !== 'string' || typeof alt !== 'string') throw new Error('the Svg carries no source or alt')

  return { source, alt }
}

// ------------------------------------------------------------ the default

for (const [what, options] of [
  ['an empty', { teamName: '' }],
  ['a blank', { teamName: '   ' }],
] as const) {
  test(`${what} team name reads Agent team on the terminal and the desktop`, { options }, async ($, on) => {
    const world = boot(on)
    await start($)
    await world.clock.settle()
    await spawn($, 'a1', 'Explore')

    expect(world.opened).toEqual(['Agent team'])
    expect(world.statuses[world.statuses.length - 1]).toBe('agent team: 1 agente trabajando')
    expect(await shows($, 'terminal', /^▄▀▄ AGENT TEAM ▄▀▄$/)).toBe(true)
    const { source, alt } = await svgOf($)
    expect(alt).toMatch(/^Agent team: /)
    expect(source).not.toContain(SUBTITLE)
  })
}

test('with no team name the /agent-team texts use Agent team', { options: { teamName: '' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  world.panes = ['agent-team']
  const hidden = await $.command.run(AGENT_TEAM_COMMAND)
  world.panes = []
  const shown = await $.command.run(AGENT_TEAM_COMMAND)

  expect(hidden.text).toMatch(/^Panel Agent team oculto/)
  expect(shown.text).toBe('Panel Agent team abierto.')
  expect(world.opened).toEqual(['Agent team', 'Agent team'])
})

// ---------------------------------------------------------- a custom name

test('a team name sets the terminal header, the pane title and the status line', { options: { teamName: 'Ártico Crew' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  await world.clock.settle()
  await spawn($, 'a1', 'Explore')

  expect(world.opened).toEqual(['Ártico Crew team'])
  expect(world.statuses[world.statuses.length - 1]).toBe('ártico crew team: 1 agente trabajando')
  expect(await shows($, 'terminal', /^▄▀▄ ARTICO CREW TEAM ▄▀▄$/)).toBe(true)
  expect(await shows($, 'terminal', /AGENT TEAM/)).toBe(false)
  expect((await svgOf($)).alt).toMatch(/^Ártico Crew team: /)
})

test('a name longer than 12 characters is cut in the drawn word, not in the title', { options: { teamName: 'Abcdefghijklmnopqrst' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  await world.clock.settle()

  expect(await shows($, 'terminal', /^▄▀▄ ABCDEFGHIJKL TEAM ▄▀▄$/)).toBe(true)
  expect(world.opened).toEqual(['Abcdefghijklmnopqrst team'])
})

test('a team name keeps only A-Z, 0-9, space and hyphen in the drawn word', { options: { teamName: 'Équipe n°7-b!' } }, async ($, on) => {
  boot(on)
  await start($)

  expect(await shows($, 'terminal', /^▄▀▄ EQUIPE N7-B TEAM ▄▀▄$/)).toBe(true)
})

test('the SVG shows the AGENT SQUAD subtitle only with a custom name', { options: { teamName: 'Ártico Crew' } }, async ($, on) => {
  boot(on)
  await start($)

  expect((await svgOf($)).source).toContain(SUBTITLE)
})

test('a name with no drawable characters falls back to the default branding, in text too', { options: { teamName: '日本' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  await world.clock.settle()

  expect(world.opened).toEqual(['Agent team'])
  expect(await shows($, 'terminal', /^▄▀▄ AGENT TEAM ▄▀▄$/)).toBe(true)
  expect((await svgOf($)).source).not.toContain(SUBTITLE)
})

test('the /agent-team texts use the custom title', { options: { teamName: 'Ártico Crew' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  world.panes = ['agent-team']
  const hidden = await $.command.run(AGENT_TEAM_COMMAND)
  world.panes = []
  const shown = await $.command.run(AGENT_TEAM_COMMAND)

  expect(hidden.text).toMatch(/^Panel Ártico Crew team oculto/)
  expect(shown.text).toBe('Panel Ártico Crew team abierto.')
  expect(world.opened).toEqual(['Ártico Crew team', 'Ártico Crew team'])
})

test('the idle pane reads the same on every surface whatever the name', { options: { teamName: 'Ártico Crew' } }, async ($, on) => {
  boot(on)
  await start($)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^○ Claude$/)).toBe(true)
    expect(await shows($, surface, /^en reposo$/)).toBe(true)
  }
})
