import { expect } from 'claude-code/testing'
import { test } from './support'
import type { Engine } from 'claude-code/testing'
import type { HttpResponse } from 'claude-code'

import { UPDATE_KEY, UPDATE_MS } from '../hooks/update'
import { AGENT_TEAM_COMMAND, MANIFEST_VERSION, PANE, boot, start } from './support'
import type { World } from './support'

const WINDOWS = { OS: 'Windows_NT' }
const STEPS = [
  ['claude', 'plugin', 'marketplace', 'update', 'agent-team-kit'],
  ['claude', 'plugin', 'update', 'agent-team@agent-team-kit'],
]
const PAGE = 'https://github.com/Dalibex/agent-team-kit/releases/tag/v9.9.0'
const RELOAD = { name: 'reload-plugins', description: 'Reload plugins', source: 'builtin' }

const release = (tag: string): HttpResponse => ({
  status: 200,
  ok: true,
  headers: {},
  text: JSON.stringify({ tag_name: tag, html_url: `https://github.com/Dalibex/agent-team-kit/releases/tag/${tag}`, name: tag }),
})

const run = async ($: Engine, args: string, origin: { kind: string; name?: string } = { kind: 'composer' }): Promise<string> =>
  String((await $.command.run({ ...AGENT_TEAM_COMMAND, args, origin } as never)).text)

/** A session whose GitHub has `tag` as its latest release. */
const withRelease = (world: World, tag: string): void => {
  world.http = () => release(tag)
}

/** The first 3 seconds after the start, when the daily check runs. */
const afterStart = async (world: World): Promise<void> => {
  await world.clock.advance(3500)
  await world.clock.settle()
}

// ------------------------------------------------------------ nothing to install

for (const [what, tag] of [
  ['the same version', `v${MANIFEST_VERSION}`],
  ['an older one', 'v0.8.0'],
] as const) {
  test(`with ${what} as the latest release it says so and runs nothing`, async ($, on) => {
    const world = boot(on)
    withRelease(world, tag)
    await start($)

    expect(await run($, 'update')).toBe(`Ya tienes la última versión de agent-team (${MANIFEST_VERSION}).`)
    expect(world.fetched).toHaveLength(1)
    expect(world.runs).toEqual([])
  })
}

test('with GitHub down it says it could not ask and runs nothing', async ($, on) => {
  const world = boot(on)
  await start($)

  expect(await run($, 'update')).toBe('No se pudo consultar a GitHub la última versión; inténtalo más tarde.')
  expect(world.runs).toEqual([])
})

for (const [what, answer] of [
  ['an error status', { status: 500, ok: false, headers: {}, text: 'oops' }],
  ['a body that is not JSON', { status: 200, ok: true, headers: {}, text: '<html></html>' }],
] as const) {
  test(`${what} from GitHub is no answer either`, async ($, on) => {
    const world = boot(on)
    world.http = () => answer
    await start($)

    expect(await run($, 'update')).toMatch(/^No se pudo consultar a GitHub/)
    expect(world.runs).toEqual([])
  })
}

test('in English the answers are English', { options: { language: 'en' } }, async ($, on) => {
  const world = boot(on)
  withRelease(world, `v${MANIFEST_VERSION}`)
  await start($)

  expect(await run($, 'update')).toBe(`You already have the latest agent-team (${MANIFEST_VERSION}).`)
})

// ------------------------------------------------------------ a newer release

test('a newer release runs the marketplace update and then the plugin update, each with a timeout', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  await start($)

  const text = await run($, 'update')
  await world.clock.settle()

  expect(world.runs.map(r => r.argv)).toEqual(STEPS)
  for (const r of world.runs) expect(r.init?.timeoutMs).toBeGreaterThan(0)
  expect(text).toBe('agent-team actualizado: ejecuta /reload-plugins para cargarlo.')
})

test('the answer is the same whatever the case or the spacing of the argument', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  await start($)

  expect(await run($, '  UPDATE ')).toMatch(/^agent-team actualizado/)
  expect(world.runs.map(r => r.argv)).toEqual(STEPS)
})

