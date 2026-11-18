// The drawing: the team as pixel sprites wired to Claude, and the usage column at its right.

import type { AgentRow, AgentStatus, Role, Team, Usage } from '../types'
import { t } from './i18n'
import { levelOf, percentText, projectionOf, resetClock, roundTokens, windowName } from './usage'
import { ASLEEP, BRAND, branding, CARD, CONTEXT_COLOR, esc, INK, LEVEL_COLOR, LOOK, neonTint, neonWord, nameOf, pixelWord, starfield, statusText, twinkle, WARN, wordWidth } from './look'
import { AFTERGLOW_MS, familyOf, isAlive, isOverReading, isShellRunning, PULSE_MS } from './state'

// ---------------------------------------------------------------- sprites

export type Mood = 'asleep' | 'awake' | 'busy'

/** Two eyes that blink now and then; open, closed lines while asleep. */
export const eyes = (x: number, y: number, s: number, isAsleep: boolean, dur: string): string => {
  if (isAsleep) {
    return [2, 6]
      .map(col => `<rect x="${x + col * s}" y="${y + 4 * s}" width="${2 * s}" height="${s}" fill="${INK}"/>`)
      .join('')
  }
  const top = y + 3 * s
  const shut = y + 3.8 * s
  const times = 'keyTimes="0;0.9;0.95;1"'

  return [3, 6]
    .map(
      col =>
        `<rect x="${x + col * s}" y="${top}" width="${s}" height="${2 * s}" fill="${INK}">` +
        `<animate attributeName="height" values="${2 * s};${2 * s};${0.4 * s};${2 * s}" ${times} dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y" values="${top};${top};${shut};${top}" ${times} dur="${dur}" repeatCount="indefinite"/></rect>`,
    )
    .join('')
}

/** Little z's drifting up from a sleeper. */
export const snore = (x: number, y: number, s: number): string =>
  [0, 1, 2]
    .map(
      i =>
        `<text x="${x + 9 * s}" y="${y + 2 * s}" font-size="${9 + i * 2}" font-weight="bold" fill="#8f8bb0" opacity="0">z` +
        `<animate attributeName="opacity" values="0;0.85;0" dur="3.6s" begin="${i * 1.2}s" repeatCount="indefinite"/>` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${1.5 * s} ${-3 * s}" dur="3.6s" begin="${i * 1.2}s" repeatCount="indefinite"/></text>`,
    )
    .join('')

