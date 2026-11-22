import { expect } from 'claude-code/testing'
import { test } from './support'
import type { Engine } from 'claude-code/testing'

import { boot, finish, PANE, shows, spawn, start, SURFACES, unfold, usage } from './support'

/** The drawing's source on the desktop, where the pane carries an Svg. */
const svgOf = async ($: Engine): Promise<string> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  const source = svg?.props.source
  if (typeof source !== 'string') throw new Error('the Svg carries no source')

  return source
}

// A confetti rect is the only element animated for 0.9 s and frozen at its end.
const CONFETTI = 'dur="0.9s" fill="freeze"'
// A check drawn on, as a fresh ending does, carries a dash; a settled one is plain.
const FRESH_CHECK = 'stroke-dasharray="30"'
const CHECK = 'stroke="#4caf50"'
const SHIMMER = 'attributeName="gradientTransform"'

// ------------------------------------------------- a late spawn and a resume

test('a late spawn fills in an adopted row that already ended, without reopening it', async ($, on) => {
  const world = boot(on)
  world.listed = [{ id: 'late', type: 'implementer', description: 'Adopted', status: 'running' }]
  await start($)
  await finish($, 'late')
  await spawn($, 'late', 'implementer', { description: 'Real description', model: 'claude-haiku-5-5' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^✓ implementer$/)).toBe(true)
    expect(await shows($, surface, /^● implementer$/)).toBe(false)
    expect(await shows($, surface, /^Real description$/)).toBe(true)
    expect(await shows($, surface, /^Adopted$/)).toBe(false)
    expect(await shows($, surface, /^\d+s · haiku$/)).toBe(true)
  }
})

test('a spawn with resume keeps the earlier brief', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore', { prompt: 'Original brief' })
  await finish($, 'a1')
  await spawn($, 'a1', 'Explore', { prompt: 'wake up', resume: { agentId: 'a1' } })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'agent-a1-x' })
  expect(await ui.find({ type: 'Text', text: /Original brief/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /wake up/ })).toBeUndefined()
  await ui.unmount()
})

test('a resumed agent reopens with its clock reset and its tokens and report cleared', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await world.clock.advance(5000)
  await finish($, 'a1', 'answer', usage('claude-opus-5-5', 10, 10))

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'agent-a1-x' })
  expect(await ui.find({ type: 'Text', text: /^tokens: / })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /su informe/ })).toBeDefined()
  await ui.unmount()

  await world.clock.advance(10_000)
  await $.turn.start({ text: 'again', turnId: 't2', agentId: 'a1' })
  await world.clock.advance(2000)

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^● explorer$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2s · / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^tokens: / })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /su informe/ })).toBeUndefined()
  await ui.unmount()
})

// ---------------------------------------------------------- closed by the list

test("a turn.complete after the list closed a row fills in its real end and counts no second run", async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  world.listed = [{ id: 'a1', type: 'Explore', description: 'Job a1', status: 'completed' }]
  await world.clock.advance(16_000)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^✓ explorer$/)).toBe(true)
  }

  await finish($, 'a1', 'error', usage('claude-opus-5-5', 1000, 500, 1500, 90_000))
  await unfold($, 'main')

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^✗ explorer$/)).toBe(true)
    expect(await shows($, surface, /^✓ explorer$/)).toBe(false)
    // its tokens count, its run does not count twice
    expect(await shows($, surface, /explorer 3\.0k \(1×\)$/)).toBe(true)
  }
})

test('the reconcile leaves a row alone that was active when the list was taken', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  world.listed = [{ id: 'a1', type: 'Explore', description: 'Job a1', status: 'completed' }]
  // A tool call lands at the very time of the list: newer than its snapshot.
  world.onList = async () => {
    world.onList = undefined
    await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'a1' })
  }

  await world.clock.advance(1000)
  for (const surface of SURFACES) {
    expect(await shows($, surface, /^● explorer$/)).toBe(true)
  }

  // the next check, 15 s on, sees it quiet and closes it
  await world.clock.advance(16_000)
  for (const surface of SURFACES) {
    expect(await shows($, surface, /^✓ explorer$/)).toBe(true)
  }
})

// ------------------------------------------------------------------ shells

const shell = ($: Engine, n: number) =>
  $.tool.call({ tool: 'Bash', command: `make-${n}`, description: `Shell ${n}`, run_in_background: true })

