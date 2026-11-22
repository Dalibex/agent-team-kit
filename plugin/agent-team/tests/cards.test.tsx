import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { EngineInterface, SessionMeasureInput } from 'claude-code'

import { ciPollMs, NO_GIT, readGit } from '../hooks/github'
import { boot, drawing, finish, onTab, PANE, SURFACES, shows, spawn, start } from './support'
import type { World } from './support'

const HOUR = 60 * 60 * 1000
/** A running job's mark: the spinner, one frame per tick. */
const SPIN = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/

/** A measurement as the engine pushes it: the five-hour window at `percent`. */
const measure = (
  $: Engine,
  world: World,
  percent: number,
  more: Partial<SessionMeasureInput> = {},
): Promise<unknown> => {
  const at = world.clock.now()

  return $.session.measure({
    context: { window: 200_000, tokens: 62_000, percent: 31 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: percent, resetsAt: new Date(at + 2 * HOUR + 13 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 18 },
    ],
    cost: { usd: 1.5 },
    changed: ['rateLimits', 'context', 'cost'],
    ...more,
  })
}

// ----------------------------------------------------------- usage column

test('a measurement draws the usage column beside the team, with no cost', async ($, on) => {
  const world = boot(on)
  await start($)
  await measure($, world, 42)

  const svg = await drawing($)
  expect(svg).toMatch(/Ventana 5 h: 42% usado\. Se reinicia: (\w{3} )?\d\d:\d\d\./)
  expect(svg).toMatch(/reinicia (\w{3} )?\d\d:\d\d</)
  expect(svg).toContain('Semana: 18% usado.')
  expect(svg).toContain('Contexto: 62k tokens de 200k (31%).')
  expect(svg).toContain('contexto de la sesión')
  expect(svg).not.toMatch(/[Cc]oste/)
  // wide and low, so it fills the pane's width
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg) ?? []
  expect(Number(w) / Number(h)).toBeGreaterThan(2.8)
  // on the desktop the figures live in the drawing, not in the strip
  expect(await shows($, 'desktop', /^5h 42%$/)).toBe(false)
})

test('the terminal, with no drawing, carries the figures in its strip', async ($, on) => {
  const world = boot(on)
  await start($)
  await measure($, world, 42)

  expect(await shows($, 'terminal', /^5h 42%$/)).toBe(true)
  expect(await shows($, 'terminal', /^7d 18%$/)).toBe(true)
  expect(await shows($, 'terminal', /^ctx 62k\/200k$/)).toBe(true)
  expect(await shows($, 'terminal', /\$/)).toBe(false)
})

test('a rising five-hour window projects when it fills, in the drawing and on the terminal', async ($, on) => {
  const world = boot(on)
  await start($)
  const at = world.clock.now()
  const resetsAt = new Date(at + 4.5 * HOUR).toISOString()
  for (const [percent, after] of [
    [20, 0],
    [30, 0.5 * HOUR],
    [40, 0.5 * HOUR],
  ] as const) {
    await world.clock.advance(after)
    await measure($, world, percent, { rateLimits: [{ kind: 'five_hour', percentUsed: percent, resetsAt }] })
  }

  const svg = await drawing($)
  // 20 points an hour from 40 %: full three hours after the last reading
  expect(svg).toMatch(/↗ 100% a las (\w{3} )?\d\d:\d\d</)
  // the projection is words only: no trend graph under the bar
  expect(svg).not.toContain('<polyline')
  expect(svg).toMatch(/A este ritmo llega al 100% a las/)
  expect(await shows($, 'terminal', /^5h al 100% a las (\w{3} )?\d\d:\d\d$/)).toBe(true)
})

test('a window that would not fill before its reset projects nothing', async ($, on) => {
  const world = boot(on)
  await start($)
  const resetsAt = new Date(world.clock.now() + HOUR).toISOString()
  await measure($, world, 20, { rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt }] })
  await world.clock.advance(0.5 * HOUR)
  await measure($, world, 22, { rateLimits: [{ kind: 'five_hour', percentUsed: 22, resetsAt }] })
  expect(await drawing($)).not.toContain('↗')
})