/** Each role's prop and its own animation. */
export const gear = (x: number, y: number, s: number, role: Role, mood: Mood): string => {
  const isAwake = mood !== 'asleep'
  const isBusy = mood === 'busy'
  const px = (col: number, row: number, w: number, h: number, fill: string) =>
    `<rect x="${x + col * s}" y="${y + row * s}" width="${w * s}" height="${h * s}" fill="${fill}"/>`
  switch (role) {
    case 'main': {
      // antenna with a blinking tip; rings ripple off it while Claude works
      const tip =
        `<rect x="${x + 4.5 * s}" y="${y - 2 * s}" width="${s}" height="${s}" fill="#ffd166">` +
        `<animate attributeName="opacity" values="1;0.25;1" dur="${isBusy ? '0.5s' : '1.6s'}" repeatCount="indefinite"/></rect>`
      const ring = isBusy
        ? `<circle cx="${x + 5 * s}" cy="${y - 1.5 * s}" r="${s}" fill="none" stroke="#ffd166" stroke-width="1.5">` +
          `<animate attributeName="r" values="${0.5 * s};${2.6 * s}" dur="1s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values="0.9;0" dur="1s" repeatCount="indefinite"/></circle>`
        : ''

      return px(5, -1, 1, 2, '#f3a56b') + tip + ring
    }
    case 'explorer': {
      // a torch whose beam sweeps the dark
      const tx = x + 10 * s
      const ty = y + 4.5 * s
      const torch = px(9, 4, 1, 1, isAwake ? '#ffd166' : '#6b6878')
      if (!isAwake) return torch

      return (
        torch +
        `<g><polygon points="${tx},${ty} ${tx + 5 * s},${ty - 2 * s} ${tx + 5 * s},${ty + 2 * s}" fill="#ffd166" opacity="0.3">` +
        `<animate attributeName="opacity" values="0.38;0.12;0.38" dur="1.2s" repeatCount="indefinite"/></polygon>` +
        `<animateTransform attributeName="transform" type="rotate" values="-16 ${tx} ${ty};16 ${tx} ${ty};-16 ${tx} ${ty}" dur="${isBusy ? '1.8s' : '3s'}" repeatCount="indefinite"/></g>`
      )
    }
    case 'implementer': {
      // a hard hat, and a hammer that strikes sparks while it builds
      const hat = px(2, 0, 6, 1, isAwake ? '#ffd166' : '#6b6878') + px(1, 1, 8, 1, isAwake ? '#f4b740' : '#5d5a6b')
      const hx = x + 9.5 * s
      const hy = y + 5.5 * s
      const hammer =
        `<rect x="${x + 9.25 * s}" y="${y + 2.5 * s}" width="${0.5 * s}" height="${3 * s}" fill="${isAwake ? '#b07a45' : '#5d5a6b'}"/>` +
        `<rect x="${x + 8.5 * s}" y="${y + 1.8 * s}" width="${2 * s}" height="${1.1 * s}" fill="${isAwake ? '#d6dde8' : '#6b6878'}"/>`
      if (!isAwake) return hat + hammer
      const dur = isBusy ? 0.6 : 1.4
      const swing =
        `<g>${hammer}<animateTransform attributeName="transform" type="rotate" values="-30 ${hx} ${hy};65 ${hx} ${hy};-30 ${hx} ${hy}" keyTimes="0;0.3;1" dur="${dur}s" repeatCount="indefinite"/></g>`
      const sparks = [
        { col: 12.2, row: 4.2 },
        { col: 12.9, row: 5.4 },
        { col: 11.8, row: 6.1 },
      ]
        .map(
          ({ col, row }) =>
            `<rect x="${x + col * s}" y="${y + row * s}" width="${0.5 * s}" height="${0.5 * s}" fill="#ffd166" opacity="0">` +
            `<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.28;0.34;0.6" dur="${dur}s" repeatCount="indefinite"/></rect>`,
        )
        .join('')

      return hat + swing + sparks
    }
    case 'reviewer': {
      // glasses that glint, and a page it reads line by line
      const frame = (col: number) =>
        `<rect x="${x + (col - 0.5) * s}" y="${y + 2.5 * s}" width="${2 * s}" height="${2 * s}" fill="none" stroke="${isAwake ? '#f1f1f1' : '#8a879c'}" stroke-width="1.5"/>`
      const glasses = frame(3) + frame(6) + px(4.5, 3.5, 1, 0.25, isAwake ? '#f1f1f1' : '#8a879c')
      const glint = isAwake
        ? `<rect x="${x + 2.7 * s}" y="${y + 2.7 * s}" width="${0.5 * s}" height="${0.5 * s}" fill="#ffffff" opacity="0">` +
          `<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.8;0.86;1" dur="2.6s" repeatCount="indefinite"/></rect>`
        : ''
      const page =
        `<rect x="${x + 9.6 * s}" y="${y + 3 * s}" width="${2.4 * s}" height="${3.4 * s}" rx="1" fill="${isAwake ? '#e9e6f5' : '#5d5a6b'}"/>` +
        [3.6, 4.4, 5.2, 6.0].map(r => px(9.9, r, 1.8, 0.22, isAwake ? '#9a96b5' : '#4a4858')).join('')
      const scan = isAwake
        ? `<rect x="${x + 9.6 * s}" y="${y + 3.3 * s}" width="${2.4 * s}" height="${0.5 * s}" fill="${LOOK.reviewer.color}" opacity="0.55">` +
          `<animate attributeName="y" values="${y + 3.3 * s};${y + 5.8 * s};${y + 3.3 * s}" dur="${isBusy ? '1s' : '2.2s'}" repeatCount="indefinite"/></rect>`
        : ''

      return page + scan + glasses + glint
    }
    case 'tester': {
      // a test tube in hand: it bubbles while the tests run
      const tube =
        `<rect x="${x + 9.4 * s}" y="${y + 2.4 * s}" width="${1.6 * s}" height="${0.4 * s}" fill="${isAwake ? '#e9e6f5' : '#6b6878'}"/>` +
        `<rect x="${x + 9.6 * s}" y="${y + 2.8 * s}" width="${1.2 * s}" height="${3.6 * s}" rx="${0.6 * s}" fill="${isAwake ? '#2b2440' : '#3a3746'}" stroke="${isAwake ? '#e9e6f5' : '#6b6878'}" stroke-width="1"/>` +
        `<rect x="${x + 9.7 * s}" y="${y + 4.4 * s}" width="${s}" height="${1.9 * s}" rx="${0.5 * s}" fill="${isAwake ? '#7cf29a' : '#4a4858'}"/>`
      if (!isAwake) return tube
      const dur = isBusy ? 1.1 : 2.2
      const bubbles = [0, 1, 2]
        .map(
          i =>
            `<circle cx="${x + (9.9 + (i % 2) * 0.5) * s}" cy="${y + 6 * s}" r="${0.25 * s}" fill="#c8ffd6" opacity="0">` +
            `<animate attributeName="cy" values="${y + 6 * s};${y + 1.2 * s}" dur="${dur}s" begin="${(i * dur) / 3}s" repeatCount="indefinite"/>` +
            `<animate attributeName="opacity" values="0;0.9;0" dur="${dur}s" begin="${(i * dur) / 3}s" repeatCount="indefinite"/></circle>`,
        )
        .join('')

      return tube + bubbles
    }
    case 'other':
      return isAwake
        ? `<rect x="${x + 5 * s}" y="${y}" width="${s}" height="${s}" fill="#d8d8d8"><animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/></rect>`
        : px(5, 0, 1, 1, '#6b6878')
  }
}

