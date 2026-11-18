import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { TEAM_DELEGATION, withTeamDelegation } from '../hooks/state'
import { boot, PANE, spawn, spawnInput } from './support'

const startIn = ($: Engine, cwd: string) => $.session.start({ cwd, surface: 'desktop', isInteractive: true })

/** The engine's paragraph as Claude Code 2.1.325 words it: the contract the rewrite is held to. */
const NO_SPAWN_PARAGRAPH =
  "**Do not spawn agents unless the user asks.** Each spawn starts cold and re-derives context you already have — it's " +
  'the expensive path on this plan. A task with "multiple angles," "thorough," or several parts is not a request to ' +
  'spawn; handle it inline with your own tools. Only use this tool when the user explicitly says to use a subagent, or ' +
  'names one of the available agent types. This does not cover the `web-fetch` agent type where it is listed and you ' +
  'have no WebFetch tool of your own: it stands in for that tool, so calling it to read a page is ordinary tool use.'
const ENGINE_AGENT =
  'Launch a new agent to handle complex, multi-step tasks.\n\n' +
  `${NO_SPAWN_PARAGRAPH}\n\n` +
  'When using the Agent tool, specify a subagent_type.'

const PACK = { id: 'p1', name: 'Web', skills: ['frontend-design:frontend-design', ...Array.from({ length: 23 }, () => null)] }
const ON_BRANCH = { exitCode: 0, stdout: '# branch.head feat/x\n# branch.ab +0 -0\n', stderr: '' }

// ------------------------------------------------------------ the brief

test("a team agent's brief ends with the session's folder as it is, its branch and the picked skills", async ($, on) => {
  const world = boot(on, {
    store: {
      skillSlots: ['code-review', null, null, null, null, null, null, null],
      skillPacks: [PACK],
      armedByProject: { 'c:/repo': { skills: ['code-review'], packs: ['p1'], at: 1 } },
    },
  })
  world.gitAnswers['git status'] = ON_BRANCH
  await startIn($, 'C:\\Repo')
  await world.clock.advance(2000)
  await spawn($, 'a1', 'agent-team:implementer', { prompt: 'Goal: add the endpoint.' })

  const brief = world.spawned.at(-1)?.prompt ?? ''
  expect(brief.startsWith('Goal: add the endpoint.')).toBe(true)
  expect(brief).toContain('<team-context>')
  expect(brief).toContain('Project folder: C:\\Repo, git branch feat/x.')
  expect(brief).toContain('"code-review", "frontend-design:frontend-design"')
  expect(brief).toContain('only those this task needs')
  expect(brief.endsWith('</team-context>')).toBe(true)
})

test('with nothing picked the brief says so', async ($, on) => {
  const world = boot(on)
  await startIn($, '/work')
  await spawn($, 'a1', 'agent-team:tester')
  expect(world.spawned.at(-1)?.prompt).toContain('The user has no skills picked in the pane.')
})

test('a spawn that runs in another folder names that folder and no branch', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = ON_BRANCH
  await startIn($, '/work')
  await world.clock.advance(2000)
  await spawn($, 'a1', 'agent-team:explorer', { cwd: '/elsewhere' })
  expect(world.spawned.at(-1)?.prompt).toContain('Project folder: /elsewhere.')
})

test('a detached HEAD names no branch', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = { exitCode: 0, stdout: '# branch.head (detached)\n', stderr: '' }
  await startIn($, '/work')
  await world.clock.advance(2000)
  await spawn($, 'a1', 'agent-team:explorer')
  expect(world.spawned.at(-1)?.prompt).toContain('Project folder: /work.\n')
})

test('a brief that only mentions the block still gets one; a brief that ends with one does not get two', async ($, on) => {
  const world = boot(on)
  await startIn($, '/work')
  await spawn($, 'a1', 'agent-team:reviewer', { prompt: 'Check how the hook adds <team-context> to briefs.' })
  await spawn($, 'a2', 'agent-team:reviewer', { prompt: 'Find it.\n\n<team-context>\nhere\n</team-context>\n' })
  expect(world.spawned[0]?.prompt).toContain('Project folder: /work.')
  expect(world.spawned[1]?.prompt).toBe('Find it.\n\n<team-context>\nhere\n</team-context>\n')
})

test('a teammate of a team type gets the block', async ($, on) => {
  const world = boot(on)
  await startIn($, '/work')
  await $.agent.spawn(spawnInput({ tool_use_id: 't1', subagentType: 'agent-team:tester', isTeammate: true, name: 'qa' }))
  expect(world.spawned.at(-1)?.prompt).toContain('<team-context>')
})

