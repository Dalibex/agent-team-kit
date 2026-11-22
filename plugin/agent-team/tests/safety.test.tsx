import { expect } from 'claude-code/testing'
import { test } from './support'
import type { Engine } from 'claude-code/testing'

import { findRules, RULES_END, RULES_START, RULES_TEXT, rulesBlock, SHIPPED_BEFORE } from '../hooks/rules'
import { UPDATE_KEY } from '../hooks/update'
import { AGENT_TEAM_COMMAND, PANE, SPANISH, boot, start } from './support'
import type { World } from './support'

const HOME = '/home/ana'
const DIR = `${HOME}/.claude`
const FILE = `${DIR}/CLAUDE.md`
const BLOCK = rulesBlock()
const FENCE = '```'
const BACKUP_NAME = /^CLAUDE\.md\.agent-team-.*\.bak$/

const run = async ($: Engine, args: string, origin: { kind: string; name?: string } = { kind: 'composer' }): Promise<string> =>
  String((await $.command.run({ ...AGENT_TEAM_COMMAND, args, origin } as never)).text)

/** The backups beside the file, by name. */
const backupsIn = (world: World): string[] =>
  Object.keys(world.files)
    .filter(path => path.startsWith(`${DIR}/`) && BACKUP_NAME.test(path.slice(DIR.length + 1)))
    .sort()

// ------------------------------------------------------ 1. fences that do not close

test('a fence that never closes hides nothing: the block after it is found, and no second one is added', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const text = `Notes\n\n${FENCE}js\nnever closed\n\n${BLOCK}\n`
  world.files[FILE] = text
  await start($)

  expect(await run($, 'rules')).toContain('ya están al día')
  expect(world.written).toEqual([])
  expect(findRules(text)).toMatchObject({ kind: 'block' })
})

test('a line like ```foo``` opens no fence', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const text = `Use ${FENCE}foo${FENCE} here\n${FENCE}foo${FENCE}\n${BLOCK}\n`
  world.files[FILE] = text
  await start($)

  expect(findRules(text)).toMatchObject({ kind: 'block' })
  expect(await run($, 'rules')).toContain('ya están al día')
})

test('after an unclosed fence the block is added once, not on every run', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = `Mine\n${FENCE}\nnever closed\n`
  await start($)

  expect(await run($, 'rules')).toContain('añadidas')
  expect(await run($, 'rules')).toContain('ya están al día')
  expect(world.files[FILE]?.split(RULES_START)).toHaveLength(2)
})

test('a closed fence still hides what it holds, and a longer or ~~~ fence closes only with its own kind', () => {
  expect(findRules(`${FENCE}\n${BLOCK}\n${FENCE}\n`)).toEqual({ kind: 'none' })
  expect(findRules(`~~~\n${RULES_START}\n${FENCE}\n${RULES_END}\n~~~\n`)).toEqual({ kind: 'none' })
  expect(findRules(`${FENCE}${FENCE}\n${RULES_START}\n${FENCE}\n${RULES_END}\n${FENCE}${FENCE}\n`)).toEqual({ kind: 'none' })
})

test('when no block is found but the start marker is in the text, nothing is added', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const text = `Docs: put ${RULES_START} before the rules.\n`
  world.files[FILE] = text
  await start($)

  const reply = await run($, 'rules')
  expect(reply).toContain('no he cambiado nada')
  expect(reply).toContain(FILE)
  expect(world.written).toEqual([])
  expect(world.files[FILE]).toBe(text)
})

// -------------------------------------------------------------- 2. legacy sections

for (const [what, text, line, heading] of [
  ['a Delegation heading', 'Mine\n\n## Delegation to agents\n\nOld text.\n', 3, '## Delegation to agents'],
  ['an Agent team heading', '# Top\nMine\n## Agent team\nOld.\n', 3, '## Agent team'],
  ['the old sentence', 'One\nTwo\nThree\nI have a team of agents in `~/.claude/agents/`: explorer.\n', 4, 'I have a team of agents in `~/.claude/agents/`'],
] as const) {
  test(`legacy: ${what} without markers writes nothing and says where it starts`, async ($, on) => {
    const world = boot(on, { env: { HOME } })
    world.files[FILE] = text
    await start($)

    const reply = await run($, 'rules')
    expect(reply).toContain(`línea ${line}`)
    expect(reply).toContain(heading)
    expect(reply).toContain('quítala primero')
    expect(world.written).toEqual([])
    expect(world.files[FILE]).toBe(text)
  })
}