/**
 * A pixel Claude: a rounded 8x8 body with two eyes and four legs, drawn as
 * rects on a 10x10 grid scaled by `s`, with its role's prop. Awake it bobs
 * and blinks (quicker while busy); asleep it goes grey and snores.
 */
export const sprite = (x: number, y: number, role: Role, mood: Mood, s: number): string => {
  const isAsleep = mood === 'asleep'
  const c = isAsleep ? ASLEEP : LOOK[role].color
  const px = (col: number, row: number, w: number, h: number) =>
    `<rect x="${x + col * s}" y="${y + row * s}" width="${w * s}" height="${h * s}" fill="${c}"/>`
  // body: rows 1..7, with the corners cut for the rounded look, then the legs
  const body = [px(2, 1, 6, 1), px(1, 2, 8, 5), px(2, 7, 6, 1), px(1, 8, 1, 1), px(3, 8, 1, 1), px(6, 8, 1, 1), px(8, 8, 1, 1)].join('')
  const look = eyes(x, y, s, isAsleep, role === 'reviewer' ? '3.4s' : '4.2s')
  // the explorer's eyes glance side to side, looking for things
  const face =
    role === 'explorer' && !isAsleep
      ? `<g>${look}<animateTransform attributeName="transform" type="translate" values="0 0;${0.6 * s} 0;0 0;${-0.6 * s} 0;0 0" dur="3.2s" repeatCount="indefinite"/></g>`
      : look
  const inner = body + face + gear(x, y, s, role, mood)
  if (isAsleep) return inner + snore(x, y, s)

  return `<g>${inner}<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-s / 2};0 0" dur="${mood === 'busy' ? '0.6s' : '2.4s'}" repeatCount="indefinite"/></g>`
}

/** A green check; drawn on with a stroke when `isFresh`, else just there. */
export const check = (x: number, y: number, isFresh: boolean): string =>
  `<path d="M${x - 8},${y} l5,5 l11,-12" fill="none" stroke="#4caf50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"` +
  (isFresh
    ? ` stroke-dasharray="30" stroke-dashoffset="30"><animate attributeName="stroke-dashoffset" from="30" to="0" dur="0.45s" fill="freeze"/></path>`
    : '/>')