test('the ask skips the daily cache and refreshes the record', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  await start($)
  const before = world.clock.now()
  // a record made a minute ago, well inside the day, that says the kit is up to date
  world.stored[UPDATE_KEY] = { at: before - 60_000, version: MANIFEST_VERSION, url: 'u' }

  await run($, 'update')

  expect(world.fetched).toHaveLength(1)
  const record = world.stored[UPDATE_KEY] as { at: number; version: string; url: string }
  expect(record.version).toBe('9.9.0')
  expect(record.url).toBe(PAGE)
  expect(record.at).toBeGreaterThanOrEqual(before)
  expect(record.at).toBeLessThan(before + UPDATE_MS)
})

test('an update that finds nothing newer still records the ask and the release', async ($, on) => {
  const world = boot(on)
  withRelease(world, `v${MANIFEST_VERSION}`)
  await start($)
  const before = world.clock.now()
  world.stored[UPDATE_KEY] = { at: before - 60_000 }

  await run($, 'update')

  expect(world.stored[UPDATE_KEY]).toMatchObject({ version: MANIFEST_VERSION, at: expect.any(Number) })
  expect((world.stored[UPDATE_KEY] as { at: number }).at).toBeGreaterThanOrEqual(before)
})

test('after an update the strip no longer offers the release it installed', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Link', label: /9\.9\.0 disponible/ })).toBeDefined()
  await ui.unmount()

  await run($, 'update')

  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await after.find({ type: 'Link', label: /9\.9\.0 disponible/ })).toBeUndefined()
  await after.unmount()
})

// ------------------------------------------------------------ the reload

test('with reload-plugins listed the answer says the plugins reload', async ($, on) => {
  const world = boot(on)
  world.commands = [RELOAD] as never
  withRelease(world, 'v9.9.0')
  await start($)

  expect(await run($, 'update')).toBe('agent-team actualizado; recargando los plugins.')
})

test('the button runs reload-plugins when it is listed', async ($, on) => {
  const world = boot(on)
  let reloads = 0
  on('command.run', { command: 'reload-plugins' }, () => {
    reloads += 1

    return { text: '' }
  })
  world.commands = [RELOAD] as never
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'update-now' })
  await ui.unmount()
  await world.clock.advance(1000)
  await world.clock.settle()

  expect(world.toasts).toContain('agent-team actualizado; recargando los plugins.')
  expect(reloads).toBe(1)
})

test('with reload-plugins not listed nothing is reloaded and the answer says to run it', async ($, on) => {
  const world = boot(on)
  let reloads = 0
  on('command.run', { command: 'reload-plugins' }, () => {
    reloads += 1

    return { text: '' }
  })
  world.commands = [{ name: 'code-review', description: 'Reviews', source: 'user' }] as never
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'update-now' })
  await ui.unmount()
  await world.clock.advance(1000)
  await world.clock.settle()

  expect(world.toasts).toContain('agent-team actualizado: ejecuta /reload-plugins para cargarlo.')
  expect(reloads).toBe(0)
})

test('a reload that fails does not turn the update into a failure', async ($, on) => {
  const world = boot(on)
  on('command.run', { command: 'reload-plugins' }, () => {
    throw new Error('not now')
  })
  world.commands = [RELOAD] as never
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'update-now' })
  await ui.unmount()
  await world.clock.advance(1000)
  await world.clock.settle()

  expect(world.toasts).toContain('agent-team actualizado; recargando los plugins.')
})

/** What the desktop strip shows of the update once the press and its reload have run. */
const stripAfterPress = async ($: Engine, world: World): Promise<{ hint: boolean; button: boolean }> => {
  const press = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await press.press({ key: 'update-now' })
  await press.unmount()
  await world.clock.advance(1000)
  await world.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const hint = (await ui.find({ type: 'Text', text: /^agent-team actualizado: ejecuta \/reload-plugins para cargarlo\.$/ })) !== undefined
  const button = (await ui.find({ type: 'Button', key: 'update-now' })) !== undefined
  await ui.unmount()

  return { hint, button }
}