test('legacy: the message comes in English too', { options: { language: 'en' } }, async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'Mine\n## Agent team\nOld.\n'
  await start($)

  const reply = await run($, 'rules')
  expect(reply).toContain('line 2')
  expect(reply).toContain('remove it first')
  expect(world.written).toEqual([])
})

test('legacy: a heading inside a closed fence is not a section', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = `Notes\n${FENCE}md\n## Agent team\n${FENCE}\n`
  await start($)

  expect(await run($, 'rules')).toContain('añadidas')
})

test('legacy text inside the markers is the block: it is replaced, and the reply says it differed', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const old = `Mine\n\n${RULES_START}\n## Agent team\n\nI have a team of agents in \`~/.claude/agents/\`: explorer, implementer.\n${RULES_END}\n\nAfter\n`
  world.files[FILE] = old
  await start($)

  const reply = await run($, 'rules')
  expect(world.files[FILE]).toBe(`Mine\n\n${BLOCK}\n\nAfter\n`)
  expect(reply).toContain('distinto')
  const [backup] = backupsIn(world)
  expect(reply).toContain(backup ?? '?')
  expect(world.files[backup ?? '']).toBe(old)
  expect(await run($, 'rules')).toContain('ya están al día')
})

test('legacy text outside a marked block does not stop the block from being kept current', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = `## Agent team\nold\n\n${BLOCK}\n`
  await start($)

  expect(await run($, 'rules')).toContain('ya están al día')
})

/** SHA-256 of `RULES_TEXT` in v0.8.4 (`git show v0.8.4:plugin/agent-team/hooks/rules.ts`). */
const RULES_0_8_4_SHA256 = '39647f936bfd5fb300fc0cff5fd5ab29c3b238667969cbcca722d099d6f0b13b'
/** SHA-256 of `RULES_TEXT` as v0.8.5 and v0.8.6 shipped it (the same text in both). */
const RULES_0_8_6_SHA256 = '855783d7ffe4eab7532fcfc6aa50ca80134f1a139afdf95425922deebd4db95f'

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

test('the rules text 0.8.6 shipped is still current, or kept in SHIPPED_BEFORE', async () => {
  if ((await sha256(RULES_TEXT)) === RULES_0_8_6_SHA256) return
  const digests = await Promise.all(SHIPPED_BEFORE.map(sha256))
  if (!digests.includes(RULES_0_8_6_SHA256)) {
    throw new Error(
      'RULES_TEXT changed: add the text 0.8.6 shipped (git show v0.8.6:plugin/agent-team/hooks/rules.ts) to SHIPPED_BEFORE in hooks/rules.ts, ' +
        'so the blocks it wrote are replaced without a warning; then pin the new RULES_TEXT here.',
    )
  }
})

// ------------------------------------------------- 9. a block the person edited

test('a block that is the text this plugin shipped before is replaced without a warning; an edited one says so', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  await start($)
  expect(SHIPPED_BEFORE.length).toBeGreaterThan(0)
  // The 0.8.4 text, pinned by the SHA-256 of what v0.8.4 shipped: a later edit of it would strand the blocks it wrote.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SHIPPED_BEFORE[0]))
  expect([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')).toBe(RULES_0_8_4_SHA256)
  for (const shipped of SHIPPED_BEFORE) {
    world.files[FILE] = `${RULES_START}\n${shipped}\n${RULES_END}\n`
    const first = await run($, 'rules')
    expect(first).toContain('actualizadas')
    expect(first).not.toContain('distinto')
    expect(world.files[FILE]).toBe(`${BLOCK}\n`)
  }

  world.files[FILE] = `${RULES_START}\n${RULES_TEXT}\nMy own extra rule.\n${RULES_END}\n`
  const second = await run($, 'rules')
  expect(second).toContain('distinto')
  expect(world.files[FILE]).toBe(`${BLOCK}\n`)
})

// -------------------------------------------------------------- 3. bytes

test('a file that is not UTF-8 is refused, and nothing is written', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'caf�\n'
  world.rawBytes[FILE] = [0x63, 0x61, 0x66, 0xe9, 0x0a]
  await start($)

  for (const args of ['rules', 'rules off']) {
    const reply = await run($, args)
    expect(reply).toContain('no está guardado en UTF-8')
    expect(reply).toContain('no he cambiado nada')
  }
  expect(world.written).toEqual([])
})