/** Confetti in the brand colours: a job well done. A one-shot, so drawn only while fresh. */
export const confetti = (cx: number, cy: number): string =>
  Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2
    const dx = Math.round(Math.cos(angle) * 48)
    const dy = Math.round(Math.sin(angle) * 34)

    return (
      `<rect x="${cx - 2}" y="${cy - 2}" width="4" height="4" fill="${BRAND[i % BRAND.length]}">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy}" dur="0.9s" fill="freeze"/>` +
      `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.6;1" dur="0.9s" fill="freeze"/></rect>`
    )
  }).join('')

/** A wire from the lead's socket down to a slot, with a pulse when asked. */
export const wire = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  isLive: boolean,
  pulse: 'out' | 'back' | undefined,
): string => {
  const ym = y0 + (y1 - y0) / 2
  const d = `M${x0},${y0} L${x0},${ym} L${x1},${ym} L${x1},${y1}`
  const stroke = isLive ? color : '#2e2a3a'
  const dash = isLive
    ? `stroke-dasharray="4 6"><animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.8s" repeatCount="indefinite"/></path>`
    : `/>`
  const path = `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="3" ${dash}`
  const dot =
    pulse === undefined
      ? ''
      : `<circle r="6" fill="${color}"><animateMotion dur="1.1s" repeatCount="indefinite" path="${d}" keyPoints="${pulse === 'out' ? '0;1' : '1;0'}" keyTimes="0;1" calcMode="linear"/></circle>` +
        `<circle r="11" fill="${color}" opacity="0.25"><animateMotion dur="1.1s" repeatCount="indefinite" path="${d}" keyPoints="${pulse === 'out' ? '0;1' : '1;0'}" keyTimes="0;1" calcMode="linear"/></circle>`

  return path + dot
}

export type Slot = { role: Role; agent?: AgentRow; running: number }

/** The slots under the lead: the known roles in the order work flows, then any other agent. */
export const slotsOf = (t: Team): Slot[] => {
  const pick = (role: Role): AgentRow | undefined => {
    const ofRole = t.agents.filter(a => a.role === role)

    return ofRole.find(a => a.status === 'running') ?? ofRole[ofRole.length - 1]
  }
  const runningOf = (role: Role): number => t.agents.filter(a => a.role === role && a.status === 'running').length
  const fixed: Slot[] = (['explorer', 'implementer', 'tester', 'reviewer'] as const).map(role => ({
    role,
    agent: pick(role),
    running: runningOf(role),
  }))
  const others = t.agents
    .filter(a => a.role === 'other' && a.status === 'running')
    .slice(-2)
    .map((agent): Slot => ({ role: 'other', agent, running: 1 }))

  return [...fixed, ...others]
}

export const pulseOf = (a: AgentRow | undefined, at: number): 'out' | 'back' | undefined => {
  if (a === undefined) return undefined
  if (a.status === 'running' && at - a.startedAt < PULSE_MS) return 'out'
  if (a.endedAt !== undefined && at - a.endedAt < PULSE_MS) return 'back'

  return undefined
}

// ------------------------------------------------------------ the usage column

/** The width of the usage column at the right of the team, in drawing units. */
export const BAND_W = 220
export const HUD_MUTED = '#8f8bb0'
export const HUD_TRACK = '#26222f'
/** The gap between two gauges of the column. */
export const BAND_GAP = 18
/** The pixel size of a gauge's label, and the largest of its figure. */
export const LABEL_P = 2.2
export const VALUE_P = 3.4
/** The height of a gauge's LED bar. */
export const BAR_H = 10

/** One gauge of the column: a pixel label, a neon figure, a bar, a note and a tooltip. */
export type Gauge = {
  label: string
  value: string
  percent: number
  color: string
  note: string
  tip: string
  isHot?: boolean
  /** When the window fills at the current rate, as a warning under the note. */
  projection?: string
}