test('after a refused reload the strip asks for /reload-plugins and offers no update button', async ($, on) => {
  const world = boot(on)
  on('command.run', { command: 'reload-plugins' }, () => {
    throw new Error('not now')
  })
  world.commands = [RELOAD] as never
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)

  expect(await stripAfterPress($, world)).toEqual({ hint: true, button: false })
})

test('in a session without reload-plugins the strip asks for /reload-plugins and offers no update button', async ($, on) => {
  const world = boot(on)
  world.commands = [{ name: 'code-review', description: 'Reviews', source: 'user' }] as never
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)

  expect(await stripAfterPress($, world)).toEqual({ hint: true, button: false })
})

// ------------------------------------------------------------ a step that fails

test('a first step that exits non-zero stops the update before the second and names its error line', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  world.commands = [RELOAD] as never
  let reloads = 0
  on('command.run', { command: 'reload-plugins' }, () => {
    reloads += 1

    return { text: '' }
  })
  world.onRun = () => ({ exitCode: 1, stdout: 'ignored', stderr: '\n  marketplace not found  \nmore detail', })
  await start($)

  expect(await run($, 'update')).toBe('La actualización se detuvo en `claude plugin marketplace update agent-team-kit`: marketplace not found')
  await world.clock.settle()
  expect(world.runs.map(r => r.argv)).toEqual([STEPS[0]])
  expect(reloads).toBe(0)
})

test('a failing second step names itself, and a failure with no text says the exit code', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  world.onRun = argv => (argv[2] === 'update' ? { exitCode: 3, stdout: '', stderr: '' } : undefined)
  await start($)

  expect(await run($, 'update')).toBe('La actualización se detuvo en `claude plugin update agent-team@agent-team-kit`: código de salida 3')
  expect(world.runs.map(r => r.argv)).toEqual(STEPS)
})

test('with no error output the first line of the standard output is the reason', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  world.onRun = () => ({ exitCode: 2, stdout: 'plugin is locked\nsecond line', stderr: '' })
  await start($)

  expect(await run($, 'update')).toMatch(/: plugin is locked$/)
})

test('off Windows a claude that cannot start fails at once, with no second try', async ($, on) => {
  const world = boot(on, { env: {} })
  withRelease(world, 'v9.9.0')
  world.onRun = () => {
    throw new Error('spawn claude ENOENT')
  }
  await start($)

  expect(await run($, 'update')).toMatch(/^La actualización se detuvo en `claude plugin marketplace update agent-team-kit`: \S/)
  expect(world.runs.map(r => r.argv)).toEqual([STEPS[0]])
})

test('on Windows a claude that cannot start by name is tried through cmd.exe, for each step', async ($, on) => {
  const world = boot(on, { env: WINDOWS })
  withRelease(world, 'v9.9.0')
  world.onRun = argv => {
    if (argv[0] === 'claude') throw new Error('spawn claude ENOENT')

    return undefined
  }
  await start($)

  expect(await run($, 'update')).toMatch(/^agent-team actualizado/)
  const via = (rest: string[]) => ['cmd.exe', '/d', '/s', '/c', ...rest]
  expect(world.runs.map(r => r.argv)).toEqual([STEPS[0], via(STEPS[0] ?? []), STEPS[1], via(STEPS[1] ?? [])])
})

test('on Windows a start that fails twice reports the second failure', async ($, on) => {
  const world = boot(on, { env: WINDOWS })
  withRelease(world, 'v9.9.0')
  world.onRun = argv => {
    throw new Error(argv[0] === 'cmd.exe' ? 'cmd.exe is missing' : 'spawn claude ENOENT')
  }
  await start($)

  expect(await run($, 'update')).toMatch(/^La actualización se detuvo en `claude plugin marketplace update agent-team-kit`: \S/)
  expect(world.runs).toHaveLength(2)
})

test('on Windows a step that times out is not tried again through cmd.exe', async ($, on) => {
  const world = boot(on, { env: WINDOWS })
  withRelease(world, 'v9.9.0')
  world.onRun = async () => {
    await world.clock.advance(2 * 60 * 1000)
    throw new Error('timed out')
  }
  await start($)

  expect(await run($, 'update')).toMatch(/^La actualización se detuvo en `claude plugin marketplace update agent-team-kit`: \S/)
  expect(world.runs.map(r => r.argv)).toEqual([STEPS[0]])
})

