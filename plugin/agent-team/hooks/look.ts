// The look shared by the drawing and the cards: colours, the pixel font, small SVG pieces and text helpers.

import type { AgentStatus, Role, Tokens } from '../types'
import { kilo } from './usage'
import { t } from './i18n'
import type { Level } from './usage'
import type { JobRow } from './state'

/** The width of a meter, in cells, within the pane's columns. */
export const meterCols = (columns: number): number => Math.max(8, Math.min(22, columns - 30))

/** How each role looks and sounds. */
export const LOOK: Record<Role, { color: string; name: string; sound: string }> = {
  main: { color: '#ff7a45', name: 'Claude', sound: 'sounds/main.wav' },
  explorer: { color: '#2ee6c5', name: 'explorer', sound: 'sounds/explorer.wav' },
  implementer: { color: '#5b8def', name: 'implementer', sound: 'sounds/implementer.wav' },
  tester: { color: '#f472b6', name: 'tester', sound: 'sounds/tester.wav' },
  reviewer: { color: '#c084fc', name: 'reviewer', sound: 'sounds/reviewer.wav' },
  other: { color: '#8fbf6a', name: 'agent', sound: 'sounds/main.wav' },
}
/** A role's name as the pane shows it: the team's roles keep their own, any other agent is "agent" in the language. */
export const nameOf = (role: Role): string => (role === 'other' ? t('role.other') : LOOK[role].name)
export const FAIL_SOUND = 'sounds/fail.wav'
/** The neon palette: the title's gradient and the confetti. */
export const BRAND = ['#ff7a45', '#ff4fa3', '#a66bff', '#2ee6c5'] as const
export const ASLEEP = '#4a4858'
export const INK = '#1c1c1c'
export const CARD = '#120f1a'
export const WARN = '#ffb020'

export const STATUS_MARK: Record<AgentStatus, string> = { running: '●', done: '✓', failed: '✗', stopped: '■' }
export const statusText = (status: AgentStatus): string => t(`status.${status}`)
export const tokenLine = (tokens: Tokens): string =>
  t('tokens.line', {
    input: kilo(tokens.input),
    output: kilo(tokens.output),
    cacheWrite: kilo(tokens.cacheWrite),
    cacheRead: kilo(tokens.cacheRead),
  })

export const seconds = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))

  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ------------------------------------------------------------- the title

/** A 5x7 pixel font: A-Z, 0-9 and the hyphen; a space draws nothing. */
export const FONT: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  // For the usage band's figures; the title never draws them.
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
}

export const wordWidth = (word: string, p: number): number => (word.length * 6 - 1) * p

/** How the pane names the team: the word drawn in pixels and the plain-text title. */
export type Branding = { word: string; isCustom: boolean; title: string; statusPrefix: string }

/** The longest word the title draws; a longer name is cut. */
export const NAME_MAX = 12

/**
 * Turns the `teamName` option into the pane's names. Empty or unset reads
 * "AGENT TEAM"; a name keeps its own spelling in text and is drawn in the
 * pixel font without accents (Ártico → ARTICO).
 */
export const brandingOf = (raw: unknown): Branding => {
  const name = typeof raw === 'string' ? raw.trim().slice(0, 24) : ''
  const word = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
  if (word === '') return { word: 'AGENT', isCustom: false, title: 'Agent team', statusPrefix: 'agent team' }

  return { word, isCustom: true, title: `${name} team`, statusPrefix: `${name.toLowerCase()} team` }
}

/**
 * Set once per load from the plugin's options: changing the option reloads
 * the module, so this never changes under a running module.
 */
export let branding: Branding = brandingOf(undefined)

/** The word as pixel rects, unfilled: the group around it paints them. */
export const pixelWord = (word: string, x: number, y: number, p: number): string => {
  const out: string[] = []
  ;[...word].forEach((ch, i) =>
    (FONT[ch] ?? []).forEach((bits, row) =>
      [...bits].forEach((bit, col) => {
        if (bit === '1') out.push(`<rect x="${x + (i * 6 + col) * p}" y="${y + row * p}" width="${p}" height="${p}"/>`)
      }),
    ),
  )

  return out.join('')
}

/** A word in neon of one colour: the same dark shadow, then the glowing colour. */
export const neonTint = (word: string, x: number, y: number, p: number, color: string): string =>
  `<g fill="#2a1240" transform="translate(${p * 0.6} ${p * 0.6})">${pixelWord(word, x, y, p)}</g>` +
  `<g fill="${color}" filter="url(#dx-glow)">${pixelWord(word, x, y, p)}</g>`