/** What the column shows: the limit windows and the context; dim dashes before any figure. */
export const gaugesOf = (u: Usage, at: number): Gauge[] => {
  if (u.at === 0) {
    return ['5H', '7D', 'CTX'].map(label => ({
      label,
      value: '--',
      percent: 0,
      color: '#5a5670',
      note: t('gauge.waiting'),
      tip: t('gauge.waitingTip'),
    }))
  }
  const gauges: Gauge[] = u.windows.map(w => {
    const level = levelOf(w.percent)
    const when = resetClock(w.resetsAt, at)
    const label =
      w.kind === 'five_hour' ? '5H' : w.kind === 'seven_day' ? '7D' : w.kind === 'spend_limit' ? t('gauge.spend') : w.kind.slice(0, 5).toUpperCase()
    const eta = w.kind === 'five_hour' ? projectionOf(u.trail) : undefined
    const full = eta === undefined ? undefined : resetClock(eta, at)

    // Wall-clock times only: a countdown would change the markup every minute
    // and restart the drawing's animations with it.
    return {
      label,
      value: percentText(w.percent),
      percent: w.percent,
      color: LEVEL_COLOR[level],
      note: when === undefined ? t('gauge.noReset') : t('gauge.resets', { when }),
      tip: [
        t('gauge.used', { window: windowName(w.kind), percent: percentText(w.percent) }),
        ...(when === undefined ? [] : [t('gauge.resetsTip', { when })]),
        ...(full === undefined ? [] : [t('gauge.reaches', { time: full })]),
      ].join(' '),
      isHot: level === 'hot',
      ...(full === undefined ? {} : { projection: t('gauge.projection', { time: full }) }),
    }
  })
  // The context reads as tokens over the window (62K/400K); the bar keeps the share.
  const ctx = u.context
  if (ctx !== undefined) {
    const percent = ctx.percent ?? 0
    gauges.push({
      label: 'CTX',
      value: `${ctx.tokens === undefined ? '--' : roundTokens(ctx.tokens)}/${roundTokens(ctx.window)}`.toUpperCase(),
      percent,
      color: percent >= 85 ? WARN : CONTEXT_COLOR,
      note: t('ctx.note'),
      tip: t('ctx.tip', {
        used: ctx.tokens === undefined ? t('ctx.unmeasured') : t('tokens.count', { n: roundTokens(ctx.tokens) }),
        window: roundTokens(ctx.window),
        percent: percentText(percent),
      }),
    })
  }

  return gauges
}

/**
 * A bar of LED segments, lit up to `percent`, brighter towards the head.
 * While live the head beats and a glint runs along the lit part; a hot bar
 * blinks even when idle, since it is a warning.
 */
export const ledBar = (x: number, y: number, w: number, percent: number, color: string, isLive: boolean, isHot: boolean): string => {
  const gap = 2
  const h = BAR_H
  const n = Math.max(8, Math.min(20, Math.floor((w + gap) / 8)))
  const segW = (w - gap * (n - 1)) / n
  const lit = percent <= 0 ? 0 : Math.max(1, Math.min(n, Math.round((percent / 100) * n)))
  const out: string[] = []
  for (let k = 0; k < n; k += 1) {
    const sx = (x + k * (segW + gap)).toFixed(1)
    if (k >= lit) {
      out.push(`<rect x="${sx}" y="${y}" width="${segW.toFixed(1)}" height="${h}" rx="1.5" fill="${HUD_TRACK}"/>`)
      continue
    }
    const glow = (0.55 + 0.45 * ((k + 1) / lit)).toFixed(2)
    const beat =
      isLive && k === lit - 1
        ? `<animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite"/>`
        : ''
    out.push(
      `<rect x="${sx}" y="${y}" width="${segW.toFixed(1)}" height="${h}" rx="1.5" fill="${color}" opacity="${glow}">${beat}</rect>`,
    )
  }
  let bar = out.join('')
  if (isHot) bar = `<g>${bar}<animate attributeName="opacity" values="1;0.45;1" dur="0.9s" repeatCount="indefinite"/></g>`
  const litW = lit * (segW + gap) - gap
  const glint =
    isLive && lit > 0
      ? `<rect x="${x}" y="${y}" width="6" height="${h}" fill="#ffffff" opacity="0.35">` +
        `<animate attributeName="x" values="${x};${(x + litW - 6).toFixed(1)}" dur="1.8s" repeatCount="indefinite"/></rect>`
      : ''

  return bar + glint
}

/** The height of a gauge's top row: its figure at full size. */
export const ROW_H = 7 * VALUE_P

