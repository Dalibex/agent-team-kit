// The team rules the pane can put in the person's CLAUDE.md, and the pure logic that places them there.
// The text is for the model: it stays English in both languages.

/** The markers existing users already have in their files: the block between them is the pane's to replace or remove. */
export const RULES_START = '<!-- agent-team:reglas:inicio -->'
export const RULES_END = '<!-- agent-team:reglas:fin -->'

/** The rules as 0.8.4 shipped them: a block holding them is upgraded in place. */
const RULES_0_8_4 = `## Agent team

I have a team of agents from the agent-team plugin: \`agent-team:explorer\`
(Haiku, read-only search), \`agent-team:implementer\` (Sonnet, makes agreed
changes and verifies them), \`agent-team:tester\` (Sonnet, writes and runs
tests, touches only test files) and \`agent-team:reviewer\` (Opus, reviews
without editing). You lead them: you plan, brief them, check their work and
decide with me. Delegate as these rules say without asking me first; the
decisions stay mine.

### When to delegate

- **explorer**: when an answer needs reading more than five files, or a
  search in code you have not read this session. Work from its report: do not
  reread the files it cited unless you are about to edit them.
- **implementer**: once a change is agreed (a plan step, a fix I approved)
  and it takes more than a couple of edits. Small edits you make yourself.
- **tester**: after a non-trivial change, to cover it and run the suite. A bug
  it finds in production code is reported to me, and the fix is decided with
  me.
- **reviewer**: before proposing a commit of a non-trivial change. Skip it for
  trivial or mechanical diffs (renames, formatting, typos in docs): it is the
  costliest member.
- Run independent agents in parallel, for example the tester and the reviewer
  on the same finished change. Never two agents editing the same files.
- Don't delegate when it costs more than doing it yourself, and never delegate
  a decision that is mine.

### Briefs

An agent does not see our conversation, so every brief carries what it needs,
under these headings:

- **Goal**: what to achieve, in one or two sentences.
- **Why**: what it is for, and the decision behind it (what we chose and what
  we ruled out).
- **Files**: paths with line ranges to start from, taken from what you or the
  explorer already read, so the agent does not explore again.
- **Done when**: the observable result and the check to run.
- **Limits**: what not to touch; never commit or push.

The plugin adds a \`<team-context>\` block with the project, its branch and the
skills I have picked in the pane. Name in the brief the ones that matter for
the task.

### Questions and follow-ups

- An agent that lacks something stops and answers with \`QUESTIONS:\`. Answer
  what you can by continuing that same agent with SendMessage: it keeps its
  context, which costs far less than a new spawn. What is mine to decide, ask
  me, then continue the agent with my answer.
- To fix or extend an agent's own work, continue it with SendMessage instead
  of spawning a new one.

### Checking their work

- Check what each agent returns (its diff, its test output) before accepting
  it. A report without the command's output is not verified.
- Tell me in one line what each agent did.`

