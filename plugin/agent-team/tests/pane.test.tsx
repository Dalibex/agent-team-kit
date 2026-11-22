import { expect, mock } from 'claude-code/testing'
import { test } from './support'

import { PANE, SPANISH, spawnInput } from './support'

/** A running job's mark: the spinner, one frame per tick. */
const SPIN = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/

test('an idle team says so on every surface', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^en reposo$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /El equipo duerme/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a spawned reviewer wakes up and its tool calls count', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('agent.spawn', () => ({ model: 'opus', agentId: 'agent-1' }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn(
    spawnInput({
      prompt: 'Review the diff',
      description: 'Review PR 12',
      subagentType: 'reviewer',
    }),
  )
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'agent-1' })

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^● reviewer$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /trabajando/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.press({ key: 'agent-agent-1-x' })
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Review PR 12$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^trabajando · Grep · 1 herramienta$/ })).toBeDefined()
  await ui.unmount()
})

test('a background shell closes when its task notification arrives', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-77' },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'Bash',
    command: './mvnw verify',
    description: 'Run Maven verify',
    run_in_background: true,
  })

  await clock.advance(5000)

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^maven · build · verify$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SPIN })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^5s$/ })).toBeDefined()
  await ui.unmount()

  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><task-id>bg-77</task-id><status>completed</status></task-notification>',
  })

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^5s$/ })).toBeDefined()
  await ui.unmount()
})

test('a background shell stopped with TaskStop leaves the running state at once', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) =>
    e.tool === 'TaskStop'
      ? { result: { message: 'Stopped', task_id: 'bg-31', task_type: 'local_bash' } }
      : { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: e.tool === 'Bash' ? 'bg-31' : 'bg-32' } },
  )
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'python -m http.server 8000', description: 'Serve the page', run_in_background: true })
  await $.tool.call({ tool: 'PowerShell', command: 'npx serve .', description: 'Serve the docs', run_in_background: true })
  await clock.advance(4000)
  await $.tool.call({ tool: 'TaskStop', task_id: 'bg-31' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The stopped one is grey and done; the other keeps running.
  expect(await ui.find({ type: 'Text', text: /^■$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^4s$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SPIN })).toBeDefined()
  await ui.unmount()
})

test('a TaskStop by the deprecated shell_id closes the shell; a failed one leaves it running', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) =>
    e.tool === 'TaskStop'
      ? e.shell_id === 'bg-41'
        ? { result: { message: 'Stopped', task_id: '', task_type: 'local_bash' } }
        : { isError: true, result: 'No task found', text: 'No task found' }
      : { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: (e as { description?: string }).description === 'First' ? 'bg-41' : 'bg-42' } },
  )
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'sleep 100', description: 'First', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'sleep 200', description: 'Second', run_in_background: true })
  await $.tool.call({ tool: 'TaskStop', shell_id: 'bg-41' })
  await $.tool.call({ tool: 'TaskStop', task_id: 'bg-42' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Text', text: /^■$/ })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Text', text: SPIN })).toHaveLength(1)
  await ui.unmount()
})

test('a task id read from the answer text is the one after "ID:", not the next word', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false },
    text: 'Started task running in background with ID: bg-88',
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'sleep 3', description: 'Wait a bit', run_in_background: true })
  await clock.advance(3000)
  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><task-id>bg-88</task-id><status>completed</status></task-notification>',
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^3s$/ })).toBeDefined()
  await ui.unmount()
})

test('a shell without a task id closes as the only one running', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'PowerShell',
    command: '.\\mvnw.cmd compile',
    description: 'Run Maven compile',
    run_in_background: true,
  })
  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><status>failed</status><summary>Background command finished</summary></task-notification>',
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✗$/ })).toBeDefined()
  await ui.unmount()
})

