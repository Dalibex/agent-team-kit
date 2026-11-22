import { expect, test } from 'claude-code/testing'

import { checksOf, ciFinished, ciPollMs, isCiRunning, NO_GIT, parsePrStatus, parseStatus, repoOf } from '../hooks/github'
import { setLanguage } from '../hooks/i18n'
import { classify, jobTitle, looksFailed, outputPathOf, progressOf } from '../hooks/jobs'
import {
  extendTrail,
  newWarnings,
  projectionOf,
  pruneWarned,
  resetClock,
  resetText,
  roundTokens,
  trailFrom,
  usageOf,
} from '../hooks/usage'
import type { GitInfo } from '../types'

// These pure functions are asserted in Spanish.
setLanguage('es')

// ------------------------------------------------------------ classify

test('installs are told from builds by their verb', async () => {
  expect(classify('npm install express zod')).toEqual({ kind: 'install', manager: 'npm', target: 'express, zod' })
  expect(classify('pnpm i')).toEqual({ kind: 'install', manager: 'pnpm', target: 'dependencias del proyecto' })
  expect(classify('npm run build')).toEqual({ kind: 'build', manager: 'npm', target: 'build' })
  expect(classify('npm test')).toEqual({ kind: 'build', manager: 'npm', target: 'test' })
  expect(classify('mvn -B install -DskipTests')).toEqual({ kind: 'build', manager: 'maven', target: 'install' })
  expect(classify('./mvnw verify')).toEqual({ kind: 'build', manager: 'maven', target: 'verify' })
})

test('a cd before the command and env assignments are skipped', async () => {
  expect(classify('cd frontend && npm ci')?.manager).toBe('npm')
  expect(classify('CI=1 pnpm add -D vitest')).toEqual({ kind: 'install', manager: 'pnpm', target: 'vitest' })
})

test('pip, winget, docker and git clone are recognised', async () => {
  expect(classify('python -m pip install requests')?.target).toBe('requests')
  expect(classify('winget install --id Git.Git -e')?.kind).toBe('install')
  expect(classify('docker pull postgres:16')).toEqual({ kind: 'download', manager: 'docker', target: 'postgres:16' })
  expect(classify('docker compose up -d db')?.kind).toBe('build')
  expect(classify('git clone https://github.com/a/b.git')?.target).toBe('b')
})

test('a curl that only prints is not a download; one that saves a file is', async () => {
  expect(classify('curl -s https://api.github.com/x')).toBeUndefined()
  expect(classify('curl -L -o out.zip https://example.com/files/kit.zip')?.target).toBe('kit.zip')
})

test('ordinary commands are not jobs', async () => {
  expect(classify('ls -la')).toBeUndefined()
  expect(classify('git status')).toBeUndefined()
  expect(classify('echo npm install')).toBeUndefined()
})

// --------------------------------------------------------------- verdicts

test('an output with a failure verdict fails, whatever the exit code', async () => {
  expect(looksFailed('[INFO] BUILD FAILURE')).toBe(true)
  expect(looksFailed('FAILURE: Build failed with an exception.')).toBe(true)
  expect(looksFailed('npm ERR! code ERESOLVE')).toBe(true)
  expect(looksFailed('ERROR: Could not find a version that satisfies the requirement x')).toBe(true)
  expect(looksFailed('[INFO] BUILD SUCCESS')).toBe(false)
  expect(looksFailed('added 312 packages in 8s')).toBe(false)
})

// -------------------------------------------------------------- progress

test('progress is the last percentage, after carriage returns and colours', async () => {
  expect(progressOf('Downloading 10%\rDownloading 45%\r')).toBe(45)
  expect(progressOf('\u001b[32m 99.5 %\u001b[0m')).toBe(99.5)
})

test('a step count reads as a share when it is the latest news', async () => {
  expect(progressOf('50% fetched\n[3/4] Linking dependencies...')).toBe(75)
  expect(progressOf('nothing to count')).toBeUndefined()
})

test('the output path is read from the background answer', async () => {
  const text =
    'Command running in background with ID: b0y01289g. Output is being written to: C:\\Users\\U\\Temp\\tasks\\b0y01289g.output. You will be notified when it completes'
  expect(outputPathOf(text)).toBe('C:\\Users\\U\\Temp\\tasks\\b0y01289g.output')
  expect(outputPathOf('no path here')).toBeUndefined()
})

// ------------------------------------------------------------------- git