const endShell = ($: Engine, n: number, status = 'completed') =>
  $.session.receive({
    origin: { kind: 'task-notification' },
    text: `<task-notification><status>${status}</status><summary>Background command make-${n} finished</summary></task-notification>`,
  })

test('past six shells the finished ones leave first and a running one stays', async ($, on) => {
  boot(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'serve', description: 'Long shell', run_in_background: true })
  for (let n = 2; n <= 7; n += 1) {
    await shell($, n)
    await endShell($, n)
  }

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^Long shell$/)).toBe(true)
    expect(await shows($, surface, /^Shell 7$/)).toBe(true)
    expect(await shows($, surface, /^Shell 3$/)).toBe(true)
    expect(await shows($, surface, /^Shell 2$/)).toBe(false)
  }
})

test('seven running shells are all kept', { options: { teamName: 'Nova' } }, async ($, on) => {
  const world = boot(on)
  await start($)
  for (let n = 1; n <= 7; n += 1) await shell($, n)

  expect(world.statuses[world.statuses.length - 1]).toBe('nova team: 7 shells en segundo plano')
  for (const surface of SURFACES) {
    expect(await shows($, surface, /^Shell 1$/)).toBe(true)
    expect(await shows($, surface, /^Shell 7$/)).toBe(true)
  }
})

for (const outcome of ['killed', 'stopped'] as const) {
  test(`a ${outcome} shell shows a grey ■ and its time`, async ($, on) => {
    boot(on)
    await start($)
    await shell($, 1)
    await endShell($, 1, outcome)

    for (const surface of SURFACES) {
      expect(await shows($, surface, /^■$/)).toBe(true)
      expect(await shows($, surface, /^Shell 1$/)).toBe(true)
      expect(await shows($, surface, /^0s$/)).toBe(true)
    }
  })
}

test('a shell with an unknown outcome reads as failed', async ($, on) => {
  boot(on)
  await start($)
  await shell($, 1)
  await endShell($, 1, 'weird')

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^✗$/)).toBe(true)
  }
})

for (const [how, answer] of [
  ['refused', { deny: 'El usuario dijo que no' }],
  ['failed', { isError: true, result: 'spawn failed', text: 'spawn failed' }],
] as const) {
  for (const owner of [undefined, 'a1'] as const) {
    test(`a background call that is ${how} ${owner === undefined ? 'by Claude' : 'by an agent'} gets no shell row and no status line`, async ($, on) => {
      const world = boot(on)
      await start($)
      if (owner !== undefined) await spawn($, owner, 'agent-team:implementer')
      world.toolResult = e => (e.tool === 'Bash' ? (answer as never) : (undefined as never))
      const before = world.statuses.length
      await $.tool.call({ tool: 'Bash', command: 'make-1', description: 'Shell 1', run_in_background: true, ...(owner === undefined ? {} : { agentId: owner }) })

      expect(world.statuses.slice(before).some(line => line?.includes('shell') === true)).toBe(false)
      expect(await shows($, 'desktop', /^Shell 1$/)).toBe(false)
    })
  }
}

test('a background shell whose output keeps growing past an hour still runs, and its end is heard', async ($, on) => {
  const world = boot(on)
  await start($)
  const path = '/tmp/tasks/b7.output'
  world.toolResult = () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b7' },
    text: `Command running in background with ID: b7. Output is being written to: ${path}. You will be notified when it completes`,
  })
  world.files[path] = 'step 1'
  await $.tool.call({ tool: 'Bash', command: 'long-job', description: 'Long job', run_in_background: true })
  await world.clock.advance(59 * 60 * 1000)
  world.files[path] = 'step 1\nstep 2'
  await world.clock.advance(3 * 60 * 1000)

  expect(world.statuses[world.statuses.length - 1]).toMatch(/1 shell/)
  expect(await shows($, 'desktop', /^Long job$/, 'Text', 'jobs')).toBe(true)
  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><task-id>b7</task-id><status>completed</status></task-notification>',
  })
  await world.clock.settle()
  expect(world.statuses[world.statuses.length - 1]).toBeUndefined()
  expect(world.clips).toEqual(['sounds/main.wav'])
  expect(world.notified.some(line => line.includes('Long job'))).toBe(true)
})