// ------------------------------------------------------------ who may ask, and how often

for (const origin of [{ kind: 'plugin', name: 'other' }, { kind: 'task-notification' }, { kind: 'schedule' }]) {
  test(`/agent-team update from a ${origin.kind} origin is refused: GitHub is not asked, nothing runs`, async ($, on) => {
    const world = boot(on)
    withRelease(world, 'v9.9.0')
    await start($)

    expect(await run($, 'update', origin)).toContain('que escribas tú')
    expect(world.fetched).toEqual([])
    expect(world.runs).toEqual([])
  })
}

for (const kind of ['composer', 'bridge', 'sdk']) {
  test(`/agent-team update typed from a ${kind} origin goes ahead`, async ($, on) => {
    const world = boot(on)
    withRelease(world, 'v9.9.0')
    await start($)

    expect(await run($, 'update', { kind })).toMatch(/^agent-team actualizado/)
  })
}

test('"update" with other words after it is not the update command', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  await start($)

  await run($, 'update now')
  expect(world.fetched).toEqual([])
  expect(world.runs).toEqual([])
})

test('a second update asked while one runs does not run again, and the first one finishes', async ($, on) => {
  const world = boot(on)
  let release9: (answer: HttpResponse) => void = () => undefined
  world.http = () => new Promise<HttpResponse>(resolve => {
    release9 = resolve
  })
  await start($)

  const first = run($, 'update')
  await world.clock.settle()
  expect(await run($, 'update')).toBe('Ya hay una actualización en marcha.')
  expect(world.fetched).toHaveLength(1)

  release9(release('v9.9.0'))
  expect(await first).toMatch(/^agent-team actualizado/)
  expect(world.runs.map(r => r.argv)).toEqual(STEPS)

  // once finished it is no longer running, but it installed and waits for a reload: asking again says so and runs nothing
  withRelease(world, 'v9.9.0')
  expect(await run($, 'update')).toBe('agent-team actualizado: ejecuta /reload-plugins para cargarlo.')
  expect(world.runs).toHaveLength(2)
})

test('an update that failed does not leave the next one blocked', async ($, on) => {
  const world = boot(on)
  await start($)
  expect(await run($, 'update')).toMatch(/^No se pudo consultar/)

  withRelease(world, 'v9.9.0')
  expect(await run($, 'update')).toMatch(/^agent-team actualizado/)
})

// ------------------------------------------------------------ the pane's button

test('the strip offers "Actualizar ahora" with a newer release and the press runs the update and toasts its outcome', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const button = await ui.find({ type: 'Button', key: 'update-now' })
  expect(button?.props.label).toBe('Actualizar ahora')
  await ui.press({ key: 'update-now' })
  await ui.unmount()
  await world.clock.settle()

  expect(world.runs.map(r => r.argv)).toEqual(STEPS)
  expect(world.toasts).toContain('agent-team actualizado: ejecuta /reload-plugins para cargarlo.')
})

test('without a newer release the strip has no update button', async ($, on) => {
  const world = boot(on)
  withRelease(world, `v${MANIFEST_VERSION}`)
  await start($)
  await afterStart(world)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'update-now' })).toBeUndefined()
  await ui.unmount()
})

test('while an update runs the button gives way to "Actualizando…" and a press does nothing', async ($, on) => {
  const world = boot(on)
  withRelease(world, 'v9.9.0')
  await start($)
  await afterStart(world)
  // the next ask (the update's own) is held
  let letGo: (answer: HttpResponse) => void = () => undefined
  world.http = () => new Promise<HttpResponse>(resolve => {
    letGo = resolve
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'update-now' })
  await ui.unmount()
  await world.clock.settle()
  const busy = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await busy.find({ type: 'Button', key: 'update-now' })).toBeUndefined()
  expect(await busy.find({ type: 'Text', text: 'Actualizando…' })).toBeDefined()
  await busy.unmount()
  expect(world.fetched).toHaveLength(2)

  letGo(release('v9.9.0'))
  await world.clock.settle()
  expect(world.runs.map(r => r.argv)).toEqual(STEPS)
})
