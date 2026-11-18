import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { findRules, planInstall, planRemove, RULES_END, RULES_START, RULES_TEXT, rulesBlock } from '../hooks/rules'
import { AGENT_TEAM_COMMAND, boot, start } from './support'

const HOME = '/home/ana'
const FILE = `${HOME}/.claude/CLAUDE.md`
const BLOCK = rulesBlock()
const BACKUP = /\/home\/ana\/\.claude\/CLAUDE\.md\.agent-team-\d{8}T\d{9}-\d+\.bak$/

/** Runs `/agent-team <args>`. */
const run = async ($: Engine, args: string): Promise<string> => String((await $.command.run({ ...AGENT_TEAM_COMMAND, args })).text)

/** The backups the run wrote: every path written but the file itself. */
const backupsOf = (written: string[]): string[] => written.filter(path => path !== FILE)

// ------------------------------------------------------------ the text

test('the rules are the old ones in English, asking with QUESTIONS and framed by the markers existing files already have', () => {
  expect(RULES_START).toBe('<!-- agent-team:reglas:inicio -->')
  expect(RULES_END).toBe('<!-- agent-team:reglas:fin -->')
  expect(RULES_TEXT).toContain('QUESTIONS:')
  expect(RULES_TEXT).not.toContain('PREGUNTAS')
  expect(RULES_TEXT.startsWith('## Agent team\n')).toBe(true)
  expect(BLOCK.startsWith(`${RULES_START}\n## Agent team`)).toBe(true)
  expect(BLOCK.endsWith(`\n${RULES_END}`)).toBe(true)
})

// ----------------------------------------------------------- installing

test('rules: with no CLAUDE.md the file is created with the block, and nothing is copied', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  await start($)

  expect(await run($, 'rules')).toBe(`Reglas del equipo escritas en ${FILE} (el fichero no existía).`)
  expect(world.files[FILE]).toBe(`${BLOCK}\n`)
  expect(world.written).toEqual([FILE])
})

test('rules: a file without the block gets it at the end after a blank line, and a copy of the old file stays beside it', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = '# My rules\n\nBe brief.\n'
  await start($)

  const reply = await run($, 'rules')
  expect(world.files[FILE]).toBe(`# My rules\n\nBe brief.\n\n${BLOCK}\n`)
  const [backup] = backupsOf(world.written)
  expect(backupsOf(world.written)).toHaveLength(1)
  expect(backup).toMatch(BACKUP)
  expect(world.files[backup ?? '']).toBe('# My rules\n\nBe brief.\n')
  expect(reply).toContain('añadidas al final')
  expect(reply).toContain(backup ?? '?')
})

test('rules: a file with no final line break still gets a blank line before the block', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'Be brief.'
  await start($)

  await run($, 'rules')
  expect(world.files[FILE]).toBe(`Be brief.\n\n${BLOCK}\n`)
})

test('rules: a block already equal to the current text is left alone and said so', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = `Before\n\n${BLOCK}\n\nAfter\n`
  await start($)

  expect(await run($, 'rules')).toBe(`Las reglas del equipo de ${FILE} ya están al día.`)
  expect(world.written).toEqual([])
  expect(world.files[FILE]).toBe(`Before\n\n${BLOCK}\n\nAfter\n`)
})

test('rules: running it twice writes once', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  await start($)

  await run($, 'rules')
  expect(await run($, 'rules')).toContain('ya están al día')
  expect(world.written).toEqual([FILE])
})

test('rules: a different block is replaced, the rest of the file kept, and the old file copied first', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const old = `Before\n\n${RULES_START}\n## Agent team\nOld rules with PREGUNTAS: here.\n${RULES_END}\n\nAfter\n`
  world.files[FILE] = old
  await start($)

  const reply = await run($, 'rules')
  expect(world.files[FILE]).toBe(`Before\n\n${BLOCK}\n\nAfter\n`)
  expect(world.files[FILE]).not.toContain('PREGUNTAS')
  const [backup] = backupsOf(world.written)
  expect(world.written.indexOf(backup ?? '')).toBeLessThan(world.written.indexOf(FILE))
  expect(world.files[backup ?? '']).toBe(old)
  expect(reply).toContain('sustituidas')
})

test('rules: a file with Windows line breaks keeps them', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'One\r\nTwo\r\n'
  await start($)

  await run($, 'rules')
  const text = world.files[FILE] ?? ''
  expect(text.startsWith('One\r\nTwo\r\n\r\n<!-- agent-team')).toBe(true)
  expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  expect(await run($, 'rules')).toContain('ya están al día')
})

// -------------------------------------------------- where the file is

test('rules: CLAUDE_CONFIG_DIR wins over HOME and USERPROFILE', async ($, on) => {
  const world = boot(on, { env: { CLAUDE_CONFIG_DIR: '/cfg/claude/', HOME, USERPROFILE: 'C:/Users/ana' } })
  await start($)

  await run($, 'rules')
  expect(world.written).toEqual(['/cfg/claude/CLAUDE.md'])
})

test('rules: USERPROFILE comes before HOME, as os.homedir reads them on Windows; HOME alone does for POSIX', async ($, on) => {
  const world = boot(on, { env: { USERPROFILE: 'C:\\Users\\ana\\', HOME } })
  await start($)

  await run($, 'rules')
  expect(world.written).toEqual(['/Users/ana/.claude/CLAUDE.md'])
})

