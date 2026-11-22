import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { drawTeam, toolKindOf } from '../hooks/drawing'
import { setLanguage } from '../hooks/i18n'
import { EMPTY, isAlive, isStill, MAIN_END_MS, STILL_MS } from '../hooks/state'
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

// ------------------------------------------------------------ a minute at rest

test('after a quiet minute the sprites hold a still pose, and move again when something happens', async () => {
  const resting = team({}, [], STILL_MS + 1000)
  const svg = drawTeam(resting, AT, USAGE)

  expect(isStill(resting, AT)).toBe(true)
  expect(svg).not.toContain('type="scale"')
  expect(svg).not.toContain('attributeName="height"')
  expect(svg).not.toContain('>z<animate ')
  // only the title's two twinkles still move
  expect(animations(svg)).toBe(2)

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
  // the icon pops in once
  expect(drawTeam(working({ lastTool: 'Read' }), AT, USAGE)).toContain('values="0;1.18;1"')
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

test('Claude leans towards the slot it just sent work to, once, and only during the out pulse', async () => {
  const sent = agent({ startedAt: AT - 500 })
  const svg = drawTeam(working({}, [sent]), AT, USAGE)

  expect(svg).toMatch(/values="0 0;-?[0-9.]+ -2;0 0" keyTimes="0;0\.4;1" dur="0\.6s"\/>/)
  expect(drawTeam(working({}, [{ ...sent, startedAt: AT - 5000 }]), AT, USAGE)).not.toContain('keyTimes="0;0.4;1"')
  // towards the right for a slot at the right of the lead, to the left for one at its left
  const lean = (role: AgentRow['role']) =>
    Number(/values="0 0;(-?[0-9.]+) -2;0 0"/.exec(drawTeam(working({}, [agent({ role, startedAt: AT - 500 })]), AT, USAGE))?.[1])
  expect(lean('reviewer')).toBeGreaterThan(0)
  expect(lean('explorer')).toBeLessThan(0)
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
