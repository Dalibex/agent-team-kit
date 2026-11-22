// Draws the README's pictures with the plugin's own drawing code: each scene is
// a made-up moment of the team, saved as the same animated SVG the pane shows.
// Run from the repository's root (Node 22.18 or later):
//   node --import ./scripts/readme-images/register.mjs scripts/readme-images/draw.mjs
// Then `scripts/readme-images/png.ps1` turns the cover into the social preview PNG.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const hooks = join(root, 'plugin', 'agent-team', 'hooks')
const load = path => import(new URL(`file:///${join(hooks, path).replace(/\\/g, '/')}`).href)
const { beginLanguage } = await load('i18n.ts')
const { drawTeam } = await load('drawing.ts')

beginLanguage('en')

// A fixed moment, so the pictures do not change from one run to the next.
const AT = Date.UTC(2026, 10, 23, 15, 0)
const MIN = 60 * 1000
const HOUR = 60 * MIN

const idleMain = { status: 'idle', since: 0, calls: 0, log: [], reads: [], hasAskedExplorer: true, openedAt: AT - HOUR }
const workingMain = { ...idleMain, status: 'working', since: AT - 40_000, calls: 7, lastTool: 'Read', lastDetail: 'src/app.ts' }

/** An agent row; `ago` is how long it has run, `endedAgo` how long ago it ended. */
const agent = (id, type, role, description, fields = {}) => ({
  id,
  type,
  role,
  description,
  prompt: '',
  startedAt: AT - (fields.ago ?? 30_000),
  lastActiveAt: AT - 1000,
  calls: 4,
  status: 'running',
  model: role === 'explorer' ? 'claude-haiku-5-5' : role === 'reviewer' ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
  ...(fields.endedAgo === undefined ? {} : { endedAt: AT - fields.endedAgo }),
  ...fields,
})

const team = (main, agents) => ({ agents, shells: [], jobs: [], main, notices: [], seen: [], totals: {} })

const usage = (fiveHour, sevenDay, contextTokens, trail) => ({
  at: AT,
  windows: [
    { kind: 'five_hour', percent: fiveHour, resetsAt: AT + 2 * HOUR + 20 * MIN },
    { kind: 'seven_day', percent: sevenDay, resetsAt: AT + 3 * 24 * HOUR },
  ],
  context: { percent: Math.round((contextTokens / 1_000_000) * 100), tokens: contextTokens, window: 1_000_000 },
  ...(trail === undefined ? {} : { trail }),
})

const questions = ['Keep the old endpoint for one release, or remove it now?', 'Should the migration run inside the deploy?']

const SCENES = {
  // The cover: Claude reading, the explorer just sent off, the implementer at work, the tester just done.
  cover: [
    team(workingMain, [
      agent('a1', 'agent-team:implementer', 'implementer', 'Add the export endpoint', { ago: 95_000 }),
      agent('a2', 'agent-team:tester', 'tester', 'Cover the export endpoint', { ago: 60_000, status: 'done', endedAgo: 900 }),
      agent('a3', 'agent-team:explorer', 'explorer', 'Find every caller of exportCsv', { ago: 800 }),
    ]),
    usage(46, 31, 182_000),
  ],
  // The whole team at work, past every one-shot effect: what the social preview shows.
  working: [
    team(workingMain, [
      agent('w1', 'agent-team:explorer', 'explorer', 'Find every caller of exportCsv', { ago: 20_000 }),
      agent('w2', 'agent-team:implementer', 'implementer', 'Add the export endpoint', { ago: 95_000 }),
      agent('w3', 'agent-team:tester', 'tester', 'Cover the export endpoint', { ago: 45_000 }),
      agent('w4', 'agent-team:reviewer', 'reviewer', 'Review the importer change', { ago: 30_000 }),
    ]),
    usage(46, 31, 182_000),
  ],
  // An agent that stopped to ask: violet slot, "?", its pulse back to Claude.
  asking: [
    team(idleMain, [
      agent('b1', 'agent-team:explorer', 'explorer', 'Map the billing module', { ago: 50_000, status: 'done', endedAgo: 4 * MIN }),
      agent('b2', 'agent-team:reviewer', 'reviewer', 'Review the export change', { ago: 70_000, status: 'done', endedAgo: 900, questions }),
    ]),
    usage(52, 33, 240_000),
  ],
  // Work handed back: confetti and a check over the agents that just finished.
  done: [
    team({ ...idleMain, endedAt: AT - 800, endedOk: true }, [
      agent('c1', 'agent-team:implementer', 'implementer', 'Add the export endpoint', { ago: 120_000, status: 'done', endedAgo: 1200 }),
      agent('c2', 'agent-team:tester', 'tester', 'Cover the export endpoint', { ago: 80_000, status: 'done', endedAgo: 700 }),
    ]),
    usage(58, 35, 260_000),
  ],
  // Near the 5-hour limit: the bar turns red and blinks, and the projection says when it fills.
  limits: [
    team(workingMain, [agent('d1', 'agent-team:implementer', 'implementer', 'Refactor the importer', { ago: 200_000 })]),
    usage(96, 71, 610_000, {
      resetsAt: AT + 2 * HOUR + 20 * MIN,
      points: [
        [AT - 90 * MIN, 70],
        [AT - 60 * MIN, 79],
        [AT - 30 * MIN, 88],
        [AT, 96],
      ],
    }),
  ],
}

const out = join(root, 'docs', 'images')
mkdirSync(out, { recursive: true })
for (const [name, [squad, figures]] of Object.entries(SCENES)) {
  const file = join(out, `${name}.svg`)
  writeFileSync(file, drawTeam(squad, AT, figures))
  console.log(`wrote ${file}`)
}