/** A word in neon: a dark offset shadow, then the glowing gradient. */
export const neonWord = (word: string, x: number, y: number, p: number): string =>
  `<g fill="#2a1240" transform="translate(${p * 0.6} ${p * 0.6})">${pixelWord(word, x, y, p)}</g>` +
  `<g fill="url(#dx-ink)" filter="url(#dx-glow)">${pixelWord(word, x, y, p)}</g>`

/** A four-pointed star that twinkles. */
export const twinkle = (x: number, y: number, r: number, color: string, dur: number, begin: number): string =>
  `<path d="M${x},${y - r} L${x + r * 0.28},${y - r * 0.28} L${x + r},${y} L${x + r * 0.28},${y + r * 0.28} L${x},${y + r} L${x - r * 0.28},${y + r * 0.28} L${x - r},${y} L${x - r * 0.28},${y - r * 0.28}Z" fill="${color}" opacity="0">` +
  `<animate attributeName="opacity" values="0;1;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></path>`

/**
 * Faint dots, placed the same every draw so the drawing stays stable; they
 * twinkle only while the team is live, to spare the idle pane's CPU.
 */
export const starfield = (W: number, H: number, isLive: boolean): string => {
  let seed = 7
  const rnd = (): number => {
    seed = (seed * 9301 + 49297) % 233280

    return seed / 233280
  }
  const out: string[] = []
  for (let i = 0; i < 18; i += 1) {
    const x = Math.round(10 + rnd() * (W - 20))
    const y = Math.round(8 + rnd() * (H - 16))
    const dur = (2 + rnd() * 3).toFixed(1)
    const begin = (rnd() * 3).toFixed(1)
    out.push(
      isLive
        ? `<rect x="${x}" y="${y}" width="2" height="2" fill="#ffffff" opacity="0.08">` +
            `<animate attributeName="opacity" values="0.06;0.45;0.06" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></rect>`
        : `<rect x="${x}" y="${y}" width="2" height="2" fill="#ffffff" opacity="0.18"/>`,
    )
  }

  return out.join('')
}

// ------------------------------------------------------------ the cards

/** The glyph meters are drawn with: one glyph lit and dim, so both halves line up. */
export const TRACK = '━'
export const LEVEL_COLOR: Record<Level, string> = { calm: BRAND[3], warm: WARN, hot: '#ff5c5c' }
export const CONTEXT_COLOR = '#a66bff'
export const SKILL_COLOR = '#ffd166'
/** Branches a pull request is usually opened into, never from: no "Crear PR" on them. */
export const DEFAULT_BRANCHES = new Set(['main', 'master', 'develop', 'dev', 'trunk'])
/** Past this share of the context window, the pane offers to compact it. */
export const COMPACT_AT = 80

export const GIT_COLOR = '#c084fc'
export const JOB_MARK: Record<JobRow['state'], string> = { running: '⟳', done: '✓', failed: '✗', stopped: '■' }
/** The frames of a running row's spinner: one per tick. */
export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
/** The width of a running job's bar, in cells. */
export const JOB_METER = 8

/** A moment as the local wall clock shows it: 21:05. */
export const clockText = (ms: number): string => {
  const d = new Date(ms)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Sets the team name the drawing and the texts use: once per load, from the options. */
export function setBranding(next: Branding): void {
  branding = next
}

/** A card's title drawn as the team's: a small image, its markup and its size in CSS pixels. */
export type TitlePlate = { source: string; width: number; height: number }

/** Plates already drawn, by word and colour: they never change, so each is built once. */
const plates = new Map<string, TitlePlate>()

/**
 * A card's title in the drawing's own style: the word in neon pixel letters
 * of the card's colour, and a star that twinkles beside it. Drawn as a plain
 * image (no frame), so four of them cost next to nothing.
 */
export const titlePlate = (word: string, color: string): TitlePlate => {
  const key = `${word}|${color}`
  const kept = plates.get(key)
  if (kept !== undefined) return kept
  const p = 2.4
  const height = 24
  const width = Math.ceil(wordWidth(word, p)) + 26
  const y = (height - 7 * p) / 2
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    '<defs><filter id="dx-glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="1.6" result="b"/>' +
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    neonTint(word, 3, y, p, color) +
    twinkle(width - 10, height / 2, 5, '#ffd166', 2.6, 0.4) +
    '</svg>'
  const plate = { source, width, height }
  plates.set(key, plate)

  return plate
}