test('the not-UTF-8 refusal comes in English', { options: { language: 'en' } }, async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'caf�\n'
  world.rawBytes[FILE] = [0x63, 0x61, 0x66, 0xe9, 0x0a]
  await start($)

  expect(await run($, 'rules')).toContain('not saved as UTF-8')
})

test('a UTF-8 BOM is set aside to read the file and put back when it is written', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const body = 'Mine\n'
  world.files[FILE] = body
  world.rawBytes[FILE] = [0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)]
  await start($)

  expect(await run($, 'rules')).toContain('añadidas')
  expect(world.files[FILE]).toBe(`﻿${body}\n${BLOCK}\n`)
  expect(world.files[FILE]?.indexOf('﻿')).toBe(0)
  expect(world.files[FILE]?.lastIndexOf('﻿')).toBe(0)
})

test('an up-to-date file with a BOM reads as up to date', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const body = `Mine\n\n${BLOCK}\n`
  world.files[FILE] = body
  world.rawBytes[FILE] = [0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)]
  await start($)

  expect(await run($, 'rules')).toContain('ya están al día')
  expect(world.written).toEqual([])
})

// ------------------------------------------------------------- 7. backups

test('two writes in the same millisecond keep two different backups', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'Mine\n'
  await start($)

  await run($, 'rules')
  await run($, 'rules off')
  const copies = backupsIn(world)
  expect(copies).toHaveLength(2)
  expect(copies.map(path => world.files[path]).sort()).toEqual(['Mine\n', `Mine\n\n${BLOCK}\n`].sort())
})

test('only the last five backups are kept, the older ones removed', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'Mine\n'
  const old = ['19600101T000000', '19600102T000000', '19600103T000000', '19600104T000000', '19600105T000000', '19600106T000000', '19600107T000000']
  for (const stamp of old) world.files[`${FILE}.agent-team-${stamp}.bak`] = stamp
  world.files[`${DIR}/other.md`] = 'not a backup'
  await start($)

  await run($, 'rules')
  const left = backupsIn(world)
  expect(left).toHaveLength(5)
  expect(left.slice(0, 4).map(path => path.split('agent-team-')[1])).toEqual([
    '19600104T000000.bak',
    '19600105T000000.bak',
    '19600106T000000.bak',
    '19600107T000000.bak',
  ])
  expect(world.removed.sort()).toEqual(old.slice(0, 3).map(stamp => `${FILE}.agent-team-${stamp}.bak`))
  expect(world.files[`${DIR}/other.md`]).toBe('not a backup')
})

test('on Windows the old backups are removed by PowerShell, the path in the environment', async ($, on) => {
  const world = boot(on, { env: { HOME, OS: 'Windows_NT' } })
  world.files[FILE] = 'Mine\n'
  for (let day = 1; day <= 6; day += 1) world.files[`${FILE}.agent-team-1960010${day}T000000.bak`] = 'x'
  await start($)

  await run($, 'rules')
  expect(world.removed).toEqual([`${FILE}.agent-team-19600101T000000.bak`, `${FILE}.agent-team-19600102T000000.bak`])
  const removal = world.runs.find(r => r.init?.env?.AGENT_TEAM_DELETE !== undefined)
  expect(removal?.argv[0]).toBe('powershell.exe')
})

test('if the file cannot be written after its backup was, the reply says where the copy is', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'Mine\n'
  world.failWrite = path => path === FILE
  await start($)

  const reply = await run($, 'rules')
  expect(reply).toContain('copia')
  expect(reply).toContain(backupsIn(world)[0] ?? '?')
  expect(reply).not.toContain('No se cambió nada')
  expect(world.files[FILE]).toBe('Mine\n')
})

test('if even the backup cannot be written, nothing was changed and the reply says so', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'Mine\n'
  world.failWrite = () => true
  await start($)

  const reply = await run($, 'rules')
  expect(reply).toContain('No se cambió nada')
  expect(world.files[FILE]).toBe('Mine\n')
})

// -------------------------------------------------------------- 8. symlinks

