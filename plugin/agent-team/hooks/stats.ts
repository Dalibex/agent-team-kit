import type { SessionContextBreakdown } from 'claude-code'

import type { ContextRow, ContextView, StatItem, Stats, Tokens, TurnStat } from '../types'

// The pure part of the usage tab: grouping, bounding and counting. Nothing here
// reads the engine or draws; money is not a figure it knows.

export const STATS_SHAPE = 'stats-1'

export const NO_STATS: Stats = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, turns: 0, compactions: 0, tools: {}, top: [] }

/** Items a list shows before the rest is summed into one line. */
export const TOP_ITEMS = 5
/** Groups, files and agents a breakdown keeps: the biggest ones, so the atom stays small. */
const KEPT_ITEMS = 40
/** Tool names whose result sizes are kept: the biggest ones. */
export const TOOL_KEPT = 30
/** Turns the tab names. */
export const TOP_TURNS = 3
/** A prompt is kept to this many characters: its first words. */
export const PROMPT_CHARS = 60

// ------------------------------------------------------------ the session

/** What a result of a tool call weighs in the context, estimated: its text's length over four. */
export const resultTokens = (ran: { text?: string; result?: unknown }): number => {
  if (typeof ran.text === 'string') return Math.ceil(ran.text.length / 4)
  if (ran.result === undefined) return 0
  try {
    return Math.ceil((typeof ran.result === 'string' ? ran.result : (JSON.stringify(ran.result) ?? '')).length / 4)
  } catch {
    return 0
  }
}

/** Tokens that went in: uncached input, cache writes and cache reads. */
export const inTokens = (s: Pick<Stats, 'input' | 'cacheWrite' | 'cacheRead'>): number => s.input + s.cacheWrite + s.cacheRead

/** The share of the input that came from the cache, as a whole percentage; undefined before any input. */
export const cacheShare = (s: Pick<Stats, 'input' | 'cacheWrite' | 'cacheRead'>): number | undefined => {
  const all = inTokens(s)

  return all === 0 ? undefined : Math.round((s.cacheRead / all) * 100)
}

/** The first words of a prompt, for a turn's line; undefined when it holds none worth showing (a notification, a tag). */
export const promptWords = (text: string): string | undefined => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '' || flat.startsWith('<')) return undefined

  return flat.length > PROMPT_CHARS ? `${flat.slice(0, PROMPT_CHARS - 1)}…` : flat
}

/** The three biggest turns after `turn` joins them, biggest first (the earlier one on a tie). */
export const withTurn = (top: readonly TurnStat[], turn: TurnStat): TurnStat[] =>
  [...top, turn].sort((a, b) => b.tokens - a.tokens || a.n - b.n).slice(0, TOP_TURNS)

/**
 * The stats after one turn ended. Every turn adds to the session's tokens; only
 * Claude's own count as a turn and compete for the most expensive ones.
 */
export const withTurnEnd = (
  s: Stats,
  turn: { isMain: boolean; durationMs: number; tokens: Tokens | undefined },
): Stats => {
  const t = turn.tokens
  if (t === undefined) return turn.isMain ? { ...s, turns: s.turns + 1 } : s
  const added = {
    ...s,
    input: s.input + t.input,
    cacheWrite: s.cacheWrite + t.cacheWrite,
    cacheRead: s.cacheRead + t.cacheRead,
    output: s.output + t.output,
  }
  if (!turn.isMain) return added
  const n = s.turns + 1
  const fresh = t.input + t.output + t.cacheWrite
  const one: TurnStat = { n, tokens: fresh, ms: turn.durationMs, ...(s.prompt === undefined ? {} : { prompt: s.prompt }) }

  return { ...added, turns: n, top: withTurn(s.top, one) }
}

/** The tool results table after one more result: bounded to the biggest `TOOL_KEPT` tools. */
export const withToolResult = (tools: Stats['tools'], name: string, tokens: number): Stats['tools'] => {
  const before = tools[name] ?? { tokens: 0, calls: 0 }
  const next = { ...tools, [name]: { tokens: before.tokens + tokens, calls: before.calls + 1 } }
  const names = Object.keys(next)
  if (names.length <= TOOL_KEPT) return next
  // The smallest goes, but never the tool just counted: a new one must be able to grow.
  const smallest = names.filter(n => n !== name).sort((a, b) => (next[a]?.tokens ?? 0) - (next[b]?.tokens ?? 0))[0]
  if (smallest !== undefined) delete next[smallest]

  return next
}

/** The tools sorted by what their results added, biggest first. */
export const toolItems = (tools: Stats['tools']): StatItem[] =>
  Object.entries(tools)
    .map(([name, one]) => ({ name, tokens: one.tokens, count: one.calls }))
    .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))

// ---------------------------------------------------------- the breakdown