test('past 80 % of the context a button compacts the conversation', async ($, on) => {
  const world = boot(on)
  await start($)
  await measure($, world, 10)
  expect(await shows($, 'desktop', /Compactar/, 'Button')).toBe(false)

  await measure($, world, 10, { context: { window: 200_000, tokens: 170_000, percent: 85 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', text: /^Compactar contexto \(85%\)$/ })).toBeDefined()
  await ui.press({ key: 'compact' })
  await ui.unmount()
  expect(world.compactions).toBe(1)
  expect(world.toasts).toContain('No se compactó: probado desde el test')
})

test('a 1M context window reads as such', async ($, on) => {
  const world = boot(on)
  await start($)
  await measure($, world, 10, { context: { window: 1_000_000, tokens: 30_000, percent: 3 } })

  expect(await shows($, 'terminal', /^ctx 30k\/1M$/)).toBe(true)
  expect(await drawing($)).toContain('Contexto: 30k tokens de 1M (3%).')
})

test('before any measurement the band waits with dashes', async ($, on) => {
  boot(on)
  await start($)
  expect(await drawing($)).toContain('Las cifras llegan con la primera respuesta del modelo.')
  expect(await shows($, 'terminal', /^Sin cifras todavía$/)).toBe(true)
})

test('crossing 80 % and then 95 % toasts once each', async ($, on) => {
  const world = boot(on)
  await start($)
  await measure($, world, 70)
  expect(world.toasts).toEqual([])
  await measure($, world, 82)
  await measure($, world, 84)
  expect(world.toasts).toHaveLength(1)
  expect(world.toasts[0]).toMatch(/^⚠ Ventana 5 h al 82%: se reinicia en/)
  await measure($, world, 96)
  expect(world.toasts).toHaveLength(2)
  expect(world.toasts[1]).toMatch(/al 96%/)
})

test('a window past 95 % blinks in the drawing', async ($, on) => {
  const world = boot(on)
  await start($)
  await measure($, world, 50)
  expect(await drawing($)).not.toContain('values="1;0.45;1"')
  await measure($, world, 97)
  expect(await drawing($)).toContain('values="1;0.45;1"')
})

// ------------------------------------------------------------------- jobs

test('a foreground npm install is one line: what it is, its mark and its time', async ($, on) => {
  const world = boot(on)
  await start($)
  world.toolResult = () => ({
    result: { stdout: 'added 312 packages in 8s', stderr: '', interrupted: false },
  })
  await $.tool.call({ tool: 'Bash', command: 'npm install express zod', description: 'Install the API deps' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^npm · instalación · express, zod$/)).toBe(true)
    expect(await shows($, surface, /^✓$/)).toBe(true)
    expect(await shows($, surface, /^0s$/)).toBe(true)
    // no command, no description, no output: the main thing only
    expect(await shows($, surface, /Install the API deps|312/)).toBe(false)
  }
})

test('a build whose output says BUILD FAILURE fails, even when it exited 0', async ($, on) => {
  const world = boot(on)
  await start($)
  world.toolResult = () => ({
    result: { stdout: '[INFO] BUILD FAILURE\n[ERROR] Failed to execute goal compiler', stderr: '', interrupted: false },
  })
  await $.tool.call({ tool: 'Bash', command: './mvnw -q verify' })

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^maven · build · verify$/)).toBe(true)
    expect(await shows($, surface, /^✗$/)).toBe(true)
  }
})

test('a build an agent runs gets its row too', async ($, on) => {
  const world = boot(on)
  await start($)
  await $.agent.spawn({
    tool_use_id: 'impl-1',
    subagentType: 'implementer',
    prompt: 'build it',
    description: 'Build it',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })
  world.toolResult = () => ({ result: { stdout: 'BUILD SUCCESS', stderr: '', interrupted: false } })
  await $.tool.call({ tool: 'Bash', command: 'mvn package', agentId: 'impl-1' })

  expect(await shows($, 'desktop', /^maven · build · package$/)).toBe(true)
  expect(await shows($, 'desktop', /^✓$/)).toBe(true)
})