test('rules: HOME is used when USERPROFILE is not set', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  await start($)

  await run($, 'rules')
  expect(world.written).toEqual([FILE])
})

test('rules: with no place to look the command says so and writes nothing', async ($, on) => {
  const world = boot(on)
  await start($)

  expect(await run($, 'rules')).toContain('No sé dónde está tu CLAUDE.md')
  expect(world.written).toEqual([])
})

// ------------------------------------------------ markers that cannot be trusted

for (const [what, text, why] of [
  ['a start with no end', `A\n${RULES_START}\nrules\n`, 'la marca de inicio no tiene marca de fin'],
  ['an end with no start', `A\nrules\n${RULES_END}\n`, 'la marca de fin no tiene marca de inicio'],
  ['a marker twice', `${RULES_START}\nx\n${RULES_END}\n${RULES_START}\ny\n${RULES_END}\n`, 'una marca aparece más de una vez'],
  ['an end before its start', `${RULES_END}\nx\n${RULES_START}\n`, 'la marca de fin va antes que la de inicio'],
] as const) {
  for (const args of ['rules', 'rules off']) {
    test(`/agent-team ${args}: ${what} changes nothing and says why`, async ($, on) => {
      const world = boot(on, { env: { HOME } })
      world.files[FILE] = text
      await start($)

      const reply = await run($, args)
      expect(reply).toContain('mal')
      expect(reply).toContain(why)
      expect(reply).toContain('no he cambiado nada')
      expect(world.written).toEqual([])
      expect(world.files[FILE]).toBe(text)
    })
  }
}

test('a start marker that is only quoted in a fence is not a block, and no second set of rules is added over it', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const fenced = `Notes\n\n\`\`\`markdown\n${RULES_START}\nquoted\n${RULES_END}\n\`\`\`\n`
  world.files[FILE] = fenced
  await start($)

  expect(findRules(fenced)).toEqual({ kind: 'none' })
  expect(await run($, 'rules')).toContain('no he cambiado nada')
  expect(world.written).toEqual([])
  expect(world.files[FILE]).toBe(fenced)
})

test('a lone marker inside a fence is not malformed, and a fence with ~~~ or a longer opener holds its own', () => {
  expect(findRules(`~~~\n${RULES_START}\n~~~\n`)).toEqual({ kind: 'none' })
  expect(findRules(`\`\`\`\`\n\`\`\`\n${RULES_END}\n\`\`\`\`\n`)).toEqual({ kind: 'none' })
  const text = `\`\`\`\n${RULES_START}\n\`\`\`\n${BLOCK}\n`
  expect(findRules(text)).toMatchObject({ kind: 'block' })
})

// ------------------------------------------------------------- removing

test('rules off: the block goes and every other byte stays', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  const before = '# Mine\r\n\tkeep  this \n\n\n- a\n'
  world.files[FILE] = before
  await start($)

  await run($, 'rules')
  expect(world.files[FILE]).not.toBe(before)
  const reply = await run($, 'rules off')
  expect(world.files[FILE]).toBe(before)
  expect(reply).toContain('quitadas')
  const copies = backupsOf(world.written)
  expect(copies.every(path => BACKUP.test(path))).toBe(true)
})

test('rules off: a block in the middle leaves the text around it', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = `Top\n${BLOCK}\nBottom\n`
  await start($)

  await run($, 'rules off')
  expect(world.files[FILE]).toBe('Top\nBottom\n')
})

test('rules off: a file that is only the block becomes empty', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = `${BLOCK}\n`
  await start($)

  await run($, 'rules off')
  expect(world.files[FILE]).toBe('')
})

test('rules off: no block, or no file, is said and nothing is written', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  await start($)

  expect(await run($, 'rules off')).toBe(`No hay reglas del equipo en ${FILE}: nada que quitar.`)
  world.files[FILE] = 'Just mine\n'
  expect(await run($, 'RULES  Off')).toContain('nada que quitar')
  expect(world.written).toEqual([])
})

test('the plans can be read without an engine', () => {
  expect(planInstall(undefined).kind).toBe('create')
  expect(planInstall('').kind).toBe('append')
  expect(planInstall(`${BLOCK}\n`).kind).toBe('current')
  expect(planRemove(undefined).kind).toBe('none')
  expect(planRemove(`${BLOCK}`)).toEqual({ kind: 'remove', text: '' })
})

// ------------------------------------------------------ the command's words

test('rules replies come in English too', { options: { language: 'en' } }, async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.files[FILE] = 'Mine\n'
  await start($)

  expect(await run($, 'rules')).toContain('Team rules added at the end of')
  expect(await run($, 'rules')).toBe(`The team rules in ${FILE} are already up to date.`)
  expect(await run($, 'rules off')).toContain('Team rules removed from')
  expect(await run($, 'rules off')).toBe(`There are no team rules in ${FILE}: nothing to remove.`)
  world.files[FILE] = `${RULES_START}\n`
  expect(await run($, 'rules')).toContain('malformed (the start marker has no end marker)')
})

test('an argument the command does not know prints its usage and touches nothing', async ($, on) => {
  const world = boot(on, { env: { HOME } })
  world.panes = ['agent-team']
  await start($)

  expect(await run($, 'frobnicate')).toContain('/agent-team rules off')
  expect(await run($, 'rules on')).toContain('/agent-team rules')
  expect(world.closed).toEqual([])
  expect(world.written).toEqual([])
})