/** How tall a gauge stands: its label row, its bar, its note and its warning. */
export const gaugeHeight = (g: Gauge): number => ROW_H + 8 + BAR_H + 17 + (g.projection === undefined ? 0 : 16)

/** The column: a dashed seam beside the team, then the gauges stacked and centred, each with its tooltip. */
export const usageColumn = (gauges: Gauge[], x: number, H: number, isLive: boolean): string => {
  const out: string[] = [
    `<line x1="${x}" y1="18" x2="${x}" y2="${H - 18}" stroke="url(#dx-ink)" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="2 5"/>`,
  ]
  const x0 = x + 16
  const x1 = x + BAND_W - 14
  const inner = x1 - x0
  const total = gauges.reduce((sum, g) => sum + gaugeHeight(g), 0) + BAND_GAP * Math.max(0, gauges.length - 1)
  let y = Math.max(16, (H - total) / 2)
  for (const g of gauges) {
    const h = gaugeHeight(g)
    // Label and figure share a row, bottoms aligned; the figure shrinks before it would touch the label.
    const room = inner - wordWidth(g.label, LABEL_P) - 12
    const vp = Math.max(1.6, Math.min(VALUE_P, room / Math.max(1, g.value.length * 6 - 1)))
    const barY = y + ROW_H + 8
    const noteY = barY + BAR_H + 15
    out.push(
      `<g><title>${esc(g.tip)}</title>`,
      `<rect x="${x0 - 8}" y="${y - 8}" width="${inner + 16}" height="${h + 8}" rx="9" fill="#ffffff" fill-opacity="0.025"/>`,
      `<g fill="${HUD_MUTED}">${pixelWord(g.label, x0, y + ROW_H - 7 * LABEL_P, LABEL_P)}</g>`,
      neonTint(g.value, x1 - wordWidth(g.value, vp), y + ROW_H - 7 * vp, vp, g.color),
      ledBar(x0, barY, inner, g.percent, g.color, isLive, g.isHot === true),
      `<text x="${x0}" y="${noteY}" font-size="12" fill="${HUD_MUTED}">${esc(g.note)}</text>`,
    )
    if (g.projection !== undefined) {
      out.push(`<text x="${x0}" y="${noteY + 16}" font-size="12" fill="${WARN}">${esc(g.projection)}</text>`)
    }
    out.push('</g>')
    y += h + BAND_GAP
  }

  return out.join('')
}

/**
 * The whole drawing. It depends on `at` only through windows (a pulse, an
 * afterglow, the day a limit resets) so that ticking seconds do not change
 * the markup and restart its animations.
 */
