import type { SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { LimitWindow, Trail, Usage } from '../types'

export const NO_USAGE: Usage = { at: 0, windows: [] }

/** The two windows a subscription has, in the order the pane shows them. */
const ORDER = ['five_hour', 'seven_day']

/** Where a reading turns amber, then red, and where a toast warns of it. */
export const WARN_AT = [80, 95] as const

const MINUTE = 60_000
/** Points a trail keeps: about one per turn, the oldest leave first. */
const TRAIL_POINTS = 60
/** Two reset times this close apart name the same window (the API may round). */
const SAME_WINDOW_MS = 10 * MINUTE
/** An unchanged reading is still recorded this often, so a flat stretch shows as flat. */
const FLAT_POINT_MS = 10 * MINUTE
/** The projection reads the rate over this last stretch of the window. */
const RATE_SPAN_MS = 90 * MINUTE
/** And only once the readings span this long and rose at least a point. */
const RATE_MIN_MS = 10 * MINUTE

/** The engine's figures as the pane keeps them: reset times as clock milliseconds. */
export const usageOf = (
  figures: { rateLimits: readonly SessionRateLimit[]; context: SessionContextUsage },
  at: number,
): Usage => {
  const windows: LimitWindow[] = figures.rateLimits
    .map(w => {
      const resetsAt = w.resetsAt === undefined ? Number.NaN : Date.parse(w.resetsAt)

      return Number.isNaN(resetsAt)
        ? { kind: w.kind, percent: w.percentUsed }
        : { kind: w.kind, percent: w.percentUsed, resetsAt }
    })
    .sort((a, b) => rank(a.kind) - rank(b.kind))
  const { tokens, percent, window } = figures.context

  return {
    at,
    windows,
    context: { window, ...(tokens === undefined ? {} : { tokens }), ...(percent === undefined ? {} : { percent }) },
  }
}

/**
 * Adds a reading of the five-hour window to its trail. A new reset starts a
 * new trail; a reading equal to the last is kept only every ten minutes.
 */
export const extendTrail = (trail: Trail | undefined, w: LimitWindow | undefined, at: number): Trail | undefined => {
  if (w === undefined) return trail
  const isSame =
    trail !== undefined &&
    (trail.resetsAt === undefined || w.resetsAt === undefined
      ? trail.resetsAt === w.resetsAt
      : Math.abs(trail.resetsAt - w.resetsAt) < SAME_WINDOW_MS)
  const points = isSame ? trail.points : []
  const last = points[points.length - 1]
  const isNews = last === undefined || last[1] !== w.percent || at - last[0] >= FLAT_POINT_MS

  return {
    ...(w.resetsAt === undefined ? {} : { resetsAt: w.resetsAt }),
    points: isNews ? [...points, [at, w.percent] as [number, number]].slice(-TRAIL_POINTS) : points,
  }
}

/** A trail read back from the store, or undefined when it is not one. */
export const trailFrom = (value: unknown): Trail | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  const { resetsAt, points } = value as { resetsAt?: unknown; points?: unknown }
  if (!Array.isArray(points)) return undefined
  const valid = points.filter(
    (p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number'),
  )

  return { ...(typeof resetsAt === 'number' ? { resetsAt } : {}), points: valid.slice(-TRAIL_POINTS) }
}

/**
 * When the window reaches 100 % at the rate of its last ninety minutes, or
 * undefined: too few readings, no rise, or it resets before then.
 */
export const projectionOf = (trail: Trail | undefined): number | undefined => {
  const points = trail?.points ?? []
  const last = points[points.length - 1]
  if (last === undefined || last[1] >= 100) return undefined
  const first = points.find(p => last[0] - p[0] <= RATE_SPAN_MS) ?? last
  const span = last[0] - first[0]
  const rise = last[1] - first[1]
  if (span < RATE_MIN_MS || rise < 1) return undefined
  const eta = last[0] + ((100 - last[1]) * span) / rise

  return trail?.resetsAt !== undefined && eta >= trail.resetsAt ? undefined : eta
}

const rank = (kind: string): number => {
  const i = ORDER.indexOf(kind)

  return i === -1 ? ORDER.length : i
}

/** A window's name in full, for the Usage card. */
export const windowName = (kind: string): string =>
  kind === 'five_hour' ? 'Ventana 5 h' : kind === 'seven_day' ? 'Semana' : kind === 'spend_limit' ? 'Gasto' : kind

/** A window's name in two or three characters, for the summary strip. */
export const windowShort = (kind: string): string =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind === 'spend_limit' ? '$' : kind.slice(0, 3)

export type Level = 'calm' | 'warm' | 'hot'

export const levelOf = (percent: number): Level =>
  percent >= WARN_AT[1] ? 'hot' : percent >= WARN_AT[0] ? 'warm' : 'calm'

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const twoDigits = (n: number): string => String(n).padStart(2, '0')

/**
 * When a window resets, in words: "en 2 h 13 min" within a day, else the
 * weekday and the local time ("el jue a las 14:00").
 */
export const resetText = (resetsAt: number | undefined, at: number): string | undefined => {
  if (resetsAt === undefined) return undefined
  const left = resetsAt - at
  if (left <= 0) return 'se reinicia ya'
  const minutes = Math.ceil(left / 60_000)
  if (minutes < 60) return `se reinicia en ${minutes} min`
  if (minutes < 24 * 60) {
    const rest = minutes % 60

    return `se reinicia en ${Math.floor(minutes / 60)} h${rest === 0 ? '' : ` ${rest} min`}`
  }
  const when = new Date(resetsAt)

  return `se reinicia el ${DAYS[when.getDay()]} a las ${twoDigits(when.getHours())}:${twoDigits(when.getMinutes())}`
}

/**
 * When a window resets, as a wall clock: "18:40" the same day, "jue 14:00"
 * another. It changes only when the day does, so a drawing that shows it
 * does not redraw every minute.
 */
export const resetClock = (resetsAt: number | undefined, at: number): string | undefined => {
  if (resetsAt === undefined) return undefined
  const when = new Date(resetsAt)
  const hhmm = `${twoDigits(when.getHours())}:${twoDigits(when.getMinutes())}`

  return when.toDateString() === new Date(at).toDateString() ? hhmm : `${DAYS[when.getDay()]} ${hhmm}`
}

/** A percentage as the pane writes it: whole above 10, one decimal below. */
export const percentText = (percent: number): string =>
  `${percent >= 10 || Number.isInteger(percent) ? Math.round(percent) : percent.toFixed(1)}%`

/** A key per window, threshold and reset: one warning each, and a new window warns afresh. */
const warnKey = (w: LimitWindow, threshold: number): string => `${w.kind}@${threshold}@${w.resetsAt ?? 'sin-reinicio'}`

/**
 * The thresholds the windows crossed that were not warned of yet: one per
 * window, the highest it crossed, so a jump from 70 to 97 warns once.
 */
export const newWarnings = (
  windows: readonly LimitWindow[],
  warned: readonly string[],
): { keys: string[]; lines: string[] } => {
  const keys: string[] = []
  const lines: string[] = []
  for (const w of windows) {
    if (w.kind !== 'five_hour' && w.kind !== 'seven_day') continue
    const crossed = WARN_AT.filter(t => w.percent >= t)
    if (crossed.length === 0) continue
    const fresh = crossed.filter(t => !warned.includes(warnKey(w, t)))
    if (fresh.length === 0) continue
    keys.push(...crossed.map(t => warnKey(w, t)))
    lines.push(`${windowName(w.kind)} al ${percentText(w.percent)}`)
  }

  return { keys, lines }
}

/** Drops the warnings of windows that have reset: they can never match again. */
export const pruneWarned = (warned: readonly string[], at: number): string[] =>
  warned.filter(key => {
    const reset = Number(key.split('@')[2])

    return Number.isNaN(reset) || reset > at
  })

/** A thousand-separated count, short above ten thousand: 8.4k, 120k, 1.2M. */
export const kilo = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
      : String(n)

/** A token count rounded for a tight spot, as a window size is spoken of: 62k, 400k, 1M, 1.5M. */
export const roundTokens = (n: number): string =>
  n >= 1_000_000 ? `${Number((n / 1_000_000).toFixed(1))}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