test('a CLAUDE.md that is a symlink is written through to its target and stays a link', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const target = '/dotfiles/claude.md'
  world.files[target] = 'Mine\n'
  world.links[FILE] = target
  await start($)

  expect(await run($, 'rules')).toContain('añadidas')
  expect(world.links[FILE]).toBe(target)
  expect(world.files[target]).toBe(`Mine\n\n${BLOCK}\n`)
  expect(world.written).not.toContain(FILE)
  // the copy sits beside the link, not in the dotfiles repository
  const [backup] = backupsIn(world)
  expect(backup).toBeDefined()
  expect(world.files[backup ?? '']).toBe('Mine\n')
})

// ---------------------------------------------------- 10. who may run it

for (const origin of [{ kind: 'plugin', name: 'other' }, { kind: 'task-notification' }, { kind: 'schedule' }]) {
  test(`rules from a ${origin.kind} origin is refused and writes nothing`, async ($, on) => {
    const world = boot(on, { env: { HOME } })
    await start($)

    for (const args of ['rules', 'rules off']) expect(await run($, args, origin)).toContain('que escribas tú')
    expect(world.written).toEqual([])
  })
}

test('rules from the composer, the bridge or the SDK is allowed', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  await start($)

  for (const kind of ['composer', 'bridge', 'sdk']) {
    expect(await run($, 'rules', { kind })).not.toContain('que escribas tú')
  }
  expect(world.files[FILE]).toBe(`${BLOCK}\n`)
})

test('the command is registered with an argument hint', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  await start($)

  expect(world.registered.find(c => c.name === 'agent-team')?.argumentHint).toBe('[rules [off] | update]')
})

// ------------------------------------------------------- 11. a reload with no start

test('the language is resolved by the first hook that has the engine, with no session.start after a reload', async ($, on) => {
  boot(on, { env: SPANISH })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const labels = [String((await ui.find({ type: 'Button', key: 'tab-team' }))?.props.label), String((await ui.find({ type: 'Button', key: 'tab-jobs' }))?.props.label)]
  await ui.unmount()

  expect(labels).toEqual(['Equipo', 'Procesos'])
})

test('the command answers in the system language even before a start', async ($, on) => {
  const world = boot(on, { env: { ...SPANISH, HOME } })
  expect(await run($, 'frobnicate')).toContain('muestra u oculta el panel')
  expect(world.written).toEqual([])
})

// ---------------------------------------------------------- 5. privacy

for (const value of ['1', '0', 'true']) {
  test(`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=${value} sends no request`, async ($, on) => {
    const world = boot(on, { env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: value } })
    world.http = () => ({ status: 200, ok: true, headers: {}, text: JSON.stringify({ tag_name: 'v9.9.9' }) })
    await start($)
    await world.clock.advance(3500)
    await world.clock.settle()

    expect(world.fetched).toEqual([])
    expect(world.stored[UPDATE_KEY]).toBeUndefined()
  })
}

test('with the variable unset or empty the request is made', async ($, on) => {
  const world = boot(on, { env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '' } })
  world.http = () => ({ status: 200, ok: true, headers: {}, text: JSON.stringify({ tag_name: 'v0.8.4' }) })
  await start($)
  await world.clock.advance(3500)
  await world.clock.settle()

  expect(world.fetched).toHaveLength(1)
})

// ------------------------------------------------- 6. how to update

test('the update instruction is the two claude plugin commands and /reload-plugins, in the toast and the strip', async ($, on) => {
  const world = boot(on)
  world.http = () => ({ status: 200, ok: true, headers: {}, text: JSON.stringify({ tag_name: 'v9.9.0', html_url: 'https://github.com/Dalibex/agent-team-kit/releases/tag/v9.9.0' }) })
  await start($)
  await world.clock.advance(3500)
  await world.clock.settle()

  const toast = world.toasts.find(text => text.includes('9.9.0')) ?? ''
  expect(toast).toContain('claude plugin marketplace update agent-team-kit')
  expect(toast).toContain('claude plugin update agent-team@agent-team-kit')
  expect(toast).toContain('/reload-plugins')
  expect(toast).not.toContain('/plugin marketplace')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const hint = await ui.find({ type: 'Text', text: /claude plugin update agent-team@agent-team-kit/ })
  await ui.unmount()
  expect(hint).toBeDefined()
})