test('ordinary shell calls make no job row', async ($, on) => {
  boot(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(await shows($, 'desktop', /^Nada en marcha\.$/)).toBe(true)
})

test('a background install shows the percentage its output file prints while it runs', async ($, on) => {
  const world = boot(on)
  await start($)
  await onTab($, 'jobs')
  const path = 'C:\\tmp\\tasks\\b1.output'
  world.toolResult = () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' },
    text: `Command running in background with ID: b1. Output is being written to: ${path}. You will be notified when it completes`,
  })
  world.files[path] = 'Collecting torch\nDownloading torch (2.1 GB)\r 45%'
  await $.tool.call({ tool: 'Bash', command: 'pip install torch', description: 'Install torch', run_in_background: true })
  await world.clock.advance(2000)

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^pip · instalación · torch$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SPIN })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^45%$/ })).toBeDefined()
  await ui.unmount()

  await $.session.receive({
    origin: { kind: 'task-notification' },
    text: '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>',
  })

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^✓$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^45%$/ })).toBeUndefined()
  await ui.unmount()
})

// ----------------------------------------------------------------- github

const inRepo = (world: World, pr?: object) => {
  world.gitAnswers['git status'] = {
    exitCode: 0,
    stdout: '# branch.head feat/x\n# branch.ab +2 -0\n1 .M N... a.ts\n',
    stderr: '',
  }
  world.gitAnswers['git remote'] = { exitCode: 0, stdout: 'https://github.com/acme/demo.git\n', stderr: '' }
  world.gitAnswers['gh pr'] = {
    exitCode: 0,
    stdout: JSON.stringify({ ...(pr === undefined ? {} : { currentBranch: pr }), createdBy: [{}], needsReview: [{}, {}] }),
    stderr: '',
  }
  world.gitAnswers['gh run'] = { exitCode: 0, stdout: '[]', stderr: '' }
}

const PR = {
  number: 42,
  title: 'Add incident filters',
  url: 'https://github.com/acme/demo/pull/42',
  isDraft: false,
  reviewDecision: 'APPROVED',
  statusCheckRollup: [
    { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { name: 'e2e', status: 'IN_PROGRESS', conclusion: '' },
  ],
}

test('the GitHub card shows the branch, the PR and its checks', async ($, on) => {
  const world = boot(on)
  inRepo(world, PR)
  await start($)
  await world.clock.advance(1600)

  for (const surface of SURFACES) {
    expect(await shows($, surface, /^⎇ feat\/x$/)).toBe(true)
    expect(await shows($, surface, /^↑2 ↓0$/)).toBe(true)
    expect(await shows($, surface, /^1 sin commit$/)).toBe(true)
    expect(await shows($, surface, /^Add incident filters$/)).toBe(true)
    expect(await shows($, surface, /^✓ 2$/)).toBe(true)
    expect(await shows($, surface, /^● 1$/)).toBe(true)
    expect(await shows($, surface, /^aprobada$/)).toBe(true)
    expect(await shows($, surface, /^Te piden revisión en 2 PR$/, 'Link')).toBe(true)
    expect(await shows($, surface, /^tienes 1 PR abierta$/, 'Link')).toBe(true)
    expect(await shows($, surface, /^CI ●$/)).toBe(true)
    expect(await shows($, surface, /^⎇ feat\/x ↑2$/)).toBe(true)
  }
  expect(world.gitRuns).toContain('gh pr status --json number,title,url,isDraft,reviewDecision,statusCheckRollup,state')
})

/** The address of the Link labelled `label` on the desktop, if it is drawn. */
const linkTo = async ($: Engine, label: RegExp): Promise<string | undefined> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const link = await ui.find({ type: 'Link', text: label })
  await ui.unmount()

  return link === undefined ? undefined : String(link.props.href)
}

test('the GitHub card links to the repo, the branch, issues, PRs and Actions', async ($, on) => {
  const world = boot(on)
  inRepo(world, PR)
  await start($)
  await onTab($, 'github')
  await world.clock.advance(1600)

  expect(await linkTo($, /^Repo$/)).toBe('https://github.com/acme/demo')
  expect(await linkTo($, /^Rama$/)).toBe('https://github.com/acme/demo/tree/feat/x')
  expect(await linkTo($, /^Issues$/)).toBe('https://github.com/acme/demo/issues')
  expect(await linkTo($, /^PRs$/)).toBe('https://github.com/acme/demo/pulls')
  expect(await linkTo($, /^Actions$/)).toBe('https://github.com/acme/demo/actions')
  expect(await linkTo($, /^Te piden revisión/)).toBe('https://github.com/pulls/review-requested')
  // the branch has its PR: nothing to create
  expect(await linkTo($, /^Crear PR$/)).toBeUndefined()
})