export const drawTeam = (squad: Team, at: number, u: Usage): string => {
  const slots = slotsOf(squad)
  // The surface caps the drawing's height and takes the width from the aspect
  // ratio, so the layout is wide and low: two tight rows, the title flanking
  // the lead, and the usage column at the right instead of under the slots,
  // so the drawing fills the pane's width and its sprites stay big.
  const s = 6
  const TW = Math.max(480, Math.round(slots.length * 150))
  const W = TW + BAND_W
  const leadTop = 12
  const leadH = 108
  const leadW = 120
  const slotTop = leadTop + leadH + 34
  const boxH = 110
  const H = slotTop + boxH + 12
  const colW = TW / slots.length
  const leadX = TW / 2
  const boxW = Math.min(132, colW - 10)
  const fs = 15
  // The title's shimmer and the stars move only while something is live: the
  // blur over hundreds of pixels is the costly part of an idle pane.
  const isLive = isAlive(squad, at)
  const out: string[] = []

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-monospace, Menlo, Consolas, monospace">`,
    '<defs>',
    `<linearGradient id="dx-ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0" spreadMethod="reflect">` +
      BRAND.map((c, i) => `<stop offset="${(i / (BRAND.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('') +
      (isLive
        ? `<animateTransform attributeName="gradientTransform" type="translate" values="0 0;${W / 2} 0;0 0" dur="7s" repeatCount="indefinite"/>`
        : '') +
      '</linearGradient>',
    '<filter id="dx-glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '</defs>',
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${CARD}" stroke="url(#dx-ink)" stroke-opacity="0.45" stroke-width="2"/>`,
    starfield(W, H, isLive),
  )

  // the title, flanking the lead: the team's name on its left, TEAM on its
  // right; a long name gets smaller pixels so it fits its side
  {
    const left = branding.word
    const right = 'TEAM'
    const room = leadX - leadW / 2 - 22 - 14
    const p = Math.min(3.5, room / (left.length * 6 - 1))
    const pr = 3.5
    const mid = leadTop + leadH / 2 - 4
    const ty = mid - 3.5 * p
    const lx = leadX - leadW / 2 - 22 - wordWidth(left, p)
    const rx = leadX + leadW / 2 + 22
    out.push(neonWord(left, lx, ty, p), neonWord(right, rx, mid - 3.5 * pr, pr))
    out.push(
      twinkle(rx + wordWidth(right, pr) + 12, mid - 3.5 * pr - 2, 6, '#ffd166', 2.4, 0),
      twinkle(lx - 10, ty + 7 * p + 4, 4, BRAND[3], 3.1, 1.2),
    )
    if (branding.isCustom) {
      out.push(
        `<text x="${lx + wordWidth(left, p)}" y="${ty + 7 * p + 16}" text-anchor="end" font-size="10" letter-spacing="2" fill="#8f8bb0">AGENT SQUAD</text>`,
      )
    }
  }

  // the lead: lit while its own turn runs or a background shell of its is alive
  const shellsAlive = squad.shells.some(sh => sh.owner === undefined && isShellRunning(sh, at))
  const isWorking = squad.main.status === 'working' || shellsAlive
  const anyRunning = squad.agents.some(a => a.status === 'running')
  out.push(
    `<rect x="${leadX - leadW / 2}" y="${leadTop}" width="${leadW}" height="${leadH}" rx="12" fill="${isWorking ? '#241a22' : '#1a1622'}" stroke="${isWorking || anyRunning ? LOOK.main.color : '#5a3a2a'}" stroke-width="2"/>`,
    sprite(leadX - 5 * s, leadTop + 14, 'main', isWorking ? 'busy' : 'awake', s),
    `<text x="${leadX}" y="${leadTop + 80}" text-anchor="middle" font-size="${fs}" fill="${LOOK.main.color}">Claude</text>`,
  )
  if (isOverReading(squad.main)) {
    const bx = leadX + leadW / 2 - 4
    const by = leadTop + 4
    out.push(
      `<g><title>${esc(overReadTitle(squad.main.reads.length))}</title>` +
        `<circle cx="${bx}" cy="${by}" r="9" fill="${WARN}"><animate attributeName="r" values="8;10;8" dur="1.2s" repeatCount="indefinite"/></circle>` +
        `<text x="${bx}" y="${by + 4.5}" text-anchor="middle" font-size="13" font-weight="bold" fill="${INK}">!</text></g>`,
    )
  }
  out.push(heartbeat(leadX - leadW / 2 + 14, leadTop + leadH - 16, leadW - 28, LOOK.main.color, isWorking ? 'running' : undefined, squad.main.calls))

  // wires and slots
  slots.forEach((slot, i) => {
    const cx = colW * i + colW / 2
    const a = slot.agent
    const isRunning = a?.status === 'running'
    const isGlowing = a?.endedAt !== undefined && at - a.endedAt < AFTERGLOW_MS
    const color = LOOK[slot.role].color
    out.push(wire(leadX, leadTop + leadH, cx, slotTop, color, isRunning, pulseOf(a, at)))

    const border =
      a === undefined
        ? '#2e2a3a'
        : a.status === 'running'
          ? color
          : a.status === 'failed'
            ? '#d9534f'
            : a.status === 'stopped'
              ? '#5d5a6b'
              : '#3d6b3d'
    const mood: Mood = isRunning ? 'busy' : isGlowing && a?.status !== 'stopped' ? 'awake' : 'asleep'
    const left = cx - boxW / 2
    const tip = a === undefined ? t('slot.idle', { name: nameOf(slot.role) }) : `${nameOf(slot.role)}: ${a.description} (${statusText(a.status)})`
    // One-shot effects (confetti, the shake, the check drawn on) live only in
    // the pulse window: a redraw later in the afterglow would replay them.
    const isFresh = a?.endedAt !== undefined && at - a.endedAt < PULSE_MS
    let body = sprite(cx - 5 * s, slotTop + 14, slot.role, mood, s)
    if (isGlowing && a?.status === 'failed') {
      // a shake and a red mark: something went wrong
      if (isFresh) {
        body = `<g>${body}<animateTransform attributeName="transform" type="translate" values="-3 0;3 0;-3 0;3 0;0 0" dur="0.5s" repeatCount="2"/></g>`
      }
      body += `<text x="${left + boxW - 14}" y="${slotTop + 24}" text-anchor="middle" font-size="18" font-weight="bold" fill="#ff5c5c">!</text>`
    }
    if (isGlowing && a?.status === 'done') {
      body += (isFresh ? confetti(cx, slotTop + 44) : '') + check(left + boxW - 18, slotTop + 18, isFresh)
    }
    out.push(
      `<g><title>${esc(tip)}</title>`,
      `<rect x="${left}" y="${slotTop}" width="${boxW}" height="${boxH}" rx="12" fill="${isRunning ? '#1a1d24' : '#16131e'}" stroke="${border}" stroke-width="2"/>`,
      body,
      `<text x="${cx}" y="${slotTop + 86}" text-anchor="middle" font-size="${fs}" fill="${isRunning ? color : '#8a879c'}">${esc(nameOf(slot.role))}</text>`,
    )
    const model = familyOf(a?.model)
    if (model !== undefined) {
      out.push(`<text x="${left + 9}" y="${slotTop + 15}" font-size="10" fill="#8a879c">${esc(model)}</text>`)
    }
    if (slot.running > 1) {
      out.push(`<text x="${left + boxW - 9}" y="${slotTop + 16}" text-anchor="end" font-size="12" font-weight="bold" fill="${color}">×${slot.running}</text>`)
    }
    out.push(heartbeat(left + 14, slotTop + boxH - 16, boxW - 28, color, a?.status, a?.calls ?? 0), '</g>')
  })
  out.push(usageColumn(gaugesOf(u, at), TW, H, isLive), '</svg>')

  return out.join('')
}