test('other agents, the old bare names, forks, resumes and workflow agents are left as they were', async ($, on) => {
  const world = boot(on)
  await startIn($, '/work')
  await spawn($, 'g1', 'general-purpose')
  await spawn($, 'b1', 'explorer')
  await spawn($, 'b2', 'reviewer')
  await $.agent.spawn(spawnInput({ tool_use_id: 'f1', subagentType: 'agent-team:explorer', fork: true }))
  await $.agent.spawn(spawnInput({ tool_use_id: 'r1', subagentType: 'agent-team:explorer', prompt: 'more', resume: { agentId: 'x' } }))
  await $.agent.spawn(
    spawnInput({ tool_use_id: 'w1', subagentType: 'agent-team:explorer', workflow: { runId: 'wf_abc123', agentIndex: 1 } }),
  )

  expect(world.spawned.map(s => s.prompt)).toEqual(['Do the job', 'Do the job', 'Do the job', 'Do the job', 'more', 'Do the job'])
})

// ------------------------------------------------------------ the Agent tool

test("the Agent tool's advice not to delegate gives way to the team's paragraph; the rest is kept", () => {
  const out = withTeamDelegation(ENGINE_AGENT)
  expect(out).not.toContain('Do not spawn agents unless the user asks')
  expect(out).not.toContain('multiple angles')
  expect(out).toContain(`${TEAM_DELEGATION} This does not cover the \`web-fetch\` agent type`)
  expect(out.startsWith('Launch a new agent to handle complex, multi-step tasks.\n\n**The user')).toBe(true)
  expect(out.endsWith('ordinary tool use.\n\nWhen using the Agent tool, specify a subagent_type.')).toBe(true)
})

test('a paragraph without the web-fetch note is replaced up to its own line end, whatever follows', () => {
  const lines = ['A', '', '**Do not spawn agents unless the user asks.** Only when asked.', '- a list item', '- another', '', 'B']
  expect(withTeamDelegation(lines.join('\n'))).toBe(['A', '', `${TEAM_DELEGATION} `, '- a list item', '- another', '', 'B'].join('\n'))
  expect(withTeamDelegation(lines.join('\r\n'))).toBe(['A', '', `${TEAM_DELEGATION} `, '- a list item', '- another', '', 'B'].join('\r\n'))
})

test('an Agent text worded otherwise keeps all of it and gets the paragraph at its end', () => {
  expect(withTeamDelegation('Spawn an agent.')).toBe(`Spawn an agent.\n\n${TEAM_DELEGATION}`)
})

test('the Agent tool is drawn with the team paragraph, and the switch stores the setting a session reads', async ($, on) => {
  const world = boot(on)
  on('tool.describe', (_, e) => ({ description: e.description }))
  await startIn($, '/work')
  const describe = () =>
    $.tool.describe({ tool: 'Agent', description: ENGINE_AGENT, provider: { plugin: 'engine', tier: 'core' } } as never)

  expect((await describe()).description).toContain(TEAM_DELEGATION)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(String((await ui.find({ type: 'Button', key: 'delegation' }))?.props.label)).toBe('Delegar: sí')
  await ui.press({ key: 'delegation' })
  await ui.unmount()
  expect(world.stored.delegation).toBe(false)
  // what a session that draws the tool after the switch reads
  expect((await describe()).description).toBe(ENGINE_AGENT)
})

test('a session whose store says off draws the Agent tool as the engine words it', async ($, on) => {
  boot(on, { store: { delegation: false } })
  on('tool.describe', (_, e) => ({ description: e.description }))
  await startIn($, '/work')
  const out = await $.tool.describe({ tool: 'Agent', description: ENGINE_AGENT, provider: { plugin: 'engine', tier: 'core' } } as never)
  expect(out.description).toBe(ENGINE_AGENT)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(String((await ui.find({ type: 'Button', key: 'delegation' }))?.props.label)).toBe('Delegar: no')
  await ui.unmount()
})

test('other tools are described as the engine says', async ($, on) => {
  boot(on)
  on('tool.describe', (_, e) => ({ description: e.description }))
  await startIn($, '/work')
  const out = await $.tool.describe({ tool: 'Bash', description: ENGINE_AGENT, provider: { plugin: 'engine', tier: 'core' } } as never)
  expect(out.description).toBe(ENGINE_AGENT)
})
