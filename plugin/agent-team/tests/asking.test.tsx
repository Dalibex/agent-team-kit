import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { drawTeam, pulseColorOf } from '../hooks/drawing'
import { setLanguage } from '../hooks/i18n'
import { ASK, LOOK } from '../hooks/look'
import { AFTERGLOW_MS, EMPTY, isAsking, QUESTION_CHARS, questionsOf, QUESTIONS_MAX } from '../hooks/state'
import type { AgentRow, Team, Usage } from '../types'
import { PANE, SURFACES, boot, finish, shows, spawn, start, unfold } from './support'

setLanguage('es')

const AT = 1_000_000
const USAGE: Usage = { at: 0, windows: [] }
const PURPLE = '#e040fb'

const row = (extra: Partial<AgentRow> = {}): AgentRow => ({
  id: 'a1', type: 'Explore', role: 'explorer', description: 'look', prompt: '', startedAt: AT - 100_000, calls: 0, lastActiveAt: 0, status: 'done', endedAt: AT - 1000, ...extra,
})
const teamOf = (agents: AgentRow[]): Team => ({ ...EMPTY, main: { ...EMPTY.main, since: AT - 5000 }, agents })

/** The explorer's slot of a drawing, and its frame's stroke. */
const explorerSlot = (svg: string): { slot: string; border: string | undefined } => {
  const slot = svg.split('<g><title>').find(part => part.startsWith('explorer:')) ?? ''

  return { slot, border: /<rect [^>]*rx="12" fill="[^"]+" stroke="([^"]+)"/.exec(slot)?.[1] }
}

/** Ends an agent's turn with this report. */
const report = ($: Engine, agentId: string, answer: string, reason: 'answer' | 'error' = 'answer') =>
  $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: `turn-${agentId}`, agentId, reason } as never)

const drawingOf = async ($: Engine): Promise<string> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return String(svg?.props.source ?? '')
}

// ------------------------------------------------------------ the parser

test('QUESTIONS: and PREGUNTAS: open a list of numbered items, one question each', () => {
  expect(questionsOf('QUESTIONS:\n1. Which database?\n2. Which port?')).toEqual(['Which database?', 'Which port?'])
  expect(questionsOf('PREGUNTAS:\n1) ¿Qué base de datos?\n2) ¿Qué puerto?')).toEqual(['¿Qué base de datos?', '¿Qué puerto?'])
})

test('a plain question at the margin keeps the options indented under it', () => {
  expect(questionsOf('QUESTIONS:\nWhich one?\n  - Postgres\n  - MySQL')).toEqual(['Which one? Postgres MySQL'])
  // numbered questions with sub-bullets: one question each, the sub-bullets joined in
  expect(questionsOf('QUESTIONS:\n1. Which?\n   - Checked: a\n   - Default: b\n2. Where?')).toEqual(['Which? Checked: a Default: b', 'Where?'])
  // prose back at the margin after the list ends it and is no question
  expect(questionsOf('QUESTIONS:\n1. a\n2. b\nAlready done: the parser.\n   more')).toEqual(['a', 'b'])
  // an introduction before the list is no question either
  expect(questionsOf('QUESTIONS:\nTwo things:\n1. a\n2. b')).toEqual(['a', 'b'])
})

test('emphasis markers go only where they wrap text, and code keeps its underscores', () => {
  expect(questionsOf('QUESTIONS:\n1. Should `__init__.py` export **kwargs helpers?')).toEqual(['Should `__init__.py` export **kwargs helpers?'])
  expect(questionsOf('QUESTIONS:\n1. Use **Postgres** or __MySQL__?')).toEqual(['Use Postgres or MySQL?'])
})

test('bulleted items of every kind read as questions', () => {
  expect(questionsOf('QUESTIONS:\n- one\n* two\n• three\n+ four')).toEqual(['one', 'two', 'three', 'four'])
})

