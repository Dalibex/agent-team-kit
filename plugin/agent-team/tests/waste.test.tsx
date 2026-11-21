import { expect, test } from 'claude-code/testing'

import { setLanguage } from '../hooks/i18n'
import { briefWarning, likeness, reviewWarning, shortstatLines } from '../hooks/state'
import { boot, finish, shows, spawn, start, usage } from './support'

// The pure warnings below are asserted in Spanish.
setLanguage('es')

const BRIEF = [
  'Goal: add pagination to GET /incidents.',
  'Why: the list grows past 2000 rows; we chose cursor pagination over offsets.',
  'Files: src/incidents/IncidentController.java:40-90',
  'Done when: mvn test passes and the endpoint returns a next cursor.',
  'Limits: never commit or push.',
].join('\n')

// ------------------------------------------------------------ the spend line

test('the team tab says what each role used this session and the team’s share', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:explorer', { prompt: BRIEF })
  await finish($, 'a1', 'answer', usage('claude-haiku-5-5', 3000, 1000))
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', usage: usage('claude-opus-5-5', 9000, 3000) })

  for (const piece of [/^Sesión$/, /^Claude 12k · 1 turno$/, /^explorer 4\.0k ×1$/, /^equipo 25 %$/]) {
    expect(await shows($, 'desktop', piece, 'Text', 'team')).toBe(true)
  }
})

test('before anything ran there is no spend line', async ($, on) => {
  boot(on)
  await start($)
  expect(await shows($, 'desktop', /^Sesión$/)).toBe(false)
})

// ------------------------------------------------------------ waste on the rows

test('a team brief without Goal or Why is flagged on its row', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer', { prompt: 'Fix the login bug in auth.ts' })
  expect(await shows($, 'desktop', /^⚠ encargo sin Goal ni Why: el agente tendrá que adivinar o explorar$/)).toBe(true)
})

test('a brief that follows the template, in bold or bulleted, is not flagged', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer', { prompt: BRIEF })
  await spawn($, 'a2', 'agent-team:tester', { prompt: '- **Goal**: cover it.\n- **Why**: it broke twice.' })
  expect(await shows($, 'desktop', /^⚠/)).toBe(false)
})

test('a brief for another agent type is not held to the team template', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'general-purpose', { prompt: 'Look around' })
  expect(await shows($, 'desktop', /encargo sin/)).toBe(false)
})

test('the same brief sent again soon after, to the same role, says to continue the agent instead', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer', { prompt: BRIEF })
  await finish($, 'a1')
  await world.clock.advance(3 * 60 * 1000)
  await spawn($, 'a2', 'agent-team:implementer', { prompt: `${BRIEF}\nAlso handle an empty page.` })
  expect(await shows($, 'desktop', /^⚠ parecido al encargo de hace 3 min: continuar ese agente con SendMessage costaba menos$/)).toBe(true)
})

test('a similar brief long after, or to another role, is not a repeat', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer', { prompt: BRIEF })
  await finish($, 'a1')
  await spawn($, 'a2', 'agent-team:tester', { prompt: BRIEF })
  await world.clock.advance(25 * 60 * 1000)
  await spawn($, 'a3', 'agent-team:implementer', { prompt: BRIEF })
  expect(await shows($, 'desktop', /parecido al encargo/)).toBe(false)
})

test('a reviewer sent on a diff of a few lines is flagged once git has counted it', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = { exitCode: 0, stdout: '# branch.head feat/x\n# branch.ab +0 -0\n', stderr: '' }
  world.gitAnswers['git diff'] = { exitCode: 0, stdout: ' 1 file changed, 3 insertions(+), 1 deletion(-)\n', stderr: '' }
  world.gitAnswers['git ls-files'] = { exitCode: 0, stdout: '', stderr: '' }
  await start($)
  await world.clock.advance(2000)
  await spawn($, 'r1', 'agent-team:reviewer', { prompt: BRIEF })
  await world.clock.advance(100)
  expect(world.gitRuns).toContain('git diff --shortstat HEAD')
  expect(await shows($, 'desktop', /^⚠ revisión con Opus de un cambio de 4 líneas: para algo así no hacía falta$/)).toBe(true)
})

test('a reviewer on a real change, or outside a repository, is not flagged', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = { exitCode: 0, stdout: '# branch.head feat/x\n# branch.ab +0 -0\n', stderr: '' }
  world.gitAnswers['git diff'] = { exitCode: 0, stdout: ' 4 files changed, 120 insertions(+), 30 deletions(-)\n', stderr: '' }
  await start($)
  await world.clock.advance(2000)
  await spawn($, 'r1', 'agent-team:reviewer', { prompt: BRIEF })
  await world.clock.advance(100)
  expect(await shows($, 'desktop', /^⚠/)).toBe(false)
})