test('a branch without a PR offers to create one; the default branch does not', async ($, on) => {
  const world = boot(on)
  inRepo(world)
  await start($)
  await onTab($, 'github')
  await world.clock.advance(1600)
  expect(await linkTo($, /^Crear PR$/)).toBe('https://github.com/acme/demo/compare/feat/x?expand=1')

  world.gitAnswers['git status'] = { exitCode: 0, stdout: '# branch.head main\n# branch.ab +0 -0\n', stderr: '' }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'git-refresh' })
  await ui.unmount()
  expect(await linkTo($, /^Crear PR$/)).toBeUndefined()
})

test('outside a repository the card says so and gh is never asked', async ($, on) => {
  const world = boot(on)
  await start($)
  await world.clock.advance(1600)
  expect(await shows($, 'desktop', /^Esta carpeta no es un repositorio git\.$/)).toBe(true)
  expect(world.gitRuns.some(run => run.startsWith('gh'))).toBe(false)
})

test('while a check runs, GitHub is asked again after two minutes, not before', async ($, on) => {
  const world = boot(on)
  inRepo(world, PR)
  await start($)
  await world.clock.advance(1600)
  const asked = () => world.gitRuns.filter(run => run.startsWith('gh pr')).length
  expect(asked()).toBe(1)
  await world.clock.advance(60_000)
  expect(asked()).toBe(1)
  await world.clock.advance(61_000)
  expect(asked()).toBe(2)
})

test('the refresh button asks GitHub again', async ($, on) => {
  const world = boot(on)
  inRepo(world)
  await start($)
  await onTab($, 'github')
  await world.clock.advance(1600)
  const before = world.gitRuns.filter(run => run.startsWith('gh pr')).length
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'git-refresh' })
  await ui.unmount()
  expect(world.gitRuns.filter(run => run.startsWith('gh pr')).length).toBe(before + 1)
})

test('a push Claude makes is listed and makes the card read GitHub again', async ($, on) => {
  const world = boot(on)
  inRepo(world)
  await start($)
  await world.clock.advance(1600)
  const before = world.gitRuns.filter(run => run.startsWith('gh pr')).length
  world.toolResult = () => ({
    result: { stdout: '', stderr: '', interrupted: false, gitOperation: { push: { branch: 'feat/x' } } },
  })
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await world.clock.advance(3000)

  expect(await shows($, 'desktop', /Claude: push a feat\/x$/)).toBe(true)
  expect(world.gitRuns.filter(run => run.startsWith('gh pr')).length).toBe(before + 1)
})

// ------------------------------------------------------------------ cards

test('one tab shows at a time; a press on another shows that one', async ($, on) => {
  boot(on)
  await start($)

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'tab-team' }))?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Text', text: /^○ Claude$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'pack-btn-0' })).toBeUndefined()
  await ui.press({ key: 'tab-skills' })
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'tab-skills' }))?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Text', text: /^○ Claude$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'pack-btn-0' })).toBeDefined()
  await ui.unmount()
})

test('the tab shown is kept in the store and a new session opens on it', async ($, on) => {
  const world = boot(on, { store: { tab: 'github' } })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Button', key: 'tab-github' }))?.props.variant).toBe('primary')
  await ui.press({ key: 'tab-jobs' })
  await ui.unmount()
  expect(world.stored.tab).toBe('jobs')
})

test('a stored tab the pane does not know opens the team', async ($, on) => {
  boot(on, { store: { tab: 'nope', folded: ['team'] } })
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'tab-team' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

test('a hidden tab with news says so on its button', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'tab-team' }))?.props.label).toBe('Equipo ●1')
  expect((await ui.find({ type: 'Button', key: 'tab-jobs' }))?.props.label).toBe('Procesos')
  await ui.unmount()
})

