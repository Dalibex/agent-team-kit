import { expect } from 'claude-code/testing'
import { test } from './support'
import type { Engine } from 'claude-code/testing'

import { AGENT_TEAM_COMMAND, PANE, SURFACES, boot, finish, shows, spawn, start, unfold, usage } from './support'

// ------------------------------------------------------- how an agent ends

for (const [reason, mark, note] of [
  ['answer', '✓', undefined],
  ['aborted', '■', 'parado'],
  ['error', '✗', 'falló'],
  ['refusal', '✗', 'falló'],
] as const) {
  test(`turn.complete with reason ${reason} closes the row as ${mark}`, async ($, on) => {
    boot(on)
    await start($)
    await spawn($, 'a1', 'Explore', { description: 'Map the repo' })
    await finish($, 'a1', reason)
    await unfold($, 'a1')

    for (const surface of SURFACES) {
      expect(await shows($, surface, new RegExp(`${mark} explorer`))).toBe(true)
      expect(await shows($, surface, /● explorer/)).toBe(false)
      expect(await shows($, surface, /^Map the repo$/)).toBe(true)
      expect(await shows($, surface, new RegExp(`^${note ?? 'hecho'} · 0 herramientas$`))).toBe(true)
    }
  })
}

// -------------------------------------------------- the engine's agent list

for (const [listed, mark] of [
  ['completed', '✓'],
  ['failed', '✗'],
  ['killed', '■'],
  ['idle', '✓'],
] as const) {
  test(`a running row the list reports ${listed} closes as ${mark}`, async ($, on) => {
    const world = boot(on)
    await start($)
    await spawn($, 'a1', 'implementer', { description: 'Build it' })
    world.listed = [{ id: 'a1', type: 'implementer', description: 'Build it', status: listed }]

    // the ticker checks every 15 s
    await world.clock.advance(16_000)

    for (const surface of SURFACES) {
      expect(await shows($, surface, new RegExp(`${mark} implementer`))).toBe(true)
      expect(await shows($, surface, /● implementer/)).toBe(false)
    }
  })
}

test('a running row the list still names as running stays running', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'implementer', { description: 'Build it' })
  world.listed = [{ id: 'a1', type: 'implementer', description: 'Build it', status: 'running' }]

  await world.clock.advance(11 * 60 * 1000)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /● implementer/)).toBe(true)
  }
})

test('a running row the list does not name, quiet for over 10 minutes, closes as stopped', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'implementer', { description: 'Build it' })

  await world.clock.advance(11 * 60 * 1000)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /■ implementer/)).toBe(true)
    expect(await shows($, surface, /● implementer/)).toBe(false)
  }
})

test('a row the list does not name but that used a tool lately is kept', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'implementer', { description: 'Build it' })
  await world.clock.advance(9 * 60 * 1000)
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'a1' })
  await world.clock.advance(3 * 60 * 1000)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /● implementer/)).toBe(true)
  }
})

// ----------------------------------------------------------------- history

test('a finished row stays when another agent of the same role starts', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore', { description: 'Map the backend' })
  await finish($, 'a1')
  await spawn($, 'a2', 'Explore', { description: 'Map the frontend' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^✓ explorer$/)).toBe(true)
    expect(await shows($, surface, /^Map the backend$/)).toBe(true)
    expect(await shows($, surface, /^● explorer$/)).toBe(true)
    expect(await shows($, surface, /trabajando/)).toBe(true)
  }
})

test('the team tab lists the 16 newest rows, the whole history', async ($, on) => {
  boot(on)
  await start($)
  for (let i = 1; i <= 20; i += 1) {
    const id = `a${i}`
    await spawn($, id, 'Explore', { description: `Task ${String(i).padStart(2, '0')}` })
    await finish($, id)
  }

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^Task 20$/)).toBe(true)
    expect(await shows($, surface, /^Task 05$/)).toBe(true)
    expect(await shows($, surface, /^Task 04$/)).toBe(false)
  }
})