/** The rules, as the model reads them. */
export const RULES_TEXT = `## Agent team

I have a team of agents from the agent-team plugin: \`agent-team:explorer\`
(Haiku, read-only search), \`agent-team:implementer\` (Sonnet, makes agreed
changes and verifies them), \`agent-team:tester\` (Sonnet, writes and runs
tests, touches only test files) and \`agent-team:reviewer\` (Opus, reviews
without editing). You lead them: you plan, brief them, check their work and
decide with me. Delegate as these rules say without asking me first; the
decisions stay mine.

### When to delegate

- **explorer**: when an answer needs reading more than five files, or a
  search in code you have not read this session. Work from its report: do not
  reread the files it cited unless you are about to edit them.
- **implementer**: once a change is agreed (a plan step, a fix I approved)
  and it takes more than a couple of edits. Small edits you make yourself.
- **tester**: after a non-trivial change, to cover it and run the suite.
- **reviewer**: before proposing a commit of a non-trivial change. Skip it for
  trivial or mechanical diffs (renames, formatting, typos in docs): it is the
  costliest member.
- Run independent agents in parallel, for example the tester and the reviewer
  on the same finished change. Never two agents editing the same files.
- Don't delegate when it costs more than doing it yourself, and never delegate
  a decision that is mine.

### Models

The implementer and the tester run on Sonnet. When one task touches security
or authorization, data integrity (transactions, migrations, concurrency), a
public interface, a change across modules or delicate domain logic, launch
that agent with \`model: "opus"\` for that task only, and tell me in one line
what you escalated and why.

### Briefs

An agent does not see our conversation, so every brief carries what it needs,
under these headings:

- **Goal**: what to achieve, in one or two sentences.
- **Why**: what it is for, and the decision behind it (what we chose and what
  we ruled out).
- **Files**: paths with line ranges to start from, taken from what you or the
  explorer already read, so the agent does not explore again.
- **Done when**: the observable result and the check to run.
- **Limits**: what not to touch; never commit or push.

The plugin adds a \`<team-context>\` block with the project, its branch and the
skills I have picked in the pane. Name in the brief the ones that matter for
the task.

### Questions and follow-ups

- An agent that lacks something stops and answers with \`QUESTIONS:\`. Answer
  what you can by continuing that same agent with SendMessage: it keeps its
  context, which costs far less than a new spawn. What is mine to decide, ask
  me, then continue the agent with my answer.
- To fix or extend an agent's own work, continue it with SendMessage instead
  of spawning a new one.

### Fix loop

- A tester failure on agreed behaviour with a clear cause, or a reviewer
  correctness finding with a concrete failure scenario and a fix inside the
  agreed design, goes back to the implementer without asking me. An ambiguity
  in the requirement or the design, and design or style findings, come to me.
- After each fix the tester reruns the suite and the reviewer reviews only the
  fix's diff.
- Stop and ask me when the same failure comes back two rounds in a row
  without progress, and in any case after five rounds. Count the rounds per
  agent; the pane shows them to me as ↻.

### Checking their work

- Check what each agent returns (its diff, its test output) before accepting
  it. A report without the command's output is not verified.
- Tell me in one line what each agent did.`

/** The whole block as it sits in the file: the rules between their markers, lines joined by `eol`. */
export const rulesBlock = (eol = '\n'): string => [RULES_START, ...RULES_TEXT.split('\n'), RULES_END].join(eol)

/** Why a file's markers cannot be trusted. */
export type MarkersWhy = 'noEnd' | 'noStart' | 'duplicated' | 'reversed'

/** Where the markers stand in a file. */
export type RulesFound = { kind: 'none' } | { kind: 'block'; from: number; to: number } | { kind: 'malformed'; why: MarkersWhy }

/** The texts this plugin shipped before the current one: a block holding one of them is the plugin's own, not the person's. */
export const SHIPPED_BEFORE: readonly string[] = [RULES_0_8_4, RULES_0_8_4.replace('QUESTIONS:', 'PREGUNTAS:')]

/** One line of a text: where it starts, where its content ends (line break excluded) and the content. */
type Line = { from: number; to: number; body: string }

const linesOf = (text: string): Line[] => {
  const lines: Line[] = []
  let at = 0
  for (const line of text.split('\n')) {
    const body = line.endsWith('\r') ? line.slice(0, -1) : line
    lines.push({ from: at, to: at + body.length, body })
    at += line.length + 1
  }

  return lines
}

/**
 * The spans of the text inside fenced code blocks (``` or ~~~), fence lines
 * included. A fence that never closes is not a fence, or everything written
 * after it would count as inside it; a backtick fence whose info string holds
 * a backtick (a line like ```foo```) does not open one.
 */
const fencedSpans = (lines: readonly Line[]): { from: number; to: number }[] => {
  const spans: { from: number; to: number }[] = []
  let open: { char: string; size: number; from: number } | undefined
  for (const line of lines) {
    if (open === undefined) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.body)
      const run = m?.[1]
      if (run !== undefined && !(run.startsWith('`') && (m?.[2] ?? '').includes('`'))) {
        open = { char: run.charAt(0), size: run.length, from: line.from }
      }
    } else {
      const run = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line.body)?.[1]
      if (run !== undefined && run.charAt(0) === open.char && run.length >= open.size) {
        spans.push({ from: open.from, to: line.to })
        open = undefined
      }
    }
  }

  return spans
}

/** The lines of a text outside every fenced code block. */
const proseLines = (text: string): Line[] => {
  const lines = linesOf(text)
  const spans = fencedSpans(lines)

  return lines.filter(line => !spans.some(span => line.from >= span.from && line.from <= span.to))
}

/**
 * Finds the block in a file's text. A marker counts only on a line of its own
 * and outside a fenced code block, so rules quoted in a snippet are not the
 * block. `from` is where the start marker's line begins and `to` where the end
 * marker's line ends, its line break excluded.
 */
