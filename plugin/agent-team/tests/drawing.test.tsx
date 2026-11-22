import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { drawTeam, FAILED_RESTING, toolKindOf } from '../hooks/drawing'
import { setLanguage } from '../hooks/i18n'
import { AFTERGLOW_MS, EMPTY, isAlive, isStill, MAIN_END_MS, STILL_MS } from '../hooks/state'
import type { AgentRow, MainLoop, Team, Usage } from '../types'
import { PANE, boot, start } from './support'

setLanguage('es')

const AT = 1_000_000
const USAGE: Usage = { at: 0, windows: [] }

const animations = (svg: string): number => (svg.match(/<animate(?:Transform|Motion)? /g) ?? []).length
const zs = (svg: string): number => (svg.match(/>z<animate /g) ?? []).length

/** A team whose last activity was `ago` ms before AT, with Claude's loop changed as asked. */
const team = (main: Partial<MainLoop> = {}, agents: AgentRow[] = [], ago = 5_000): Team => ({
  ...EMPTY,
  main: { ...EMPTY.main, since: AT - ago, ...main },
  agents,
})
const working = (main: Partial<MainLoop> = {}, agents: AgentRow[] = []): Team => team({ status: 'working', ...main }, agents)

const agent = (extra: Partial<AgentRow> = {}): AgentRow => ({
  id: 'a1', type: 'Explore', role: 'explorer', description: 'look', prompt: '', startedAt: AT - 100_000, calls: 0, lastActiveAt: 0, status: 'running', ...extra,
})

// ------------------------------------------------------------------ idle

test('an idle Claude breathes and blinks twice now and then, instead of bobbing', async () => {
  const svg = drawTeam(team(), AT, USAGE)

  expect(svg).toContain('type="scale"')
  expect(svg).toContain('dur="4.4s"')
  expect(svg).toContain('keyTimes="0;0.82;0.855;0.89;0.925;0.96;1"')
  expect(svg).not.toMatch(/values="0 0;0 -3;0 0" dur="2.4s"/)
})

test('a working Claude keeps its quick bob and does not breathe', async () => {
  const svg = drawTeam(working(), AT, USAGE)

  expect(svg).toMatch(/values="0 0;0 -3;0 0" dur="0.6s"/)
  expect(svg).not.toContain('type="scale" values="1 1;1.02')
})

test('each sleeping slot snores one z', async () => {
  expect(zs(drawTeam(team(), AT, USAGE))).toBe(4)
  // a slot with an agent running does not snore
  expect(zs(drawTeam(team({}, [agent()]), AT, USAGE))).toBe(3)
})

test('the idle pane animates fewer elements than before the change (32)', async () => {
  expect(animations(drawTeam(team(), AT, USAGE))).toBeLessThanOrEqual(16)
})

// ------------------------------------------------------------ after the afterglow