test('a running row is never dropped when the history is full', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'long', 'reviewer', { description: 'Review everything' })
  for (let i = 1; i <= 20; i += 1) {
    await spawn($, `a${i}`, 'Explore', { description: `Task ${String(i).padStart(2, '0')}` })
    await finish($, `a${i}`)
  }

  // Past the 8 shown rows, but alive: its slot still draws it as working.
  expect(await shows($, 'terminal', /\[•_•\] reviewer/)).toBe(true)
  expect(await shows($, 'terminal', /^Review everything$/)).toBe(false)
})

// ------------------------------------------------- the pane opens and hides

test('the pane opens at session start, titled Nova team', { options: { teamName: 'Nova' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  await world.clock.settle()

  expect(world.opened).toEqual(['Nova team'])
})

test('the pane does not open at session start when the store holds isOpen false', { options: { teamName: 'Nova' } }, async ($, on) => {
  const world = boot(on, { store: { isOpen: false } })
  await start($)
  await world.clock.settle()

  expect(world.opened).toEqual([])
})

test('the pane opens at session start when the store holds isOpen true', { options: { teamName: 'Nova' } }, async ($, on) => {
  const world = boot(on, { store: { isOpen: true } })
  await start($)
  await world.clock.settle()

  expect(world.opened).toEqual(['Nova team'])
})

test('/agent-team on an open pane closes it, and the next session leaves it closed', { options: { teamName: 'Nova' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  await world.clock.settle()
  world.panes = ['agent-team']

  await $.command.run(AGENT_TEAM_COMMAND)
  expect(world.closed).toEqual(['agent-team'])

  world.panes = []
  await start($)
  await world.clock.settle()
  expect(world.opened).toEqual(['Nova team'])
})

test('/agent-team on a hidden pane opens it, and the next session opens it too', { options: { teamName: 'Nova' } }, async ($, on) => {
  const world = boot(on, { store: { isOpen: false } })
  await start($)
  await world.clock.settle()
  expect(world.opened).toEqual([])

  await $.command.run(AGENT_TEAM_COMMAND)
  expect(world.opened).toEqual(['Nova team'])

  await start($)
  await world.clock.settle()
  expect(world.opened).toEqual(['Nova team', 'Nova team'])
})

// ------------------------------------------------------------ the status line

test('the status line counts working agents and background shells', { options: { teamName: 'Nova' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await $.tool.call({ tool: 'Bash', command: 'sleep 60', description: 'Wait', run_in_background: true })

  expect(world.statuses[world.statuses.length - 1]).toBe(
    'nova team: 1 agente trabajando · 1 shell en segundo plano',
  )
})

// ------------------------------------------------------------ the agent rows

test('a running agent row reads as working, with its time and model family', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore', { model: 'claude-haiku-5-5' })
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'a1' })
  await world.clock.advance(5000)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^● explorer$/)).toBe(true)
    expect(await shows($, surface, /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] trabajando\.{1,3}$/)).toBe(true)
    expect(await shows($, surface, /^5s · haiku$/)).toBe(true)
  }
  await unfold($, 'a1')
  expect(await shows($, 'desktop', /^trabajando · Grep · 1 herramienta$/)).toBe(true)
})

test('the working dots move with the clock', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  const dots = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const found = await ui.find({ type: 'Text', text: /trabajando/ })
    await ui.unmount()

    return found?.text
  }
  const first = await dots()
  await world.clock.advance(1000)
  expect(await dots()).not.toBe(first)
})

test('the row keeps the spawn model until turn.complete reports another', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore', { model: 'claude-haiku-5-5' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /· haiku/)).toBe(true)
  }

  await finish($, 'a1', 'answer', usage('claude-sonnet-5-5', 10, 10))

  await unfold($, 'a1')
  for (const surface of SURFACES) {
    expect(await shows($, surface, /^0s · sonnet$/)).toBe(true)
    expect(await shows($, surface, /^hecho · 0 herramientas · 20 tokens$/)).toBe(true)
    expect(await shows($, surface, /haiku/)).toBe(false)
  }
})