test('blank space before the header, a Markdown heading and bold all still open the list', () => {
  expect(questionsOf('\n  \n  QUESTIONS:\n- a')).toEqual(['a'])
  expect(questionsOf('## QUESTIONS:\n- a')).toEqual(['a'])
  expect(questionsOf('###QUESTIONS:\n- a')).toEqual(['a'])
  expect(questionsOf('**QUESTIONS:**\n- a')).toEqual(['a'])
  expect(questionsOf('**QUESTIONS**:\n- a')).toEqual(['a'])
  expect(questionsOf('**PREGUNTAS:**\n1. a')).toEqual(['a'])
})

test('sub-bullets and continuation lines are joined into the question above them', () => {
  expect(questionsOf('QUESTIONS:\n1. Which database?\n   - Postgres\n   - MySQL\n2. Which port?\n   because the default is taken')).toEqual([
    'Which database? Postgres MySQL',
    'Which port? because the default is taken',
  ])
})

test('a later heading ends the list', () => {
  expect(questionsOf('QUESTIONS:\n1. A?\n2. B?\n\n## Notes\n- not a question\n1. nor this')).toEqual(['A?', 'B?'])
})

test('with no items the non-empty lines are the questions, and text after the header counts too', () => {
  expect(questionsOf('QUESTIONS:\nWhich database?\n\nWhich port?')).toEqual(['Which database?', 'Which port?'])
  expect(questionsOf('QUESTIONS: which database?')).toEqual(['which database?'])
})

test('bold marks inside an item are removed', () => {
  expect(questionsOf('QUESTIONS:\n1. **Which** database?')).toEqual(['Which database?'])
})

test('a report that does not open with the header is not asking', () => {
  expect(questionsOf(undefined)).toBeUndefined()
  expect(questionsOf('')).toBeUndefined()
  expect(questionsOf('Done. All the tests pass.')).toBeUndefined()
  expect(questionsOf('Questions:\n1. Which?')).toBeUndefined()
  expect(questionsOf('questions:\n1. Which?')).toBeUndefined()
  expect(questionsOf('Report\n\nQUESTIONS:\n1. Which?')).toBeUndefined()
  expect(questionsOf('No QUESTIONS: here')).toBeUndefined()
})

test(`at most ${QUESTIONS_MAX} questions are kept, each cut to ${QUESTION_CHARS} characters`, () => {
  const many = Array.from({ length: QUESTIONS_MAX + 5 }, (_, i) => `${i + 1}. q${i + 1}`).join('\n')
  const kept = questionsOf(`QUESTIONS:\n${many}`)
  expect(kept).toHaveLength(QUESTIONS_MAX)
  expect(kept?.[QUESTIONS_MAX - 1]).toBe(`q${QUESTIONS_MAX}`)

  const long = questionsOf(`QUESTIONS:\n1. ${'x'.repeat(QUESTION_CHARS + 100)}`)
  expect(long?.[0]).toHaveLength(QUESTION_CHARS)
})

test('an agent is asking only while it is not running and still holds its questions', () => {
  expect(isAsking(row({ questions: ['a'] }))).toBe(true)
  expect(isAsking(row({ questions: ['a'], status: 'running' }))).toBe(false)
  expect(isAsking(row())).toBe(false)
})

// ------------------------------------------------------------ the drawing

test('an agent that asks keeps a purple border and a "?" after its afterglow; one that does not rests', () => {
  const asking = (ago: number): Team => teamOf([row({ questions: ['a?'], endedAt: AT - ago })])
  const plain = (ago: number): Team => teamOf([row({ endedAt: AT - ago })])

  for (const ago of [1000, AFTERGLOW_MS + 1000, AFTERGLOW_MS * 20]) {
    const { slot, border } = explorerSlot(drawTeam(asking(ago), AT, USAGE))
    expect(border).toBe(ASK)
    expect(border).toBe(PURPLE)
    expect(slot).toMatch(new RegExp(`font-weight="bold" fill="${PURPLE}">\\?</text>`))
  }
  const resting = explorerSlot(drawTeam(plain(AFTERGLOW_MS + 1000), AT, USAGE))
  expect(resting.border).toBe('#2e2a3a')
  expect(resting.slot).not.toContain('>?</text>')
})