test('the team never says it sleeps: Claude idles on its own row', async ($, on) => {
  boot(on)
  await start($)
  expect(await shows($, 'desktop', /El equipo duerme/)).toBe(false)
  expect(await shows($, 'desktop', /^en reposo$/)).toBe(true)
})

// ---------------------------------------------------------------- notices

test('CI that finishes while the pane watches it toasts and chimes once', async ($, on) => {
  const world = boot(on)
  inRepo(world, PR)
  await start($)
  await world.clock.advance(1600)
  expect(world.toasts.filter(text => text.startsWith('CI'))).toEqual([])

  inRepo(world, {
    ...PR,
    statusCheckRollup: PR.statusCheckRollup.map(check => ({ ...check, status: 'COMPLETED', conclusion: 'SUCCESS' })),
  })
  await world.clock.advance(121_000)
  expect(world.toasts.filter(text => text.startsWith('CI'))).toEqual(['CI ✓ en #42: 3 checks en verde'])
  expect(world.clips).toContain('sounds/main.wav')

  await world.clock.advance(121_000)
  expect(world.toasts.filter(text => text.startsWith('CI'))).toHaveLength(1)
})

test('a build that runs past 30 s raises a system notification when it ends; a short one does not', async ($, on) => {
  const world = boot(on)
  await start($)
  world.toolResult = () => ({ result: { stdout: 'BUILD SUCCESS', stderr: '', interrupted: false } })
  await $.tool.call({ tool: 'Bash', command: 'mvn verify' })
  expect(world.notified).toEqual([])

  world.toolResult = async () => {
    await world.clock.advance(31_000)

    return { result: { stdout: '[INFO] BUILD FAILURE', stderr: '', interrupted: false } }
  }
  await $.tool.call({ tool: 'Bash', command: 'mvn verify' })
  expect(world.notified).toEqual(['maven · build falló tras 31s'])
})

test('an agent that works past 30 s raises a system notification when it ends', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await world.clock.advance(65_000)
  await finish($, 'a1')
  expect(world.notified).toEqual(['explorer terminó tras 1m 5s: Job a1'])
})

// ------------------------------------------------------------ regressions

test('a foreground job that lost its end is stopped when its turn ends, not left spinning', async ($, on) => {
  const world = boot(on)
  await start($)
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  world.toolResult = async () => {
    await gate

    return { result: { stdout: 'added 1 package', stderr: '', interrupted: false } }
  }
  const call = $.tool.call({ tool: 'Bash', command: 'npm install left-pad' })
  // the call is not awaited: wait until the hook has registered the job
  for (let tries = 0; tries < 50 && !(await shows($, 'desktop', /^npm · instalación · left-pad$/)); tries += 1) {
    await world.clock.advance(1)
  }
  expect(await shows($, 'desktop', SPIN)).toBe(true)

  await finish($, undefined)
  expect(await shows($, 'desktop', SPIN)).toBe(false)
  expect(await shows($, 'desktop', /^■$/)).toBe(true)

  // its late answer does not reopen it
  release()
  await call
  expect(await shows($, 'desktop', /^■$/)).toBe(true)
})

test('a new session picks up the five-hour trail from the store and projects from it', async ($, on) => {
  const now = Date.now()
  const resetsAt = now + 4.5 * HOUR
  const world = boot(on, {
    store: {
      trail5h: {
        resetsAt,
        points: [
          [now - HOUR, 20],
          [now - 0.5 * HOUR, 30],
        ],
      },
    },
  })
  await world.clock.advance(now - world.clock.now())
  await start($)
  await measure($, world, 40, {
    rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: new Date(resetsAt).toISOString() }],
  })
  expect(await drawing($)).toMatch(/↗ 100% a las/)
})

// ------------------------------------------------------------ v0.7