test('a finished row shows its task, and its tool count when unfolded', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore', { model: 'claude-haiku-5-5' })
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'a1' })
  await $.tool.call({ tool: 'Glob', pattern: '**/*.ts', agentId: 'a1' })
  await world.clock.advance(3000)
  await finish($, 'a1')

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^3s · haiku$/)).toBe(true)
    expect(await shows($, surface, /^Job a1$/)).toBe(true)
  }
  await unfold($, 'a1')
  expect(await shows($, 'desktop', /^hecho · 2 herramientas$/)).toBe(true)
})

test('two running agents of one role show ×2 next to the role on the terminal', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')

  expect(await shows($, 'terminal', /explorer ×/)).toBe(false)

  await spawn($, 'a2', 'Explore')

  expect(await shows($, 'terminal', /explorer ×2/)).toBe(true)
})

test('a tester agent runs in its own slot', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'tester', { description: 'Run the suite' })

  expect(await shows($, 'terminal', /\[•_•\] tester/)).toBe(true)
  expect(await shows($, 'terminal', /\[•_•\] agente/)).toBe(false)
  for (const surface of SURFACES) {
    expect(await shows($, surface, /^● tester$/)).toBe(true)
  }
})

test('a subagent type containing tester is a tester', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'unit-tester')

  expect(await shows($, 'terminal', /\[•_•\] tester/)).toBe(true)
})

// ------------------------------------------------------- session tokens

test("Claude's unfolded row totals fresh tokens per role, cache reads left out", async ($, on) => {
  boot(on)
  await start($)
  await finish($, undefined, 'answer', usage('claude-opus-5-5', 1000, 100, 100, 50_000))
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'answer', usage('claude-haiku-5-5', 1000, 500, 1500, 90_000))
  await unfold($, 'main')

  for (const surface of SURFACES) {
    expect(
      await shows($, surface, /^tokens nuevos de la sesión: Claude 1\.2k \(1 turno\) · explorer 3\.0k \(1×\)$/),
    ).toBe(true)
  }
})

// ------------------------------------------------------ delegation warning

const read = ($: Engine, n: number) => $.tool.call({ tool: 'Read', file_path: `/repo/src/file${n}.ts` })

for (const [reads, isWarned] of [
  [6, true],
  [5, false],
] as const) {
  test(`Claude reading ${reads} distinct files in a turn ${isWarned ? 'shows' : 'does not show'} the warning`, async ($, on) => {
    boot(on)
    await start($)
    await $.turn.start({ text: 'look around', turnId: 't1' })
    for (let n = 1; n <= reads; n += 1) await read($, n)

    for (const surface of SURFACES) {
      expect(
        await shows($, surface, /^⚠ 6 ficheros leídos sin el explorer$/),
      ).toBe(isWarned)
    }
  })
}

test('an explorer spawned from the main loop that turn clears the warning', async ($, on) => {
  boot(on)
  await start($)
  await $.turn.start({ text: 'look around', turnId: 't1' })
  for (let n = 1; n <= 6; n += 1) await read($, n)
  await spawn($, 'a1', 'Explore')

  for (const surface of SURFACES) {
    expect(await shows($, surface, /ficheros leídos sin el explorer/)).toBe(false)
  }
})

test('an explorer spawned by another agent does not clear the warning', async ($, on) => {
  boot(on)
  await start($)
  await $.turn.start({ text: 'look around', turnId: 't1' })
  for (let n = 1; n <= 6; n += 1) await read($, n)
  await spawn($, 'impl', 'implementer')
  await spawn($, 'a1', 'Explore', { parentAgentId: 'impl' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /ficheros leídos sin el explorer/)).toBe(true)
  }
})