test('git status gives branch, ahead and behind, and changed files', async () => {
  const out = '# branch.oid abc\n# branch.head feat/x\n# branch.upstream origin/feat/x\n# branch.ab +2 -1\n1 .M N... a\n? new.txt\n'
  expect(parseStatus(out)).toEqual({ branch: 'feat/x', ahead: 2, behind: 1, dirty: 2 })
})

test('a detached HEAD is a flag, not a branch with a word for a name', async () => {
  expect(parseStatus('# branch.head (detached)\n? new.txt\n')).toEqual({ detached: true, ahead: 0, behind: 0, dirty: 1 })
  expect(parseStatus('# branch.head main\n').detached).toBeUndefined()
})

test('a GitHub remote names owner/repo over https and ssh; others do not', async () => {
  expect(repoOf('https://github.com/acme/demo-app.git\n')).toBe('acme/demo-app')
  expect(repoOf('git@github.com:acme/demo.git')).toBe('acme/demo')
  expect(repoOf('https://gitlab.com/a/b.git')).toBeUndefined()
})

test('checks count once per name, by their latest run', async () => {
  const checks = checksOf([
    { name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-01-01T10:00:00Z' },
    { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-01-01T11:00:00Z' },
    { name: 'test', status: 'IN_PROGRESS', conclusion: '' },
    { context: 'ci/legacy', state: 'FAILURE' },
    { name: 'skip', status: 'COMPLETED', conclusion: 'SKIPPED' },
  ])
  expect(checks).toEqual({ ok: 2, failed: 1, pending: 1 })
})

test('gh pr status gives the branch PR and the two counts', async () => {
  const out = JSON.stringify({
    currentBranch: {
      number: 42,
      title: 'Add filters',
      url: 'https://github.com/a/b/pull/42',
      isDraft: false,
      reviewDecision: 'REVIEW_REQUIRED',
      statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    },
    createdBy: [{}, {}],
    needsReview: [{}],
  })
  const pr = parsePrStatus(out)
  expect(pr.reviewRequested).toBe(1)
  expect(pr.mine).toBe(2)
  expect(pr.pr?.number).toBe(42)
  expect(pr.pr?.checks).toEqual({ ok: 1, failed: 0, pending: 0 })
  expect(parsePrStatus('{"createdBy":[],"needsReview":[]}').pr).toBeUndefined()
})

// ----------------------------------------------------------------- usage

const HOUR = 60 * 60 * 1000

test('usage keeps reset times as clock milliseconds, five hours first', async () => {
  const at = Date.parse('2026-11-13T12:00:00Z')
  const u = usageOf(
    {
      rateLimits: [
        { kind: 'seven_day', percentUsed: 18 },
        { kind: 'five_hour', percentUsed: 42.5, resetsAt: '2026-11-13T14:13:00Z' },
      ],
      context: { window: 200_000, tokens: 62_000, percent: 31 },
    },
    at,
  )
  expect(u.windows.map(w => w.kind)).toEqual(['five_hour', 'seven_day'])
  expect(u.windows[0]?.resetsAt).toBe(at + 2 * HOUR + 13 * 60 * 1000)
  expect(u.context).toEqual({ window: 200_000, tokens: 62_000, percent: 31 })
})

// ----------------------------------------------------------------- trail

const MIN = 60 * 1000
const five = (percent: number, resetsAt = 10 * HOUR) => ({ kind: 'five_hour', percent, resetsAt })

test('a trail keeps one point per change, and a flat one every ten minutes', async () => {
  let trail = extendTrail(undefined, five(10), 0)
  trail = extendTrail(trail, five(10), 2 * MIN)
  expect(trail?.points).toEqual([[0, 10]])
  trail = extendTrail(trail, five(12), 3 * MIN)
  trail = extendTrail(trail, five(12), 14 * MIN)
  expect(trail?.points).toEqual([
    [0, 10],
    [3 * MIN, 12],
    [14 * MIN, 12],
  ])
})

test('a new reset starts a new trail; a reset a few minutes off is the same window', async () => {
  const trail = extendTrail(undefined, five(40), 0)
  expect(extendTrail(trail, five(41, 10 * HOUR + 2 * MIN), MIN)?.points).toHaveLength(2)
  expect(extendTrail(trail, five(3, 15 * HOUR), MIN)?.points).toEqual([[MIN, 3]])
  expect(extendTrail(trail, undefined, MIN)).toBe(trail)
})

test('the projection extends the last ninety minutes to 100 %, before the reset only', async () => {
  // 20 % to 40 % in an hour: 100 % three hours after the last reading
  const rising = { resetsAt: 10 * HOUR, points: [[HOUR, 20], [2 * HOUR, 40]] as [number, number][] }
  expect(projectionOf(rising)).toBe(5 * HOUR)
  // the same rate, but the window resets first
  expect(projectionOf({ ...rising, resetsAt: 4 * HOUR })).toBeUndefined()
  // too short a stretch, or no rise
  expect(projectionOf({ points: [[0, 20], [5 * MIN, 30]] })).toBeUndefined()
  expect(projectionOf({ points: [[0, 20], [HOUR, 20]] })).toBeUndefined()
  expect(projectionOf(undefined)).toBeUndefined()
})

test('a stored trail is read back only when it has the right shape', async () => {
  expect(trailFrom({ resetsAt: 5, points: [[1, 2], [3, 'x'], [4, 5]] })).toEqual({ resetsAt: 5, points: [[1, 2], [4, 5]] })
  expect(trailFrom('nope')).toBeUndefined()
  expect(trailFrom({ points: 'nope' })).toBeUndefined()
})

// -------------------------------------------------------------------- ci

const ok = (pr?: object, run?: object): GitInfo => ({
  ...NO_GIT,
  state: 'ok',
  branch: 'main',
  ...(pr === undefined ? {} : { pr: pr as GitInfo['pr'] }),
  ...(run === undefined ? {} : { run: run as GitInfo['run'] }),
})
const pr = (pending: number, failed: number) => ({
  number: 42,
  title: 't',
  url: 'u',
  isDraft: false,
  review: '',
  checks: { ok: 3, failed, pending },
})

test('CI that finishes on the same PR is told, green or red; one still running is not', async () => {
  expect(ciFinished(ok(pr(1, 0)), ok(pr(0, 0)))).toEqual({ isOk: true, text: 'CI ✓ en #42: 3 checks en verde' })
  expect(ciFinished(ok(pr(2, 0)), ok(pr(0, 1)))).toEqual({ isOk: false, text: 'CI ✗ en #42: 1 check falla' })
  expect(ciFinished(ok(pr(2, 0)), ok(pr(1, 0)))).toBeUndefined()
  expect(ciFinished(ok(pr(0, 0)), ok(pr(0, 0)))).toBeUndefined()
})

test('a branch run that completes is told by its workflow name', async () => {
  const run = (status: string, conclusion: string) => ({ name: 'CI', status, conclusion, url: 'r1' })
  expect(ciFinished(ok(undefined, run('in_progress', '')), ok(undefined, run('completed', 'success')))).toEqual({
    isOk: true,
    text: 'CI ✓ CI en main',
  })
  expect(
    ciFinished(ok(undefined, run('in_progress', '')), ok(undefined, { ...run('completed', 'success'), url: 'r2' })),
  ).toBeUndefined()
})

test('a reset reads in minutes and hours within a day', async () => {
  expect(resetText(45 * 60 * 1000, 0)).toBe('se reinicia en 45 min')
  expect(resetText(2 * HOUR + 13 * 60 * 1000, 0)).toBe('se reinicia en 2 h 13 min')
  expect(resetText(3 * HOUR, 0)).toBe('se reinicia en 3 h')
  expect(resetText(undefined, 0)).toBeUndefined()
  expect(resetText(30 * HOUR, 0)).toMatch(/^se reinicia el (dom|lun|mar|mié|jue|vie|sáb) a las \d\d:\d\d$/)
})

test('a window warns once per threshold, the highest it crossed', async () => {
  const w = (percent: number) => [{ kind: 'five_hour', percent, resetsAt: 5000 }]
  const first = newWarnings(w(82), [])
  expect(first.lines).toEqual(['Ventana 5 h al 82%'])
  expect(newWarnings(w(85), first.keys).lines).toEqual([])
  const jump = newWarnings(w(97), first.keys)
  expect(jump.lines).toEqual(['Ventana 5 h al 97%'])
  // a jump straight past both thresholds warns once
  expect(newWarnings(w(97), []).lines).toHaveLength(1)
  // a new window (another reset) warns afresh
  expect(newWarnings([{ kind: 'five_hour', percent: 82, resetsAt: 9000 }], first.keys).lines).toHaveLength(1)
})

test('warnings of windows that reset are dropped', async () => {
  const { keys } = newWarnings([{ kind: 'five_hour', percent: 90, resetsAt: 5000 }], [])
  expect(pruneWarned(keys, 4000)).toEqual(keys)
  expect(pruneWarned(keys, 6000)).toEqual([])
})

test('token counts round the way window sizes are spoken of', async () => {
  expect(roundTokens(62_000)).toBe('62k')
  expect(roundTokens(400_000)).toBe('400k')
  expect(roundTokens(1_000_000)).toBe('1M')
  expect(roundTokens(1_500_000)).toBe('1.5M')
  expect(roundTokens(800)).toBe('800')
})

test('a reset reads as a wall clock: the time today, the weekday another day', async () => {
  const at = new Date(2026, 10, 13, 9, 0).getTime()
  expect(resetClock(new Date(2026, 10, 13, 18, 40).getTime(), at)).toBe('18:40')
  expect(resetClock(new Date(2026, 10, 19, 14, 5).getTime(), at)).toBe('jue 14:05')
  expect(resetClock(undefined, at)).toBeUndefined()
})

// ------------------------------------------------------------ v0.8.7: audit

test('two workflows with a job of the same name do not hide a failure', async () => {
  const checks = checksOf([
    { name: 'build', workflowName: 'CI', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-01-01T10:00:00Z' },
    { name: 'build', workflowName: 'Docs', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-01-01T11:00:00Z' },
  ])
  expect(checks).toEqual({ ok: 1, failed: 1, pending: 0 })
})

test('a queued re-run with no start time beats the old failure, whatever the order', async () => {
  const old = { name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', startedAt: '2026-01-01T10:00:00Z' }
  const queued = { name: 'test', status: 'QUEUED', conclusion: '', startedAt: '0001-01-01T00:00:00Z' }
  expect(checksOf([old, queued])).toEqual({ ok: 0, failed: 0, pending: 1 })
  expect(checksOf([queued, old])).toEqual({ ok: 0, failed: 0, pending: 1 })
  expect(checksOf([old, { ...queued, startedAt: '' }])).toEqual({ ok: 0, failed: 0, pending: 1 })
})

test('a required check that was never reported is waiting, not running', async () => {
  const checks = checksOf([
    { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { context: 'required/review', state: 'EXPECTED' },
  ])
  expect(checks).toEqual({ ok: 1, failed: 0, pending: 1, waiting: 1 })
  expect(isCiRunning(ok({ ...pr(0, 0), checks }))).toBe(false)
  expect(isCiRunning(ok(pr(1, 0)))).toBe(true)
})

test('a merged or closed PR has no CI running', async () => {
  expect(isCiRunning(ok({ ...pr(1, 0), ended: 'merged' }))).toBe(false)
  expect(isCiRunning(ok({ ...pr(1, 0), ended: 'closed' }))).toBe(false)
})

test('polling backs off from two to ten minutes and stops after an hour without change', async () => {
  const at = 100 * MIN
  const since = (ago: number) => ({ ...ok(pr(1, 0)), remoteAt: at, ciChangedAt: at - ago })
  expect(ciPollMs(since(0))).toBe(2 * MIN)
  expect(ciPollMs(since(9 * MIN))).toBe(2 * MIN)
  expect(ciPollMs(since(10 * MIN))).toBe(5 * MIN)
  expect(ciPollMs(since(30 * MIN))).toBe(10 * MIN)
  expect(ciPollMs(since(60 * MIN))).toBeUndefined()
  // nothing running: nothing to poll
  expect(ciPollMs({ ...ok(pr(0, 0)), remoteAt: at, ciChangedAt: at })).toBeUndefined()
})

test('dev servers and watchers are not tracked as builds', async () => {
  expect(classify('./mvnw spring-boot:run')).toBeUndefined()
  expect(classify('mvn quarkus:dev')).toBeUndefined()
  expect(classify('./gradlew bootRun')).toBeUndefined()
  expect(classify('docker compose up')).toBeUndefined()
  expect(classify('docker compose up -d')?.kind).toBe('build')
  expect(classify('docker compose up --detach db')?.kind).toBe('build')
  expect(classify('npm run build -- --watch')).toBeUndefined()
  expect(classify('npm run build -- -w')).toBeUndefined()
  expect(classify('npm run build -- --continuous')).toBeUndefined()
  expect(classify('./mvnw clean install')?.kind).toBe('build')
  expect(classify('./gradlew build')?.kind).toBe('build')
})

test('a compose subcommand is read in its own place, not from the command it runs', async () => {
  expect(classify('docker compose exec api sh -c "curl localhost/health/up"')).toBeUndefined()
  expect(classify('docker compose -f ci.yml build')?.target).toBe('build')
  expect(classify('docker-compose pull')?.kind).toBe('download')
})

test('the progress is the one nearest the end, even when the same digits appear earlier', async () => {
  expect(progressOf('Downloading 5%\n[3/5] Building')).toBe(60)
  expect(progressOf('[3/5] Building\nDownloading 5%')).toBe(5)
})

test('a curl that throws its body away is a health check, not a download', async () => {
  expect(classify('curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health')).toBeUndefined()
  expect(classify('curl -o NUL http://localhost:8080/health')).toBeUndefined()
  expect(classify('curl -o $null http://localhost:8080/health')).toBeUndefined()
  expect(classify('curl -o out.zip https://example.com/kit.zip')?.kind).toBe('download')
})

test('Windows shims, bun and python -m pytest are tracked', async () => {
  expect(classify('npm.cmd run build')).toEqual({ kind: 'build', manager: 'npm', target: 'build' })
  expect(classify('pnpm.cmd install')?.kind).toBe('install')
  expect(classify('yarn.cmd add zod')?.manager).toBe('yarn')
  expect(classify('bun install')?.manager).toBe('bun')
  expect(classify('bun run test')?.kind).toBe('build')
  expect(classify('npx.cmd expo install expo-camera')?.kind).toBe('install')
  expect(classify('python3 -m pytest -q')?.manager).toBe('pytest')
  expect(classify('py -m pytest')?.manager).toBe('pytest')
})

test('a job row says what the job works on, in one line', async () => {
  expect(jobTitle({ kind: 'build', manager: 'maven', target: 'clean, install' })).toBe('maven · build · clean, install')
})

// ------------------------------------------------------------ v0.8.7: audit, round 1

test('a run-once flag is not a watcher', async () => {
  expect(classify('npm test -- --watchAll=false')?.kind).toBe('build')
  expect(classify('npm test -- --watch=false')?.kind).toBe('build')
  expect(classify('npm test -- --watch=0')?.kind).toBe('build')
  expect(classify('npm test -- --watch=true')).toBeUndefined()
  expect(classify('npm test -- --watch')).toBeUndefined()
})

test('compose options with a value or with =value do not hide the subcommand', async () => {
  expect(classify('docker compose --progress plain build')?.target).toBe('build')
  expect(classify('docker compose --progress=plain build')?.target).toBe('build')
  expect(classify('docker compose --progress=plain up -d')?.kind).toBe('build')
})

test('a row title leaves out a target that only repeats the kind or the rule’s fallback', async () => {
  const title = (command: string): string => jobTitle(classify(command)!)
  expect(title('npm run build')).toBe('npm · build')
  expect(title('mvn')).toBe('maven · build')
  expect(title('./gradlew')).toBe('gradle · build')
  expect(title('docker compose build')).toBe('compose · build')
  expect(title('npm install')).toBe('npm · instalación')
  expect(title('npm test')).toBe('npm · build · test')
  expect(title('mvn clean install')).toBe('maven · build · clean, install')
})

test('PR checks leave a stamp of each check’s status, so queued to in progress is a change', async () => {
  const out = (status: string) =>
    JSON.stringify({ currentBranch: { number: 1, title: 't', url: 'u', statusCheckRollup: [{ name: 'ci', status, conclusion: '' }] } })
  expect(parsePrStatus(out('QUEUED')).pr?.stamp).not.toBe(parsePrStatus(out('IN_PROGRESS')).pr?.stamp)
  expect(parsePrStatus(out('QUEUED')).pr?.stamp).toBe(parsePrStatus(out('QUEUED')).pr?.stamp)
})

test('a check really in progress is polled every ten minutes for up to six hours; a queued one stops at one', async () => {
  const at = 400 * MIN
  const since = (ago: number, stamp: string) => ({ ...ok({ ...pr(1, 0), stamp }), remoteAt: at, ciChangedAt: at - ago })
  expect(ciPollMs(since(90 * MIN, 'CI/e2e:IN_PROGRESS:'))).toBe(10 * MIN)
  expect(ciPollMs(since(5 * 60 * MIN, 'CI/e2e:IN_PROGRESS:'))).toBe(10 * MIN)
  expect(ciPollMs(since(6 * 60 * MIN, 'CI/e2e:IN_PROGRESS:'))).toBeUndefined()
  expect(ciPollMs(since(90 * MIN, 'CI/e2e:QUEUED:'))).toBeUndefined()
  const run = (status: string) => ({ name: 'CI', status, conclusion: '', url: 'r' })
  expect(ciPollMs({ ...ok(undefined, run('in_progress')), remoteAt: at, ciChangedAt: at - 90 * MIN })).toBe(10 * MIN)
  expect(ciPollMs({ ...ok(undefined, run('queued')), remoteAt: at, ciChangedAt: at - 90 * MIN })).toBeUndefined()
})