test('a red check links straight to its log', async ($, on) => {
  const world = boot(on)
  inRepo(world, {
    ...PR,
    statusCheckRollup: [
      { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
      {
        name: 'test',
        status: 'COMPLETED',
        conclusion: 'FAILURE',
        detailsUrl: 'https://github.com/acme/demo/actions/runs/1/job/2',
      },
    ],
  })
  await start($)
  await onTab($, 'github')
  await world.clock.advance(1600)

  expect(await shows($, 'desktop', /^✗ test$/)).toBe(true)
  expect(await linkTo($, /^ver qué falló$/)).toBe('https://github.com/acme/demo/actions/runs/1/job/2')
})

test('green checks offer no failure link', async ($, on) => {
  const world = boot(on)
  inRepo(world, PR)
  await start($)
  await world.clock.advance(1600)
  expect(await linkTo($, /^ver qué falló$/)).toBeUndefined()
})

test('an API failure that ends the turn shows its kind on Claude’s row until the next turn', async ($, on) => {
  boot(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.classic.StopFailure({ error: 'overloaded' } as never)
  await finish($, undefined, 'error')
  expect(await shows($, 'desktop', /^⚠ la API cortó el turno: servidores saturados, prueba en un rato$/)).toBe(true)

  await $.turn.start({ text: 'again', turnId: 't2' })
  expect(await shows($, 'desktop', /la API cortó el turno/)).toBe(false)
})

test('each card is titled in the drawing’s neon pixel letters, and in words on the terminal', async ($, on) => {
  boot(on)
  await start($)
  const titles: unknown[] = []
  for (const id of ['team', 'skills', 'jobs', 'github'] as const) {
    await onTab($, id)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const images = await ui.findAll({ type: 'Svg' })
    // the team drawing, then the shown card's plate
    expect(images).toHaveLength(2)
    titles.push(images[1]?.props.alt)
    // every image is plain, the drawing too: an interactive frame would keep the wheel and stop the pane scrolling
    expect(images.filter(svg => svg.props.isInteractive === true)).toHaveLength(0)
    expect(String(images[1]?.props.source)).toContain('<rect')
    await ui.unmount()
  }
  expect(titles).toEqual(['Equipo', 'Skills', 'Instalaciones y procesos', 'GitHub'])
  await onTab($, 'team')

  expect(await shows($, 'terminal', /^Equipo$/)).toBe(true)
  expect(await shows($, 'desktop', /^Equipo$/)).toBe(false)
})

test('resting the pointer on the drawing shows what each gauge means', async ($, on) => {
  boot(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const card = (await ui.findAll({ type: 'Box' })).find(box => box.props.display === 'none' && box.props.position === 'absolute')
  expect(card).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Las cifras llegan con la primera respuesta del modelo\.$/ })).toBeDefined()
  await ui.unmount()
})

// ------------------------------------------------------------ v0.8.7: audit

/** The label of the Button keyed `key` on the desktop, if it is drawn. */
const labelOf = async ($: Engine, key: string): Promise<string | undefined> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const found = await ui.find({ type: 'Button', key })
  await ui.unmount()

  return found === undefined ? undefined : String(found.props.label)
}