test('the same file read twice counts once', async ($, on) => {
  boot(on)
  await start($)
  await $.turn.start({ text: 'look around', turnId: 't1' })
  for (let n = 1; n <= 5; n += 1) await read($, n)
  await read($, 1)
  await read($, 5)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /ficheros leídos sin el explorer/)).toBe(false)
  }
})

test('a new main turn resets the warning', async ($, on) => {
  boot(on)
  await start($)
  await $.turn.start({ text: 'look around', turnId: 't1' })
  for (let n = 1; n <= 6; n += 1) await read($, n)
  expect(await shows($, 'terminal', /ficheros leídos sin el explorer/)).toBe(true)

  await $.turn.start({ text: 'and now', turnId: 't2' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /ficheros leídos sin el explorer/)).toBe(false)
  }
})

test("the files an agent reads do not count against Claude", async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await $.turn.start({ text: 'look around', turnId: 't1' })
  for (let n = 1; n <= 6; n += 1) await $.tool.call({ tool: 'Read', file_path: `/repo/src/file${n}.ts`, agentId: 'a1' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /ficheros leídos sin el explorer/)).toBe(false)
  }
})

// ----------------------------------------------------------------- sounds

const WINDOWS = { OS: 'Windows_NT' }

for (const [subagentType, clip] of [
  ['Explore', 'sounds/explorer.wav'],
  ['implementer', 'sounds/implementer.wav'],
  ['tester', 'sounds/tester.wav'],
  ['reviewer', 'sounds/reviewer.wav'],
  ['general-purpose', 'sounds/main.wav'],
] as const) {
  test(`a done ${subagentType} agent plays ${clip} through audio.play off Windows`, async ($, on) => {
    const world = boot(on, { env: {} })
    await start($)
    await spawn($, 'a1', subagentType)
    await finish($, 'a1', 'answer')
    await world.clock.settle()

    expect(world.clips).toEqual([clip])
    expect(world.runs).toEqual([])
  })
}

test('on Windows a done agent plays its clip through PowerShell and process.run', async ($, on) => {
  const world = boot(on, { env: WINDOWS })
  await start($)
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'answer')
  await world.clock.settle()

  expect(world.clips).toEqual([])
  expect(world.runs).toHaveLength(1)
  expect(world.runs[0]?.argv).toEqual([
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-Command',
    '(New-Object Media.SoundPlayer $env:AGENT_TEAM_CLIP).PlaySync()',
  ])
  expect(world.runs[0]?.init?.env?.AGENT_TEAM_CLIP).toMatch(/\\sounds\\explorer\.wav$/)
  expect(world.runs[0]?.init?.timeoutMs).toBeGreaterThan(0)
})

for (const reason of ['error', 'refusal'] as const) {
  test(`${reason === 'error' ? 'an' : 'a'} ${reason} plays the failure clip`, async ($, on) => {
    const world = boot(on, { env: {} })
    await start($)
    await spawn($, 'a1', 'Explore')
    await finish($, 'a1', reason)
    await world.clock.settle()

    expect(world.clips).toEqual(['sounds/fail.wav'])
  })
}

test('on Windows a failure plays sounds/fail.wav through process.run', async ($, on) => {
  const world = boot(on, { env: WINDOWS })
  await start($)
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'error')
  await world.clock.settle()

  expect(world.runs[0]?.init?.env?.AGENT_TEAM_CLIP).toMatch(/\\sounds\\fail\.wav$/)
})

for (const [name, env] of [
  ['off Windows', {}],
  ['on Windows', WINDOWS],
] as const) {
  test(`a stop plays no clip ${name}`, async ($, on) => {
    const world = boot(on, { env })
    await start($)
    await spawn($, 'a1', 'Explore')
    await finish($, 'a1', 'aborted')
    await world.clock.settle()

    expect(world.clips).toEqual([])
    expect(world.runs).toEqual([])
  })
}

