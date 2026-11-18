import type { EngineInterface } from 'claude-code'

import type { Checks, GitInfo, GitOp } from '../types'

export const NO_GIT: GitInfo = {
  state: 'unknown',
  at: 0,
  remoteAt: 0,
  isLoading: false,
  ahead: 0,
  behind: 0,
  dirty: 0,
  reviewRequested: 0,
  mine: 0,
  ops: [],
}

/** git answers at once; gh goes to the network, so it gets longer. */
const GIT_TIMEOUT_MS = 5_000
const GH_TIMEOUT_MS = 15_000
/** The fields `gh pr status` is asked for: what the GitHub card draws, nothing more. */
const PR_FIELDS = 'number,title,url,isDraft,reviewDecision,statusCheckRollup'
const RUN_FIELDS = 'workflowName,status,conclusion,url'

/** What `git status --porcelain=v2 --branch` says: the branch, ahead/behind and changed files. */
export const parseStatus = (stdout: string): Pick<GitInfo, 'branch' | 'ahead' | 'behind' | 'dirty'> => {
  let branch: string | undefined
  let ahead = 0
  let behind = 0
  let dirty = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      branch = head === '(detached)' ? 'HEAD suelto' : head
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      ahead = Number(m?.[1] ?? 0)
      behind = Number(m?.[2] ?? 0)
    } else if (line.trim() !== '' && !line.startsWith('#')) {
      dirty += 1
    }
  }

  return { branch, ahead, behind, dirty }
}

/** owner/name from a GitHub remote URL, https or ssh; undefined for any other host. */
export const repoOf = (url: string): string | undefined =>
  /github\.com[:/]+([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1]

type Rollup = {
  status?: string
  conclusion?: string
  state?: string
  name?: string
  context?: string
  startedAt?: string
  /** A check run's log page. */
  detailsUrl?: string
  /** A commit status's page. */
  targetUrl?: string
}

/**
 * Counts a PR's checks: passed, failed and still running. A check run again
 * counts once, by its latest run. The first that failed keeps its name and
 * the page of its log, so the card can link straight to what broke.
 */
export const checksOf = (rollup: readonly Rollup[] | undefined): Checks => {
  const latest = new Map<string, Rollup>()
  for (const check of rollup ?? []) {
    const name = check.name ?? check.context ?? String(latest.size)
    const before = latest.get(name)
    if (before === undefined || (check.startedAt ?? '') >= (before.startedAt ?? '')) latest.set(name, check)
  }
  const checks: Checks = { ok: 0, failed: 0, pending: 0 }
  for (const [name, check] of latest) {
    const verdict = (check.conclusion ?? check.state ?? '').toUpperCase()
    const isDone = check.status === undefined || check.status.toUpperCase() === 'COMPLETED'
    if (!isDone || verdict === '' || verdict === 'PENDING' || verdict === 'EXPECTED') checks.pending += 1
    else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(verdict)) checks.ok += 1
    else {
      checks.failed += 1
      const url = check.detailsUrl ?? check.targetUrl
      if (checks.firstFailure === undefined && url !== undefined && url !== '') checks.firstFailure = { name, url }
    }
  }

  return checks
}

type PrJson = {
  number: number
  title: string
  url: string
  isDraft?: boolean
  reviewDecision?: string
  statusCheckRollup?: Rollup[]
}

/** What `gh pr status --json` answers: the branch's PR and the two counts. */
export const parsePrStatus = (stdout: string): Pick<GitInfo, 'pr' | 'reviewRequested' | 'mine'> => {
  const json = JSON.parse(stdout) as { currentBranch?: PrJson | null; createdBy?: unknown[]; needsReview?: unknown[] }
  const current = json.currentBranch ?? undefined

  return {
    reviewRequested: json.needsReview?.length ?? 0,
    mine: json.createdBy?.length ?? 0,
    ...(current === undefined
      ? {}
      : {
          pr: {
            number: current.number,
            title: current.title,
            url: current.url,
            isDraft: current.isDraft === true,
            review: current.reviewDecision ?? '',
            checks: checksOf(current.statusCheckRollup),
          },
        }),
  }
}

/** The last workflow run `gh run list --json` lists, if any. */
export const parseRun = (stdout: string): GitInfo['run'] => {
  const runs = JSON.parse(stdout) as { workflowName?: string; status?: string; conclusion?: string; url?: string }[]
  const run = runs[0]

  return run === undefined
    ? undefined
    : { name: run.workflowName ?? 'CI', status: run.status ?? '', conclusion: run.conclusion ?? '', url: run.url ?? '' }
}

/** Whether GitHub still has work running: a check or the branch's last run. */
export const isCiRunning = (git: GitInfo): boolean =>
  (git.pr?.checks.pending ?? 0) > 0 || (git.pr === undefined && git.run !== undefined && git.run.status !== 'completed')

/**
 * Whether the CI that was running at one read has finished at the next, on
 * the same PR or the same workflow run, and how: for a toast and a sound.
 */
export const ciFinished = (before: GitInfo, after: GitInfo): { isOk: boolean; text: string } | undefined => {
  if (after.state !== 'ok' || !isCiRunning(before) || isCiRunning(after)) return undefined
  if (before.pr !== undefined && after.pr !== undefined && before.pr.number === after.pr.number) {
    const { ok, failed } = after.pr.checks

    return failed > 0
      ? { isOk: false, text: `CI ✗ en #${after.pr.number}: ${failed === 1 ? '1 check falla' : `${failed} checks fallan`}` }
      : { isOk: true, text: `CI ✓ en #${after.pr.number}: ${ok} check${ok === 1 ? '' : 's'} en verde` }
  }
  if (before.pr === undefined && after.pr === undefined && after.run !== undefined && before.run?.url === after.run.url) {
    const isOk = after.run.conclusion === 'success'

    return { isOk, text: `CI ${isOk ? '✓' : '✗'} ${after.run.name} en ${after.branch ?? 'la rama'}` }
  }

  return undefined
}