/** The bar under a sprite: sweeping while it works, full and coloured once it ended. */
export const heartbeat = (x: number, y: number, w: number, color: string, status: AgentStatus | undefined, calls: number): string => {
  const h = 7
  const sweep = Math.min(30, w)
  const track = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#26222f"/>`
  if (status === 'running') {
    const beat = Math.min(w, 14 + Math.floor(calls / 3) * 24)

    return (
      track +
      `<rect x="${x}" y="${y}" width="${beat}" height="${h}" rx="${h / 2}" fill="${color}" opacity="0.5"/>` +
      `<rect x="${x}" y="${y}" width="${sweep}" height="${h}" rx="${h / 2}" fill="${color}">` +
      `<animate attributeName="x" from="${x}" to="${x + w - sweep}" dur="1.4s" repeatCount="indefinite"/></rect>`
    )
  }
  if (status === undefined) return track
  const fill = status === 'failed' ? '#d9534f' : status === 'stopped' ? '#5d5a6b' : '#4caf50'

  return track + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>`
}

/** The over-reading warning's text, for the drawing's badge and the pane's tooltip. */
export const overReadTitle = (reads: number): string => t('warn.overread.title', { n: reads })

/** The usage column in words, for a reader that cannot see the drawing. */
export const usageAlt = (u: Usage): string => {
  if (u.at === 0) return t('alt.usage.waiting')
  const eta = projectionOf(u.trail)
  const parts = [
    ...u.windows.map(w => `${windowName(w.kind)} ${percentText(w.percent)}`),
    ...(eta === undefined ? [] : [t('alt.usage.projection', { time: resetClock(eta, u.at) ?? '' })]),
    ...(u.context?.tokens === undefined
      ? []
      : [t('alt.usage.context', { used: roundTokens(u.context.tokens), window: roundTokens(u.context.window) })]),
  ]

  return `${parts.join(', ')}.`
}