test('a job row names what the job works on, one line', async ($, on) => {
  const world = boot(on)
  await start($)
  world.toolResult = () => ({ result: { stdout: 'BUILD SUCCESS', stderr: '', interrupted: false } })
  await $.tool.call({ tool: 'Bash', command: 'mvn -B clean install' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-jobs' })
  await ui.unmount()
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const row = await again.find({ type: 'Text', text: /^maven · build · clean, install$/ })
  expect(row?.props.wrap).toBe('truncate-end')
  await again.unmount()
})

test('git is asked in English, and a Spanish "not a repository" still reads as outside', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = {
    exitCode: 128,
    stdout: '',
    stderr: 'fatal: no es un repositorio git (ni ninguno de los directorios superiores): .git',
  }
  await start($)
  await world.clock.advance(1600)
  expect(await shows($, 'desktop', /^Esta carpeta no es un repositorio git\.$/)).toBe(true)
  const gitCalls = world.gitRuns.map((run, i) => ({ run, init: world.gitInits[i] })).filter(c => c.run.startsWith('git '))
  expect(gitCalls.length).toBeGreaterThan(0)
  for (const call of gitCalls) expect(call.init?.env).toEqual({ LC_ALL: 'C', LANGUAGE: 'C' })
})

test('a merged PR says merged, shows no live checks and is not polled', async ($, on) => {
  const world = boot(on)
  inRepo(world, { ...PR, state: 'MERGED' })
  await start($)
  await onTab($, 'github')
  await world.clock.advance(1600)
  expect(await shows($, 'desktop', /^fusionada$/)).toBe(true)
  expect(await shows($, 'desktop', /^● 1$/)).toBe(false)
  expect(await shows($, 'desktop', /^CI /)).toBe(false)
  const asked = () => world.gitRuns.filter(run => run.startsWith('gh pr')).length
  await world.clock.advance(11 * 60_000)
  expect(asked()).toBe(1)
})

test('a closed PR says closed', async ($, on) => {
  const world = boot(on)
  inRepo(world, { ...PR, state: 'CLOSED' })
  await start($)
  await onTab($, 'github')
  await world.clock.advance(1600)
  expect(await shows($, 'desktop', /^cerrada$/)).toBe(true)
})

test('with no PR, a failed run of the branch shows in the chip and on the tab', async ($, on) => {
  const world = boot(on)
  inRepo(world)
  world.gitAnswers['gh run'] = {
    exitCode: 0,
    stdout: JSON.stringify([
      { workflowName: 'CI', status: 'completed', conclusion: 'failure', url: 'https://github.com/acme/demo/actions/runs/9' },
    ]),
    stderr: '',
  }
  await start($)
  await world.clock.advance(1600)
  expect(await shows($, 'desktop', /^CI ✗$/)).toBe(true)
  expect(await labelOf($, 'tab-github')).toBe('GitHub ✗')
})

test('the GitHub card keeps its refresh button when git fails', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = { exitCode: 1, stdout: '', stderr: 'fatal: bad object HEAD' }
  await start($)
  await onTab($, 'github')
  await world.clock.advance(1600)
  expect(await shows($, 'desktop', /^git: fatal: bad object HEAD$/)).toBe(true)
  expect(await labelOf($, 'git-refresh')).toBe('↻')
})

test('the time CI last changed stays while its figures stay, and moves when they change', async (_, on) => {
  const world = boot(on)
  inRepo(world, PR)
  // readGit needs only a clock and a process runner: the world's answers stand in for both
  const engine = {
    clock: { now: async () => world.clock.now() },
    process: {
      run: async (argv: string[]) => ({
        ...(world.gitAnswers[argv.slice(0, 2).join(' ')] ?? { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }),
        isStdoutTruncated: false,
        isStderrTruncated: false,
      }),
    },
  } as never as EngineInterface
  const first = await readGit(engine, NO_GIT, true)
  expect(first.ciChangedAt).toBe(first.remoteAt)
  await world.clock.advance(5 * 60_000)
  const same = await readGit(engine, first, true)
  expect(same.remoteAt).toBeGreaterThan(first.remoteAt)
  expect(same.ciChangedAt).toBe(first.ciChangedAt)
  inRepo(world, { ...PR, statusCheckRollup: PR.statusCheckRollup.map(check => ({ ...check, status: 'COMPLETED', conclusion: 'FAILURE' })) })
  const changed = await readGit(engine, same, true)
  expect(changed.ciChangedAt).toBe(changed.remoteAt)
})

test('a check that moves from queued to in progress restarts the polling clock', async (_, on) => {
  const world = boot(on)
  const engine = {
    clock: { now: async () => world.clock.now() },
    process: {
      run: async (argv: string[]) => ({
        ...(world.gitAnswers[argv.slice(0, 2).join(' ')] ?? { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }),
        isStdoutTruncated: false,
        isStderrTruncated: false,
      }),
    },
  } as never as EngineInterface
  const withStatus = (status: string) => inRepo(world, { ...PR, statusCheckRollup: [{ name: 'e2e', status, conclusion: '' }] })
  withStatus('QUEUED')
  const first = await readGit(engine, NO_GIT, true)
  await world.clock.advance(50 * 60_000)
  const still = await readGit(engine, first, true)
  expect(still.ciChangedAt).toBe(first.ciChangedAt)
  withStatus('IN_PROGRESS')
  const moved = await readGit(engine, still, true)
  expect(moved.ciChangedAt).toBe(moved.remoteAt)
  expect(ciPollMs(moved)).toBe(2 * 60_000)
})