/** The explorer's slot of a drawing: its frame's stroke and whether its bar is only the track. */
const explorerSlot = (svg: string): { border: string | undefined; bar: string } => {
  const slot = svg.split('<g><title>').find(part => part.startsWith('explorer:')) ?? ''

  return { border: /<rect [^>]*rx="12" fill="[^"]+" stroke="([^"]+)"/.exec(slot)?.[1], bar: slot.slice(slot.lastIndexOf('fill="#26222f"')) }
}

test('a done agent is green in its afterglow, then rests like an empty slot: neutral border and the bare track', async () => {
  const done = (ago: number): Team => team({}, [agent({ status: 'done', endedAt: AT - ago })], 0)
  const glowing = explorerSlot(drawTeam(done(1000), AT, USAGE))
  expect(glowing.border).toBe('#3d6b3d')
  expect(glowing.bar).toContain('fill="#4caf50"')

  const after = drawTeam(done(AFTERGLOW_MS + 1000), AT, USAGE)
  const resting = explorerSlot(after)
  expect(resting.border).toBe('#2e2a3a')
  expect(resting.bar).not.toContain('fill="#4caf50"')
  // nothing moves with the clock once it rests: two ticks draw the same
  expect(drawTeam(done(AFTERGLOW_MS + 2000), AT + 1000, USAGE)).toBe(after)
  // the end of the afterglow is the edge the ticker redraws on
  expect(isAlive(done(1000), AT)).toBe(true)
  expect(isAlive(done(AFTERGLOW_MS + 1000), AT)).toBe(false)
})

test('a stopped agent rests too; a failed one keeps a dimmed red border and its red bar', async () => {
  const ended = (status: 'stopped' | 'failed', ago: number): Team => team({}, [agent({ status, endedAt: AT - ago })], 0)
  expect(explorerSlot(drawTeam(ended('stopped', 1000), AT, USAGE)).border).toBe('#5d5a6b')
  const stopped = explorerSlot(drawTeam(ended('stopped', AFTERGLOW_MS + 1000), AT, USAGE))
  expect(stopped.border).toBe('#2e2a3a')
  expect(stopped.bar).not.toContain('fill="#5d5a6b"')

  expect(explorerSlot(drawTeam(ended('failed', 1000), AT, USAGE)).border).toBe('#d9534f')
  const failed = explorerSlot(drawTeam(ended('failed', AFTERGLOW_MS + 1000), AT, USAGE))
  expect(failed.border).toBe(FAILED_RESTING)
  expect(failed.bar).toContain('fill="#d9534f"')
})

// ------------------------------------------------------------ a minute at rest

test('after a quiet minute the sprites hold a still pose, and move again when something happens', async () => {
  const resting = team({}, [], STILL_MS + 1000)
  const svg = drawTeam(resting, AT, USAGE)

  expect(isStill(resting, AT)).toBe(true)
  expect(svg).not.toContain('type="scale"')
  expect(svg).not.toContain('attributeName="height"')
  expect(svg).not.toContain('>z<animate ')
  // nothing moves at rest: the title has no twinkling stars since 0.9.1
  expect(animations(svg)).toBe(0)

  const woken: Team = { ...resting, main: { ...resting.main, status: 'working' } }
  expect(isStill(woken, AT)).toBe(false)
  expect(drawTeam(woken, AT, USAGE)).toContain('attributeName="height"')
})

test('a team that did something less than a minute ago is not at rest, and a fresh session waits its minute', async () => {
  expect(isStill(team({}, [], STILL_MS - 1000), AT)).toBe(false)
  expect(isStill(team({ openedAt: AT - 1000 }, [], AT), AT)).toBe(false)
  expect(isStill(team({ openedAt: AT - STILL_MS }, [], AT), AT)).toBe(true)
  // an aborted turn still counts as activity: a long turn stopped with Esc does not freeze at once
  expect(isStill(team({ endedAt: AT - 1000, endedOk: false }, [], AT), AT)).toBe(false)
})

// ------------------------------------------------------------ thinking and tools

test('a thought bubble shows only while Claude works with no tool running and no agent out', async () => {
  const thinking = drawTeam(working(), AT, USAGE)
  expect(thinking).toContain('id="dx-thinking"')

  expect(drawTeam(working({ lastTool: 'Read' }), AT, USAGE)).not.toContain('dx-thinking')
  expect(drawTeam(team(), AT, USAGE)).not.toContain('dx-thinking')
  expect(drawTeam(working({}, [agent()]), AT, USAGE)).not.toContain('dx-thinking')
})

test('a running tool shows the icon of its kind, and none while Claude is not in a tool', async () => {
  const kinds: Record<string, string> = {
    Read: 'read', NotebookRead: 'read', Edit: 'edit', Write: 'edit', MultiEdit: 'edit', Bash: 'shell', PowerShell: 'shell',
    Grep: 'search', Glob: 'search', WebFetch: 'web', WebSearch: 'web', TodoWrite: 'other', mcp__x__y: 'other',
  }
  for (const [tool, kind] of Object.entries(kinds)) {
    expect(toolKindOf(tool)).toBe(kind)
    const svg = drawTeam(working({ lastTool: tool }), AT, USAGE)
    expect(svg).toContain(`id="dx-tool-${kind}"`)
    expect(svg).not.toContain('dx-thinking')
  }
  // the six pictures are drawn differently from each other
  const pictures = new Set(
    ['Read', 'Edit', 'Bash', 'Grep', 'WebFetch', 'TodoWrite'].map(tool => drawTeam(working({ lastTool: tool }), AT, USAGE)),
  )
  expect(pictures.size).toBe(6)
  // the icon is static: no pop-in scale animation
  expect(drawTeam(working({ lastTool: 'Read' }), AT, USAGE)).not.toContain('1.18')
  expect(drawTeam(team({ lastTool: 'Read' }), AT, USAGE)).not.toContain('dx-tool-')
})

// ------------------------------------------------------------ the markup holds still

test('the markup is the same on every tick of a state', async () => {
  for (const squad of [team(), working(), working({ lastTool: 'Bash' }), working({}, [agent()])]) {
    const first = drawTeam(squad, AT, USAGE)
    expect(drawTeam(squad, AT + 1000, USAGE)).toBe(first)
    expect(drawTeam(squad, AT + 2000, USAGE)).toBe(first)
  }
})

test('tool calls of the same kind, and their count, do not change the markup', async () => {
  const at = (calls: number, tool: string) => drawTeam(working({ calls, lastTool: tool, lastDetail: `${calls}` }), AT, USAGE)

  expect(at(4, 'Read')).toBe(at(1, 'Read'))
  expect(at(9, 'Read')).toBe(at(1, 'NotebookRead'))
  expect(at(3, 'Edit')).toBe(at(30, 'Write'))
  expect(at(3, 'Edit')).not.toBe(at(3, 'Bash'))
  // thinking between two tools is the same markup whatever was counted
  expect(drawTeam(working({ calls: 3 }), AT, USAGE)).toBe(drawTeam(working({ calls: 12 }), AT, USAGE))
})

// ------------------------------------------------------------ the hand-off

test('Claude does not lean towards the slot it just sent work to, during the out pulse or after it', async () => {
  for (const role of ['explorer', 'reviewer'] as const) {
    for (const startedAt of [AT - 500, AT - 5000]) {
      const svg = drawTeam(working({}, [agent({ role, startedAt })]), AT, USAGE)
      expect(svg).not.toContain('keyTimes="0;0.4;1"')
      expect(svg).not.toMatch(/values="0 0;-?[0-9.]+ -2;0 0"/)
    }
  }
})

// ------------------------------------------------------------ the end of a turn

test('a turn that ended on its own shows a check over Claude for about two seconds', async () => {
  const ended = team({ endedAt: AT - 500, endedOk: true })

  expect(drawTeam(ended, AT, USAGE)).toContain('stroke="#4caf50"')
  expect(drawTeam(team({ endedAt: AT - MAIN_END_MS - 100, endedOk: true }), AT, USAGE)).not.toContain('stroke="#4caf50"')
  expect(drawTeam(team(), AT, USAGE)).not.toContain('stroke="#4caf50"')
  expect(drawTeam(team({ endedAt: AT - 500, endedOk: false }), AT, USAGE)).not.toContain('stroke="#4caf50"')
  // the ticker keeps drawing through the window, and stops after it
  expect(isAlive(ended, AT)).toBe(true)
  expect(isAlive(team({ endedAt: AT - MAIN_END_MS - 1, endedOk: true }), AT)).toBe(false)
})

test('an API error shakes Claude and marks it with a red !, and no check', async () => {
  const failed = team({ endedAt: AT - 500, apiError: 'overloaded' })
  const svg = drawTeam(failed, AT, USAGE)

  expect(svg).toContain('values="-3 0;3 0;-3 0;3 0;0 0"')
  expect(svg).toContain('fill="#ff5c5c">!</text>')
  expect(svg).not.toContain('stroke="#4caf50"')
  // later the shake is gone and the mark stays until the next turn
  const later = drawTeam(team({ endedAt: AT - 5000, apiError: 'overloaded' }), AT, USAGE)
  expect(later).not.toContain('values="-3 0;3 0;-3 0;3 0;0 0"')
  expect(later).toContain('fill="#ff5c5c">!</text>')
})

// ------------------------------------------------------------ the cost

test('a working pane animates fewer elements than before the change (54)', async () => {
  expect(animations(drawTeam(working({ lastTool: 'Read' }), AT, USAGE))).toBeLessThan(54)
  expect(animations(drawTeam(working(), AT, USAGE))).toBeLessThan(54)
})

// ------------------------------------------------------------ through the hooks

/** The drawing's markup on the desktop. */
const sourceOf = async ($: Engine): Promise<string> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  const source = svg?.props?.source
  if (typeof source !== 'string') throw new Error('the Svg carries no source')

  return source
}