test('a failed agent keeps its red border and shows no "?"', () => {
  const failed = explorerSlot(drawTeam(teamOf([row({ status: 'failed', endedAt: AT - 1000 })]), AT, USAGE))
  expect(failed.border).toBe('#d9534f')
  expect(failed.slot).not.toContain('>?</text>')
})

test('an agent that runs again is no longer asking: its border is its own colour and the "?" is gone', () => {
  const running = row({ status: 'running', endedAt: undefined, startedAt: AT - 10_000, questions: undefined })
  const { slot, border } = explorerSlot(drawTeam(teamOf([running]), AT, USAGE))
  expect(border).toBe(LOOK.explorer.color)
  expect(slot).not.toContain('>?</text>')
})

test('the wire pulses purple back from an agent that asks and out to one woken to answer, in its own colour otherwise', () => {
  const color = LOOK.explorer.color
  expect(PURPLE).not.toBe(color)

  expect(pulseColorOf(row({ questions: ['a'] }), 'back', color)).toBe(ASK)
  expect(pulseColorOf(row({ status: 'running', answering: true }), 'out', color)).toBe(ASK)
  // another direction, or no questions, keeps the role's colour
  expect(pulseColorOf(row({ questions: ['a'] }), 'out', color)).toBe(color)
  expect(pulseColorOf(row({ status: 'running' }), 'out', color)).toBe(color)
  expect(pulseColorOf(row(), 'back', color)).toBe(color)
  expect(pulseColorOf(row({ questions: ['a'] }), undefined, color)).toBe(color)
  expect(pulseColorOf(undefined, 'back', color)).toBe(color)

  const dot = (svg: string, fill: string): boolean => svg.includes(`<circle r="6" fill="${fill}"><animateMotion`)
  const back = drawTeam(teamOf([row({ questions: ['a'], endedAt: AT - 500 })]), AT, USAGE)
  expect(dot(back, PURPLE)).toBe(true)
  const plainBack = drawTeam(teamOf([row({ endedAt: AT - 500 })]), AT, USAGE)
  expect(dot(plainBack, PURPLE)).toBe(false)
  expect(dot(plainBack, color)).toBe(true)
  const out = drawTeam(teamOf([row({ status: 'running', endedAt: undefined, startedAt: AT - 500, answering: true })]), AT, USAGE)
  expect(dot(out, PURPLE)).toBe(true)
  const plainOut = drawTeam(teamOf([row({ status: 'running', endedAt: undefined, startedAt: AT - 500 })]), AT, USAGE)
  expect(dot(plainOut, PURPLE)).toBe(false)
})

// ------------------------------------------------------------ the flow

test('an agent whose report opens with QUESTIONS: stays asking after the afterglow, until a message wakes it', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore', { description: 'Map the repo' })
  await report($, 'a1', 'QUESTIONS:\n1. Which folder?\n2. Which depth?')

  expect(explorerSlot(await drawingOf($)).border).toBe(PURPLE)
  await world.clock.advance(AFTERGLOW_MS + 4000)
  await world.clock.settle()
  const rested = explorerSlot(await drawingOf($))
  expect(rested.border).toBe(PURPLE)
  expect(rested.slot).toContain('>?</text>')

  // the resume: a turn of the same agent starts again
  await $.turn.start({ text: 'src, two levels', turnId: 't2', agentId: 'a1' } as never)
  const woken = explorerSlot(await drawingOf($))
  expect(woken.border).toBe(LOOK.explorer.color)
  expect(woken.slot).not.toContain('>?</text>')
  // woken to answer: its wire's pulse out is purple
  expect(await drawingOf($)).toContain(`<circle r="6" fill="${PURPLE}"><animateMotion`)

  // its next report, a plain one, ends it for good
  await report($, 'a1', 'Mapped it.')
  await world.clock.advance(AFTERGLOW_MS + 1000)
  await world.clock.settle()
  const done = explorerSlot(await drawingOf($))
  expect(done.border).toBe('#2e2a3a')
  expect(done.slot).not.toContain('>?</text>')
})