test('a background shell quiet for over an hour is still closed by its notification', async ($, on) => {
  const world = boot(on)
  await start($)
  world.toolResult = () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b8' } })
  await $.tool.call({ tool: 'Bash', command: 'quiet-job', description: 'Quiet job', run_in_background: true })
  await world.clock.advance(61 * 60 * 1000)

  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><task-id>b8</task-id><status>failed</status></task-notification>',
  })
  await world.clock.settle()
  expect(world.clips).toEqual(['sounds/fail.wav'])
  expect(world.notified.some(line => line.includes('Quiet job'))).toBe(true)
})

/** A task notification that names no task and quotes no command. */
const vagueEnd = ($: Engine) =>
  $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><status>completed</status><summary>Background command finished</summary></task-notification>',
  })

test('a notice that names no task never closes a shell silent for over an hour, nor rings for it', async ($, on) => {
  const world = boot(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ghost-1', description: 'Ghost', run_in_background: true })
  await world.clock.advance(61 * 60 * 1000)

  await vagueEnd($)
  await world.clock.settle()
  expect(world.notified).toEqual([])
  expect(world.clips).toEqual([])
})

test('a shell silent for over an hour does not keep a fresh one from closing on a notice that names no task', async ($, on) => {
  const world = boot(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ghost-1', description: 'Ghost', run_in_background: true })
  await world.clock.advance(61 * 60 * 1000)
  await $.tool.call({ tool: 'Bash', command: 'make-2', description: 'Fresh', run_in_background: true })
  expect(world.statuses[world.statuses.length - 1]).toMatch(/1 shell /)

  await vagueEnd($)
  expect(world.statuses[world.statuses.length - 1]).toBeUndefined()
})

test('an output file first seen is not news: a silent shell stops running an hour after its start', async ($, on) => {
  const world = boot(on, { store: { tab: 'jobs' } })
  await start($)
  const path = '/tmp/tasks/b9.output'
  world.toolResult = () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b9' },
    text: `Command running in background with ID: b9. Output is being written to: ${path}. You will be notified when it completes`,
  })
  world.files[path] = 'Collecting torch\r 45%'
  await $.tool.call({ tool: 'Bash', command: 'pip install torch', description: 'Install torch', run_in_background: true })
  await world.clock.advance(60 * 60 * 1000 + 500)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/ })).toBeUndefined()
  await ui.unmount()
})

test('TaskStop closes a shell whose task id was never read, by the command its answer names', async ($, on) => {
  const world = boot(on)
  await start($)
  world.toolResult = e =>
    e.tool === 'TaskStop'
      ? { result: { message: 'Stopped', task_id: 'bg-9', task_type: 'local_bash', command: 'sleep 100' } }
      : { result: { stdout: '', stderr: '', interrupted: false } }
  await $.tool.call({ tool: 'Bash', command: 'sleep 100', description: 'Nap', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'sleep 200', description: 'Long nap', run_in_background: true })
  expect(world.statuses[world.statuses.length - 1]).toMatch(/2 shells/)

  await $.tool.call({ tool: 'TaskStop', task_id: 'bg-9' })
  expect(world.statuses[world.statuses.length - 1]).toMatch(/1 shell /)
})

// ---------------------------------------------------------------- the drawing

test('confetti and a drawn-on check appear for the first 2.5 s of an ending', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1')
  await world.clock.advance(1000)

  const source = await svgOf($)
  expect(source).toContain(CONFETTI)
  expect(source).toContain(FRESH_CHECK)
})

test('after 2.5 s the confetti is gone and a plain check stays until 6 s', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1')
  await world.clock.advance(3000)

  const source = await svgOf($)
  expect(source).not.toContain(CONFETTI)
  expect(source).not.toContain(FRESH_CHECK)
  expect(source).toContain(CHECK)
})

test('past 6 s the check is drawn away, the ticker having written once more as the team went idle', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1')
  await world.clock.advance(7000)

  const source = await svgOf($)
  expect(source).not.toContain(CONFETTI)
  expect(source).not.toContain(CHECK)
})

test('the title shimmers only while something is alive', async ($, on) => {
  const world = boot(on)
  await start($)
  expect(await svgOf($)).not.toContain(SHIMMER)

  await spawn($, 'a1', 'Explore')
  await world.clock.advance(1000)
  expect(await svgOf($)).toContain(SHIMMER)

  await finish($, 'a1')
  await world.clock.advance(7000)
  expect(await svgOf($)).not.toContain(SHIMMER)
})