test('a fresh session breathes: it does not draw the still pose before its first prompt', async ($, on) => {
  boot(on)
  await start($)

  expect(await sourceOf($)).toContain('type="scale"')
})

test("the pane's first frame, drawn as it opens, already breathes", async ($, on) => {
  const world = boot(on)
  // A frame asked for as the pane opens, drawn while the start still waits on the engine's agent list.
  let frame: Promise<string> | undefined
  world.onOpen = async () => {
    frame ??= sourceOf($)
  }
  let first: string | undefined
  world.onList = async () => {
    if (frame !== undefined && first === undefined) first = await frame
  }
  await start($)
  await world.clock.settle()

  expect(first).toBeDefined()
  expect(first).toContain('type="scale"')
})

test('a turn of tools redraws only when the kind of tool changes, and checks off at the end', async ($, on) => {
  const world = boot(on)
  // The clock passes the update check's 3 s: answer it, so no failed fetch lands in this test.
  world.http = () => ({ status: 404, ok: false, headers: {}, text: '' })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const seen = [await sourceOf($)]
  expect(seen[0]).toContain('id="dx-thinking"')

  // the model thinks for longer than any gap between tools: the icon of the last tool stays
  const tools = [
    { tool: 'Read', file_path: '/a.ts' },
    { tool: 'Read', file_path: '/b.ts' },
    { tool: 'Grep', pattern: 'x' },
    { tool: 'Grep', pattern: 'y' },
    { tool: 'Read', file_path: '/c.ts' },
  ] as const
  for (const call of tools) {
    await $.tool.call(call)
    await world.clock.advance(1500)
    seen.push(await sourceOf($))
  }
  const changes = seen.filter((source, i) => i > 0 && source !== seen[i - 1]).length
  expect(changes).toBe(3)
  expect(seen[1]).toContain('id="dx-tool-read"')
  expect(seen[3]).toContain('id="dx-tool-search"')
  expect(seen.slice(1).every(source => !source.includes('dx-thinking'))).toBe(true)

  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await sourceOf($)).toContain('stroke="#4caf50"')
  await world.clock.advance(3000)
  expect(await sourceOf($)).not.toContain('stroke="#4caf50"')
})