test('the notification row closes a shell by its tool_use_id', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let seenId: string | undefined
  on('tool.call', (_, e) => {
    seenId = e.tool_use_id

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({
    tool: 'Bash',
    tool_use_id: 'call-42',
    command: './mvnw compile',
    description: 'Run Maven compile',
    run_in_background: true,
  })

  const row = await $.ui.mount({
    plugin: 'agent-team',
    component: 'UserMessage',
    requestId: 'row-1',
    surface: 'desktop',
    props: {
      text: 'task done',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { toolUseId: seenId ?? 'call-42', status: 'completed', durationMs: 5000 },
    },
  })
  await row.unmount()
  await clock.advance(10)
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
  await ui.unmount()
})

test('a task notification row appended to the transcript closes the shell', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-5' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.append', (_, e, next) => next(e))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: './mvnw compile', description: 'Compile', run_in_background: true })
  await $.session.append({
    door: 'note',
    origin: { kind: 'task-notification' },
    uuid: 'u-1',
    message: {
      type: 'user',
      role: 'user',
      isMeta: true,
      content: [{ type: 'text', text: '<task-notification><task-id>bg-5</task-id><status>completed</status></task-notification>' }],
    },
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
  await ui.unmount()
})

test('a notice quoting one of two Maven shells closes only that one', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const cd = 'cd "C:\Users\me\projects\demo\backend"; '
  await $.tool.call({ tool: 'PowerShell', command: cd + '.\mvnw.cmd verify', description: 'Run Maven verify', run_in_background: true })
  await $.tool.call({ tool: 'PowerShell', command: cd + '.\mvnw.cmd compile', description: 'Run Maven compile', run_in_background: true })
  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: `<task-notification><status>completed</status><summary>Background command ${cd}.\mvnw.cmd compile finished</summary></task-notification>`,
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SPIN })).toBeDefined()
  await ui.unmount()
})

test('one notice arriving by two paths closes one shell, not the other', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let n = 0
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: `bg-${++n}` } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('session.append', (_, e, next) => next(e))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'PowerShell', command: 'cd back; .\mvnw.cmd verify', description: 'Run Maven verify', run_in_background: true })
  await $.tool.call({ tool: 'PowerShell', command: 'cd back; .\mvnw.cmd compile', description: 'Run Maven compile', run_in_background: true })
  const notice = '<task-notification><task-id>bg-2</task-id><status>completed</status></task-notification>'
  await $.session.receive({ origin: { kind: 'task-notification' }, text: notice })
  await $.session.append({
    door: 'note',
    origin: { kind: 'task-notification' },
    uuid: 'u-2',
    message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: notice }] },
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SPIN })).toBeDefined()
  await ui.unmount()
})

test('a notice naming an unknown task closes nothing', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'PowerShell', command: '.\mvnw.cmd verify', description: 'Run Maven verify', run_in_background: true })
  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><task-id>somebody-else</task-id><status>completed</status></task-notification>',
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: SPIN })).toBeDefined()
  await ui.unmount()
})

test("an agent's background shell shows its owner and closes from the agent's loop", async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on, { tab: 'jobs' })
  mock.env(on, SPANISH)
  on('command.register', () => ({ value: { command: 'agent-team' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'impl-1' }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-sub' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.receive', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn(spawnInput({ prompt: 'Build it', description: 'Implement the thing', subagentType: 'implementer' }))
  await $.tool.call({
    tool: 'PowerShell',
    command: '.\\mvnw.cmd test',
    description: 'Run the tests',
    run_in_background: true,
    agentId: 'impl-1',
  })

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // the owner shows in the mark's colour: the implementer's blue
  expect((await ui.find({ type: 'Text', text: SPIN }))?.props.color).toBe('#5b8def')
  expect(await ui.find({ type: 'Text', text: /^maven · build · test$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SPIN })).toBeDefined()
  await ui.unmount()

  await $.session.receive({
    origin: { kind: 'task-notification' },
    agentId: 'impl-1',
    text: '<task-notification><task-id>bg-sub</task-id><status>killed</status></task-notification>',
  })

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^■$/ })).toBeDefined()
  await ui.unmount()
})