test("a shell's end plays the main clip when it has no owner", async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'make', description: 'Build', run_in_background: true })
  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><status>completed</status></task-notification>',
  })
  await world.clock.settle()

  expect(world.clips).toEqual(['sounds/main.wav'])
})

test("a shell's end plays its owner's clip", async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await spawn($, 'impl', 'implementer')
  await $.tool.call({ tool: 'Bash', command: 'make', description: 'Build', run_in_background: true, agentId: 'impl' })
  await $.session.receive({
    origin: { kind: 'task-notification' },
    agentId: 'impl',
    text: '<task-notification><status>completed</status></task-notification>',
  })
  await world.clock.settle()

  expect(world.clips).toEqual(['sounds/implementer.wav'])
})

test('two endings within 400 ms play one clip', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await spawn($, 'a1', 'Explore')
  await spawn($, 'a2', 'reviewer')
  await finish($, 'a1', 'answer')
  await world.clock.advance(300)
  await finish($, 'a2', 'answer')
  await world.clock.settle()

  expect(world.clips).toHaveLength(1)
})

test('two endings 400 ms apart play two clips', async ($, on) => {
  const world = boot(on, { env: {} })
  await start($)
  await spawn($, 'a1', 'Explore')
  await spawn($, 'a2', 'reviewer')
  await finish($, 'a1', 'answer')
  await world.clock.advance(400)
  await finish($, 'a2', 'answer')
  await world.clock.settle()

  expect(world.clips).toEqual(['sounds/explorer.wav', 'sounds/reviewer.wav'])
})

// --------------------------------------------- engine events in orders the helpers never produce

test("an agent's turn.start before its spawn resolves keeps the spawn's warning on the row", async ($, on) => {
  const world = boot(on)
  await start($)
  world.listed = [{ id: 'a1', type: 'agent-team:implementer', description: 'Job a1', status: 'running' }]
  world.onSpawn = async () => {
    world.onSpawn = undefined
    await $.turn.start({ text: 'Fix the login bug', turnId: 't-a1', agentId: 'a1' } as never)
  }
  await spawn($, 'a1', 'agent-team:implementer', { prompt: 'Fix the login bug in auth.ts' })

  expect(await shows($, 'desktop', /^⚠ encargo sin Goal ni Why: el agente tendrá que adivinar o explorar$/)).toBe(true)
})

for (const order of ['StopFailure first', 'turn.complete first'] as const) {
  test(`an agent cut by an API error keeps the precise reason, ${order}`, async ($, on) => {
    boot(on)
    await start($)
    await spawn($, 'a1', 'agent-team:tester')
    const failure = () => $.classic.StopFailure({ error: 'overloaded', agent_id: 'a1' } as never)
    if (order === 'StopFailure first') await failure()
    await finish($, 'a1', 'error')
    if (order === 'turn.complete first') await failure()
    await unfold($, 'a1')

    expect(await shows($, 'desktop', /servidores saturados/)).toBe(true)
    expect(await shows($, 'desktop', /un error de la API lo cortó/)).toBe(false)
  })
}

test('an agent row closed by the list ends its foreground job too', async ($, on) => {
  const world = boot(on, { store: { tab: 'jobs' } })
  await start($)
  await spawn($, 'a1', 'agent-team:implementer')
  let release: () => void = () => undefined
  world.toolResult = () =>
    new Promise(resolve => {
      release = () => resolve({ result: { stdout: '', stderr: '', interrupted: false } })
    })
  const call = $.tool.call({ tool: 'Bash', command: 'mvn package', agentId: 'a1' })
  await world.clock.advance(1000)
  world.listed = [{ id: 'a1', type: 'agent-team:implementer', description: 'Job a1', status: 'completed' }]
  await world.clock.advance(16_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^■$/ })).toBeDefined()
  await ui.unmount()
  release()
  await call
})

// ------------------------------------------------------ reads the same turn edits