export const findRules = (text: string): RulesFound => {
  const starts = proseLines(text).filter(line => line.body.trim() === RULES_START)
  const ends = proseLines(text).filter(line => line.body.trim() === RULES_END)
  const start = starts[0]
  const end = ends[0]
  if (start === undefined && end === undefined) return { kind: 'none' }
  if (starts.length > 1 || ends.length > 1) return { kind: 'malformed', why: 'duplicated' }
  if (start === undefined) return { kind: 'malformed', why: 'noStart' }
  if (end === undefined) return { kind: 'malformed', why: 'noEnd' }
  if (end.from < start.from) return { kind: 'malformed', why: 'reversed' }

  return { kind: 'block', from: start.from, to: end.to }
}

/** Where an older team section without the markers starts: its line number and what marks it. */
export type LegacySection = { line: number; heading: string }

const LEGACY_HEADING = /^## (Delegation to agents|Agent team)[ \t]*$/
const LEGACY_PHRASE = 'I have a team of agents in `~/.claude/agents/`'

/** The first old, unmarked team section outside code fences: a `## Delegation to agents` or `## Agent team` heading, or the old sentence. */
export const findLegacy = (text: string): LegacySection | undefined => {
  const all = linesOf(text)
  const prose = new Set(proseLines(text).map(line => line.from))
  for (const [index, line] of all.entries()) {
    if (!prose.has(line.from)) continue
    const heading = LEGACY_HEADING.exec(line.body)
    if (heading !== null) return { line: index + 1, heading: `## ${heading[1] ?? ''}` }
    if (line.body.includes(LEGACY_PHRASE)) return { line: index + 1, heading: LEGACY_PHRASE }
  }

  return undefined
}

/** What to do to the file, and its new text when that is a write. */
export type RulesPlan =
  | { kind: 'create' | 'append' | 'remove'; text: string }
  /** `isEdited`: the block held neither this plugin's text nor one it shipped before. */
  | { kind: 'replace'; text: string; isEdited: boolean }
  | { kind: 'current' }
  | { kind: 'none' }
  | { kind: 'malformed'; why: MarkersWhy }
  /** Markers are in the text but no block can be told from them. */
  | { kind: 'marker' }
  | { kind: 'legacy'; line: number; heading: string }

/** The line break a file uses, so a block added to it reads like the rest. */
const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')

/**
 * What installing the rules does to a file's current text (undefined: no file;
 * a BOM is the caller's to set aside). No file: create it. A block: the same
 * one is current, any other is replaced. No block: if the start marker is in
 * the text anyway, or an old unmarked team section is, nothing is written;
 * else the block is added after a blank line. Malformed markers: nothing.
 */
export const planInstall = (current: string | undefined): RulesPlan => {
  if (current === undefined) return { kind: 'create', text: `${rulesBlock()}\n` }
  const found = findRules(current)
  if (found.kind === 'malformed') return found
  const eol = eolOf(current)
  const block = rulesBlock(eol)
  if (found.kind === 'none') {
    if (current.includes(RULES_START)) return { kind: 'marker' }
    const legacy = findLegacy(current)
    if (legacy !== undefined) return { kind: 'legacy', ...legacy }
    const lead = current === '' ? '' : current.endsWith('\n') ? eol : `${eol}${eol}`

    return { kind: 'append', text: `${current}${lead}${block}${eol}` }
  }
  const region = current.slice(found.from, found.to)
  if (region === block) return { kind: 'current' }
  const inner = region.replace(/\r\n/g, '\n').split('\n').slice(1, -1).join('\n')
  const isEdited = inner !== RULES_TEXT && !SHIPPED_BEFORE.includes(inner)

  return { kind: 'replace', text: `${current.slice(0, found.from)}${block}${current.slice(found.to)}`, isEdited }
}

/**
 * What removing the rules does: the block goes with the line break that ends
 * it and, when it closed the file, the blank line put before it; every other
 * byte stays.
 */
export const planRemove = (current: string | undefined): RulesPlan => {
  if (current === undefined) return { kind: 'none' }
  const found = findRules(current)
  if (found.kind === 'malformed') return found
  if (found.kind === 'none') return { kind: 'none' }
  const eol = eolOf(current)
  let before = current.slice(0, found.from)
  let after = current.slice(found.to)
  if (after.startsWith(eol)) after = after.slice(eol.length)
  else if (after.startsWith('\n')) after = after.slice(1)
  if (after === '' && /\r?\n\r?\n$/.test(before)) before = before.replace(/\r?\n$/, '')

  return { kind: 'remove', text: `${before}${after}` }
}