/** Groups by a key, summing tokens and counting items: biggest group first, ties by name. */
export const groupItems = <T extends { tokens: number }>(items: readonly T[], keyOf: (item: T) => string): StatItem[] => {
  const groups = new Map<string, StatItem>()
  for (const item of items) {
    const key = keyOf(item)
    const before = groups.get(key) ?? { name: key, tokens: 0, count: 0 }
    groups.set(key, { name: key, tokens: before.tokens + item.tokens, count: (before.count ?? 0) + 1 })
  }

  return [...groups.values()].sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
}

/** The biggest `n` items and what is left of the rest, summed; `rest` is undefined when everything fits. */
export const topRest = (items: readonly StatItem[], n = TOP_ITEMS): { top: StatItem[]; rest?: { count: number; tokens: number } } => {
  const sorted = [...items].sort((a, b) => b.tokens - a.tokens)
  if (sorted.length <= n) return { top: sorted }
  const rest = sorted.slice(n)

  return { top: sorted.slice(0, n), rest: { count: rest.length, tokens: rest.reduce((sum, one) => sum + one.tokens, 0) } }
}

/** A path as its last two parts, either slash: `C:\Users\ana\proj\CLAUDE.md` is `proj/CLAUDE.md`. */
export const shortPath = (path: string): string => path.replace(/\\/g, '/').split('/').filter(part => part !== '').slice(-2).join('/')

const biggest = (items: StatItem[]): StatItem[] => items.slice(0, KEPT_ITEMS)

/** Memory files by short path; two that shorten alike (a user's and a project's CLAUDE.md) say which they are. */
const memoryItems = (files: readonly { path: string; type: string; tokens: number }[]): StatItem[] => {
  const shorts = files.map(f => shortPath(f.path))

  return files
    .map((f, i) => ({ name: shorts.filter(s => s === shorts[i]).length > 1 ? `${f.type}: ${shorts[i]}` : (shorts[i] ?? ''), tokens: f.tokens }))
    .sort((a, b) => b.tokens - a.tokens)
}

/** The engine's summary breakdown, grouped and trimmed to what the tab draws. */
export const contextOf = (raw: SessionContextBreakdown): ContextView => {
  const rows: ContextRow[] = raw.categories
    .filter(c => c.kind !== 'deferred' && !c.isDeferred && c.tokens > 0)
    .map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind as ContextRow['kind'] }))
  const loaded = raw.mcpTools.filter(m => m.isLoaded)

  return {
    used: raw.totalTokens,
    window: raw.rawMaxTokens > 0 ? raw.rawMaxTokens : raw.maxTokens,
    rows,
    skills: biggest(groupItems(raw.skills?.skillFrontmatter ?? [], s => s.pluginName ?? String(s.source))),
    mcp: biggest(groupItems(loaded, m => m.serverName)),
    mcpDeferred: raw.mcpTools.length - loaded.length,
    memory: biggest(memoryItems(raw.memoryFiles)),
    agents: biggest(raw.agents.map(a => ({ name: a.agentType, tokens: a.tokens })).sort((a, b) => b.tokens - a.tokens)),
  }
}

/** The share of the window in use, as a whole percentage. */
export const contextPercent = (c: Pick<ContextView, 'used' | 'window'>): number =>
  c.window <= 0 ? 0 : Math.round((c.used / c.window) * 100)

/**
 * How many of `width` cells each row gets, by the largest remainder: the cells
 * add up to `width`, and a row that holds anything keeps at least one while
 * there are cells for it.
 */
export const barCells = <T extends { tokens: number }>(rows: readonly T[], width: number): (T & { cells: number })[] => {
  const total = rows.reduce((sum, r) => sum + r.tokens, 0)
  if (total <= 0 || width <= 0) return rows.map(r => ({ ...r, cells: 0 }))
  const exact = rows.map(r => (r.tokens / total) * width)
  const cells = exact.map(x => Math.floor(x))
  let left = width - cells.reduce((sum, c) => sum + c, 0)
  const order = exact.map((x, i) => ({ i, rem: x - Math.floor(x) })).sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    cells[i] = (cells[i] ?? 0) + 1
    left -= 1
  }
  // A thin row is still seen: it takes a cell from the widest.
  for (let i = 0; i < rows.length; i += 1) {
    if ((cells[i] ?? 0) > 0 || (rows[i]?.tokens ?? 0) <= 0) continue
    const widest = cells.reduce((best, c, j) => (c > (cells[best] ?? 0) ? j : best), 0)
    if ((cells[widest] ?? 0) <= 1) break
    cells[widest] = (cells[widest] ?? 0) - 1
    cells[i] = 1
  }

  return rows.map((r, i) => ({ ...r, cells: cells[i] ?? 0 }))
}