test('a woken agent that is not asking again does not pulse purple, and one that asks again is asking again', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await report($, 'a1', 'QUESTIONS:\n- first?')
  await $.turn.start({ text: 'answer', turnId: 't2', agentId: 'a1' } as never)
  await report($, 'a1', 'PREGUNTAS:\n- ¿segunda?')

  expect(explorerSlot(await drawingOf($)).border).toBe(PURPLE)
  expect(await shows($, 'desktop', /pregunta \(1\)/)).toBe(true)
})

test('the pane row reads "pregunta (N)" with a "?" mark, and unfolding lists the questions first', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore', { description: 'Map the repo' })
  await report($, 'a1', 'QUESTIONS:\n1. Which folder?\n2. Which depth?')

  for (const surface of SURFACES) {
    expect(await shows($, surface, /\? explorer/)).toBe(true)
    expect(await shows($, surface, /✓ explorer/)).toBe(false)
    expect(await shows($, surface, /^pregunta \(2\)$/)).toBe(true)
  }
  await unfold($, 'a1')
  for (const surface of SURFACES) {
    expect(await shows($, surface, /^1\. Which folder\?$/)).toBe(true)
    expect(await shows($, surface, /^2\. Which depth\?$/)).toBe(true)
  }

  await $.turn.start({ text: 'go', turnId: 't2', agentId: 'a1' } as never)
  for (const surface of SURFACES) {
    expect(await shows($, surface, /\? explorer/)).toBe(false)
    expect(await shows($, surface, /^pregunta/)).toBe(false)
    expect(await shows($, surface, /^1\. Which folder\?$/)).toBe(false)
    expect(await shows($, surface, /● explorer/)).toBe(true)
  }
})

test('the row says "asking (N)" in English', { options: { language: 'en' } }, async ($, on) => {
  boot(on, { env: { LANG: 'en_US.UTF-8' } })
  await start($)
  await spawn($, 'a1', 'Explore')
  await report($, 'a1', 'QUESTIONS:\n- one\n- two\n- three')

  expect(await shows($, 'desktop', /^asking \(3\)$/)).toBe(true)
})

test('a report that is not asking, or an end that is not an answer, leaves no questions', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await finish($, 'a1', 'answer')
  expect(explorerSlot(await drawingOf($)).slot).not.toContain('>?</text>')
  expect(await shows($, 'desktop', /^pregunta/)).toBe(false)

  await spawn($, 'a2', 'Explore')
  await report($, 'a2', 'QUESTIONS:\n- x?', 'error')
  expect(await shows($, 'desktop', /^pregunta/)).toBe(false)
  expect(await shows($, 'desktop', /✗ explorer/)).toBe(true)
})

test('questions are read from the whole report, not from its clipped copy', async ($, on) => {
  boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  // a header far below the first 2000 characters would be lost to the clip; the header opens the report, the list is long
  const items = Array.from({ length: 5 }, (_, i) => `${i + 1}. ${'y'.repeat(600)}`).join('\n')
  await report($, 'a1', `QUESTIONS:\n${items}`)

  expect(await shows($, 'desktop', /^pregunta \(5\)$/)).toBe(true)
})

// ------------------------------------------------------------ the notification

test('a long run that ends asking raises "tiene preguntas", not "terminó"; a short one raises nothing', async ($, on) => {
  const world = boot(on)
  await start($)
  await spawn($, 'a1', 'Explore')
  await report($, 'a1', 'QUESTIONS:\n- quick?')
  expect(world.notified).toEqual([])

  await spawn($, 'a2', 'Explore', { description: 'Long job' })
  await world.clock.advance(65_000)
  await report($, 'a2', 'QUESTIONS:\n- slow?')
  expect(world.notified).toEqual(['explorer tiene preguntas tras 1m 5s: Long job'])
})