// ------------------------------------------------------------ the pure checks

test('briefs read alike by their shared words', () => {
  expect(likeness(BRIEF, BRIEF)).toBe(1)
  expect(likeness(BRIEF, 'Write the release notes for 0.8')).toBeLessThan(0.1)
  expect(likeness('', BRIEF)).toBe(0)
})

test('the template headings are found in either language', () => {
  expect(briefWarning('Objetivo: x\nPor qué: y')).toBeUndefined()
  expect(briefWarning('Goal: x')).toBe('encargo sin Why: el agente tendrá que adivinar o explorar')
  expect(briefWarning('We need a goal: x')).toBe('encargo sin Goal ni Why: el agente tendrá que adivinar o explorar')
})

test('shortstat counts both sides, and a clean tree is no diff at all', () => {
  expect(shortstatLines(' 2 files changed, 7 insertions(+)\n')).toBe(7)
  expect(shortstatLines(' 1 file changed, 1 deletion(-)\n')).toBe(1)
  expect(shortstatLines('')).toBeUndefined()
  expect(reviewWarning(undefined)).toBeUndefined()
  expect(reviewWarning(11)).toBeUndefined()
  expect(reviewWarning(1)).toBe('revisión con Opus de un cambio de 1 línea: para algo así no hacía falta')
})

test('a small diff beside new files git does not count is not called small', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = { exitCode: 0, stdout: '# branch.head feat/x\n# branch.ab +0 -0\n', stderr: '' }
  world.gitAnswers['git diff'] = { exitCode: 0, stdout: ' 1 file changed, 3 insertions(+)\n', stderr: '' }
  world.gitAnswers['git ls-files'] = { exitCode: 0, stdout: 'src/NewModule.java\n', stderr: '' }
  await start($)
  await world.clock.advance(2000)
  await spawn($, 'r1', 'agent-team:reviewer', { prompt: BRIEF })
  await world.clock.advance(100)
  expect(world.gitRuns).not.toContain('git diff --shortstat HEAD')
  expect(await shows($, 'desktop', /^⚠/)).toBe(false)
})

test('a reviewer working in another folder is not measured against this one', async ($, on) => {
  const world = boot(on)
  world.gitAnswers['git status'] = { exitCode: 0, stdout: '# branch.head feat/x\n# branch.ab +0 -0\n', stderr: '' }
  await start($)
  await world.clock.advance(2000)
  await spawn($, 'r1', 'agent-team:reviewer', { prompt: BRIEF, cwd: '/other/worktree' })
  await world.clock.advance(100)
  expect(world.gitRuns.some(run => run.startsWith('git ls-files') || run.startsWith('git diff'))).toBe(false)
})

test('a failed agent sent again is not a repeat, nor is the next plan step with the same Why', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'agent-team:implementer', { prompt: BRIEF })
  await finish($, 'a1', 'error')
  await spawn($, 'a2', 'agent-team:implementer', { prompt: BRIEF })
  await finish($, 'a2')
  await world.clock.advance(60 * 1000)
  const nextStep = BRIEF.replace('Goal: add pagination to GET /incidents.', 'Goal: write the migration that adds the cursor index.')
  await spawn($, 'a3', 'agent-team:implementer', { prompt: nextStep })
  expect(await shows($, 'desktop', /parecido al encargo/)).toBe(false)
})

test('a Markdown heading counts as the template heading', () => {
  expect(briefWarning('## Goal\nAdd it.\n\n### Por qué\nIt broke.')).toBeUndefined()
})

test('a heading that qualifies its word still counts, and a longer word does not', () => {
  expect(briefWarning('## Goal\nFix it.\n\n## Why / decision taken (with the user)\nIt broke.')).toBeUndefined()
  expect(briefWarning('## Goal\nFix it.\n\n## Why / what was decided\n- A: it broke.')).toBeUndefined()
  expect(briefWarning('**Goal**: fix it.\n**Why (context)**: it broke.')).toBeUndefined()
  expect(briefWarning('## Objetivo del cambio\nx\n## Por qué lo hacemos\ny')).toBeUndefined()
  expect(briefWarning('Goalkeeper: x\nWhyever: y')).toBe('encargo sin Goal ni Why: el agente tendrá que adivinar o explorar')
  expect(briefWarning('## Goals and whys\nx')).toBe('encargo sin Goal ni Why: el agente tendrá que adivinar o explorar')
})