/** One line for what gh said went wrong, without its noise. */
const ghProblem = (stderr: string): string => {
  if (/auth login|not logged|authentication/i.test(stderr)) return 'gh no tiene sesión: ejecuta gh auth login'
  if (/could not resolve|network|timeout|dial tcp/i.test(stderr)) return 'GitHub no responde (¿sin conexión?)'
  const line = stderr.split('\n').map(l => l.trim()).find(l => l !== '')

  return line === undefined ? 'gh no respondió' : line.slice(0, 120)
}

/**
 * Reads the repository the session works in. git answers locally and is
 * always asked; gh goes to GitHub and is asked only when `withRemote`, its
 * last figures kept otherwise. Never throws: a failure is a state.
 */
// A function declaration, not an arrow: the engine follows `$` across an
// import only into a declaration.
export async function readGit($: EngineInterface, before: GitInfo, withRemote: boolean): Promise<GitInfo> {
  const at = await $.clock.now()
  let status
  try {
    status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { timeoutMs: GIT_TIMEOUT_MS })
  } catch {
    return { ...before, state: 'error', error: 'git no está instalado o no respondió', at, isLoading: false }
  }
  if (status.exitCode !== 0) {
    const isOutside = /not a git repository/i.test(status.stderr)

    return {
      ...NO_GIT,
      ops: before.ops,
      state: isOutside ? 'none' : 'error',
      ...(isOutside ? {} : { error: status.stderr.trim().split('\n')[0]?.slice(0, 120) ?? 'git falló' }),
      at,
    }
  }
  const local = parseStatus(status.stdout)
  const remote = await $.process
    .run(['git', 'remote', 'get-url', 'origin'], { timeoutMs: GIT_TIMEOUT_MS })
    .then(r => (r.exitCode === 0 ? repoOf(r.stdout) : undefined))
    .catch(() => undefined)
  const sameBranch = before.branch === local.branch && before.repo === remote
  const kept: GitInfo = {
    ...before,
    ...local,
    ...(sameBranch ? {} : { pr: undefined, run: undefined, remoteAt: 0 }),
    state: 'ok',
    error: undefined,
    repo: remote,
    at,
    isLoading: false,
  }
  // A new branch or repository makes the kept GitHub figures someone else's.
  const askRemote = withRemote || !sameBranch || before.remoteAt === 0
  if (!askRemote || remote === undefined) return kept

  try {
    const [prs, runs] = await Promise.all([
      $.process.run(['gh', 'pr', 'status', '--json', PR_FIELDS], { timeoutMs: GH_TIMEOUT_MS }),
      local.branch === undefined
        ? undefined
        : $.process.run(['gh', 'run', 'list', '--branch', local.branch, '--limit', '1', '--json', RUN_FIELDS], {
            timeoutMs: GH_TIMEOUT_MS,
          }),
    ])
    if (prs.exitCode !== 0) return { ...kept, remoteAt: at, remoteError: ghProblem(prs.stderr) }
    const pr = parsePrStatus(prs.stdout)
    const run = runs !== undefined && runs.exitCode === 0 ? parseRun(runs.stdout) : undefined

    return { ...kept, ...pr, pr: pr.pr, run, remoteAt: at, remoteError: undefined }
  } catch {
    return { ...kept, remoteAt: at, remoteError: 'gh no está instalado o no respondió' }
  }
}

/** What a Bash result's `gitOperation` says Claude did, as one line for the card. */
export const opsOf = (
  op:
    | {
        commit?: { sha: string; kind: string; branch?: string }
        push?: { branch: string }
        branch?: { ref: string; action: string }
        pr?: { number: number; url?: string; action: string }
      }
    | undefined,
  at: number,
): GitOp[] => {
  if (op === undefined) return []
  const out: GitOp[] = []
  if (op.commit !== undefined) {
    const verb = op.commit.kind === 'amended' ? 'amend' : op.commit.kind === 'cherry-picked' ? 'cherry-pick' : 'commit'
    out.push({ at, text: `${verb} ${op.commit.sha.slice(0, 7)}${op.commit.branch === undefined ? '' : ` en ${op.commit.branch}`}` })
  }
  if (op.push !== undefined) out.push({ at, text: `push a ${op.push.branch}` })
  if (op.branch !== undefined) out.push({ at, text: `${op.branch.action === 'merged' ? 'merge' : 'rebase'} de ${op.branch.ref}` })
  if (op.pr !== undefined) {
    const action = PR_ACTION[op.pr.action] ?? op.pr.action
    out.push({ at, text: `PR #${op.pr.number} ${action}`, ...(op.pr.url === undefined ? {} : { url: op.pr.url }) })
  }

  return out
}

const PR_ACTION: Record<string, string> = {
  created: 'creada',
  edited: 'editada',
  merged: 'fusionada',
  commented: 'comentada',
  closed: 'cerrada',
  reopened: 'reabierta',
  ready: 'lista para revisar',
  draft: 'pasada a borrador',
  'auto-merge-enabled': 'con auto-merge',
  'auto-merge-disabled': 'sin auto-merge',
}

/** How gh spells a review decision, in the card's words. */
export const reviewText = (review: string): string | undefined =>
  review === 'APPROVED'
    ? 'aprobada'
    : review === 'CHANGES_REQUESTED'
      ? 'piden cambios'
      : review === 'REVIEW_REQUIRED'
        ? 'falta revisión'
        : undefined