test('a file Claude reads to edit it does not count as a read', async ($, on) => {
  boot(on)
  await start($)
  await $.turn.start({ text: 'change it', turnId: 't1' })
  for (let n = 1; n <= 6; n += 1) await read($, n)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/file6.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/new.ts', content: 'x' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/new.ts' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /ficheros leídos sin el explorer/)).toBe(false)
  }
})

// ------------------------------------------------------ the skill slots across windows

test('filling a slot keeps the slots another window filled meanwhile', async ($, on) => {
  const world = boot(on, { store: { tab: 'skills', skillSlots: ['code-review', null, null, null, null, null, null, null] } })
  world.commands = [{ name: 'code-review', description: 'Reviews', source: 'user' }, { name: 'lint', description: 'Lints', source: 'user' }, { name: 'tidy', description: 'Tidies', source: 'user' }] as never
  await start($)
  const press = async (key: string): Promise<void> => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key })
    await ui.unmount()
  }
  await press('skills-loose')
  // another window puts a skill in slot 2 meanwhile
  world.stored.skillSlots = ['code-review', 'tidy', null, null, null, null, null, null]
  await press('slot-btn-2')
  await press('skills-group-0')
  await press('skills-choice-1')

  expect(world.stored.skillSlots).toEqual(['code-review', 'tidy', 'lint', null, null, null, null, null])
})

/** The skills tab of the loose slots, with three skills to pick from; `slots` seeds the store. */
const looseSlots = async ($: Engine, on: Parameters<typeof boot>[0], slots: (string | null)[]) => {
  const world = boot(on, { store: { tab: 'skills', skillSlots: slots } })
  world.commands = [
    { name: 'code-review', description: 'Reviews', source: 'user' },
    { name: 'lint', description: 'Lints', source: 'user' },
    { name: 'tidy', description: 'Tidies', source: 'user' },
  ] as never
  await start($)
  const press = async (...keys: string[]): Promise<void> => {
    for (const key of keys) {
      const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
      await ui.press({ key })
      await ui.unmount()
    }
  }
  await press('skills-loose')

  return { world, press }
}

test('two slots filled while the store answers late both stay filled', async ($, on) => {
  const { world, press } = await looseSlots($, on, ['code-review', null, null, null, null, null, null, null])
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  world.onStoreGet = key => {
    if (key !== 'skillSlots') return undefined
    world.onStoreGet = undefined

    return gate
  }
  // the first fill waits on the store; the second is pressed meanwhile
  await press('slot-btn-1', 'skills-group-0', 'skills-choice-1')
  await press('skills-back', 'skills-back', 'slot-btn-2', 'skills-group-0', 'skills-choice-2')
  release()
  await world.clock.settle()

  expect(world.stored.skillSlots).toEqual(['code-review', 'lint', 'tidy', null, null, null, null, null])
})

test('a skill another window put in a slot meanwhile does not go in a second one', async ($, on) => {
  const { world, press } = await looseSlots($, on, ['code-review', null, null, null, null, null, null, null])
  world.stored.skillSlots = ['code-review', 'lint', null, null, null, null, null, null]
  await press('slot-btn-2', 'skills-group-0', 'skills-choice-1')

  expect(world.stored.skillSlots).toEqual(['code-review', 'lint', null, null, null, null, null, null])
})

test("an unfolded agent offers to open its conversation only on the terminal, which draws the main view", async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:explorer')
  await finish($, 'a1')
  await unfold($, 'a1')
  const hasView = async (surface: (typeof SURFACES)[number]): Promise<boolean> => {
    const ui = await $.ui.mount({ ...PANE, surface })
    const found = (await ui.find({ type: 'Button', key: 'view-a1' })) !== undefined
    // the row is unfolded on both: its copy button is there either way
    expect(await ui.find({ type: 'Button', key: 'copy-a1' }), surface).toBeDefined()
    await ui.unmount()

    return found
  }
  expect(await hasView('desktop')).toBe(false)
  expect(await hasView('terminal')).toBe(true)
})
