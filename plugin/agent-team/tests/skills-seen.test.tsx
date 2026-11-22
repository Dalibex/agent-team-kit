import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { boot, finish, shows, spawn, start } from './support'

const loadSkill = ($: Engine, skill: string, agentId?: string) =>
  $.tool.call({ tool: 'Skill', skill, ...(agentId === undefined ? {} : { agentId }) } as never)

test("the skills Claude loads this turn show under its row, and a new turn starts clean", async ($, on) => {
  boot(on)
  await start($)
  await $.turn.start({ text: 'hola', turnId: 't1' } as never)
  await loadSkill($, 'urbanpulse-dev:urbanpulse-dev')
  await loadSkill($, 'engineering:debug')
  await loadSkill($, 'engineering:debug')
  expect(await shows($, 'desktop', /^✦ urbanpulse-dev · debug$/, 'Text', 'team')).toBe(true)
  expect(await shows($, 'terminal', /^✦ urbanpulse-dev · debug$/, 'Text', 'team')).toBe(true)

  await $.turn.start({ text: 'otra', turnId: 't2' } as never)
  expect(await shows($, 'desktop', /^✦ /, 'Text', 'team')).toBe(false)
})

test("an agent's row says which skills it loaded, and keeps them once it ends", async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  await loadSkill($, 'code-quality:code-quality', 'a1')
  await loadSkill($, 'ponytail', 'a1')
  await finish($, 'a1')
  expect(await shows($, 'desktop', /^✦ code-quality · ponytail$/, 'Text', 'team')).toBe(true)
})

test('an agent woken again starts its list over', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  await loadSkill($, 'ponytail', 'a1')
  await finish($, 'a1')
  await $.turn.start({ text: 'fix it', turnId: 't3', agentId: 'a1' } as never)
  expect(await shows($, 'desktop', /^✦ ponytail$/, 'Text', 'team')).toBe(false)
})
