import type { EngineInterface } from 'claude-code'

import type { Checks, GitInfo, GitOp } from '../types'
import { t, tn } from './i18n'
import type { Key } from './i18n'

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
/** git's messages in English, whatever the person's language: the one we read is its "not a repository". */
const GIT_ENV = { LC_ALL: 'C', LANGUAGE: 'C' }
/** The fields `gh pr status` is asked for: what the GitHub card draws, nothing more. */
const PR_FIELDS = 'number,title,url,isDraft,reviewDecision,statusCheckRollup,state'
const RUN_FIELDS = 'workflowName,status,conclusion,url'

/** What `git status --porcelain=v2 --branch` says: the branch, ahead/behind and changed files. */
export const parseStatus = (stdout: string): Pick<GitInfo, 'branch' | 'detached' | 'ahead' | 'behind' | 'dirty'> => {
  let branch: string | undefined
  let detached: boolean | undefined
  let ahead = 0
  let behind = 0
  let dirty = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      // A detached HEAD has no branch to name: the flag says so, and the pane words it.
      detached = head === '(detached)' ? true : undefined
      branch = head === '(detached)' ? undefined : head
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      ahead = Number(m?.[1] ?? 0)
      behind = Number(m?.[2] ?? 0)
    } else if (line.trim() !== '' && !line.startsWith('#')) {
      dirty += 1
    }
  }

  return { branch, detached, ahead, behind, dirty }
}

/** owner/name from a GitHub remote URL, https or ssh; undefined for any other host. */
export const repoOf = (url: string): string | undefined =>
  /github\.com[:/]+([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1]

type Rollup = {
  status?: string
  conclusion?: string
  state?: string
  name?: string
  /** The workflow a check run belongs to: two workflows may each have a job of the same name. */
  workflowName?: string
  context?: string
  startedAt?: string
  /** A check run's log page. */
  detailsUrl?: string
  /** A commit status's page. */
  targetUrl?: string
}

/**
 * When a check started, as text that sorts: gh writes a start that has not
 * happened as empty or as the year 1, and a check still to run is the newest.
 */
const startedKey = (check: Rollup): string => {
  const at = check.startedAt ?? ''
  const isDone = check.status === undefined || check.status.toUpperCase() === 'COMPLETED'

  return !isDone && (at === '' || at.startsWith('0001-')) ? '￿' : at
}

/**
 * Counts a PR's checks: passed, failed and still running. A check run again
 * counts once, by its latest run. The first that failed keeps its name and
 * the page of its log, so the card can link straight to what broke.
 */
export const checksOf = (rollup: readonly Rollup[] | undefined): Checks => {
  const latest = new Map<string, Rollup>()
  for (const check of rollup ?? []) {
    const key = `${check.workflowName ?? ''}/${check.name ?? check.context ?? String(latest.size)}`
    const before = latest.get(key)
    if (before === undefined || startedKey(check) >= startedKey(before)) latest.set(key, check)
  }
  const checks: Checks = { ok: 0, failed: 0, pending: 0 }
  for (const check of latest.values()) {
    const name = check.name ?? check.context ?? ''
    const verdict = (check.conclusion ?? check.state ?? '').toUpperCase()
    const isDone = check.status === undefined || check.status.toUpperCase() === 'COMPLETED'
    if (verdict === 'EXPECTED') {
      // GitHub waits to hear of it: pending for the card, but nothing is running.
      checks.pending += 1
      checks.waiting = (checks.waiting ?? 0) + 1
    } else if (!isDone || verdict === '' || verdict === 'PENDING') checks.pending += 1
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
  state?: string
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
            stamp: (current.statusCheckRollup ?? [])
              .map(c => `${c.workflowName ?? ''}/${c.name ?? c.context ?? ''}:${c.status ?? ''}:${c.conclusion ?? c.state ?? ''}`)
              .sort()
              .join(' '),
            ...(current.state === 'MERGED' ? { ended: 'merged' as const } : current.state === 'CLOSED' ? { ended: 'closed' as const } : {}),
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
  git.pr === undefined
    ? git.run !== undefined && git.run.status !== 'completed'
    : git.pr.ended === undefined && git.pr.checks.pending - (git.pr.checks.waiting ?? 0) > 0

const MINUTE_MS = 60 * 1000

/**
 * How long to wait before asking GitHub again while CI runs: two minutes at
 * first, then five and ten as nothing changes, and none after an hour without
 * change (a check stuck queued or waiting); a check in progress is kept for six hours. Undefined when there is nothing to poll.
 */
export const ciPollMs = (git: GitInfo): number | undefined => {
  if (!isCiRunning(git)) return undefined
  const age = git.remoteAt - (git.ciChangedAt ?? git.remoteAt)

  if (age < 10 * MINUTE_MS) return 2 * MINUTE_MS
  if (age < 30 * MINUTE_MS) return 5 * MINUTE_MS
  if (age < 60 * MINUTE_MS) return 10 * MINUTE_MS
  // A job that is really running may take hours; one queued or waiting for an hour is stuck.
  return isInProgress(git) && age < 6 * 60 * MINUTE_MS ? 10 * MINUTE_MS : undefined
}

/** Whether a check (or the branch's run) is actually executing, not queued or waiting. */
const isInProgress = (git: GitInfo): boolean =>
  git.pr === undefined ? git.run?.status === 'in_progress' : /:IN_PROGRESS:/i.test(git.pr.stamp ?? '')

/** What CI looked like at a read, to tell whether the next read found it changed. */
const ciSignature = (git: GitInfo): string =>
  git.pr === undefined
    ? git.run === undefined
      ? ''
      : `run ${git.run.url} ${git.run.status} ${git.run.conclusion}`
    : `pr ${git.pr.number} ${git.pr.ended ?? ''} ${git.pr.checks.ok}/${git.pr.checks.failed}/${git.pr.checks.pending}/${git.pr.checks.waiting ?? 0} ${git.pr.stamp ?? ''}`

/**
 * Whether the CI that was running at one read has finished at the next, on
 * the same PR or the same workflow run, and how: for a toast and a sound.
 */
export const ciFinished = (before: GitInfo, after: GitInfo): { isOk: boolean; text: string } | undefined => {
  if (after.state !== 'ok' || !isCiRunning(before) || isCiRunning(after) || after.pr?.ended !== undefined) return undefined
  if (before.pr !== undefined && after.pr !== undefined && before.pr.number === after.pr.number) {
    const { ok, failed } = after.pr.checks

    const number = after.pr.number

    return failed > 0
      ? { isOk: false, text: tn(failed, 'ci.failed.one', 'ci.failed.other', { number }) }
      : { isOk: true, text: tn(ok, 'ci.passed.one', 'ci.passed.other', { number }) }
  }
  if (before.pr === undefined && after.pr === undefined && after.run !== undefined && before.run?.url === after.run.url) {
    const isOk = after.run.conclusion === 'success'

    return {
      isOk,
      text: t('ci.run', {
        mark: isOk ? '✓' : '✗',
        name: after.run.name,
        branch: after.branch ?? t('ci.branch'),
      }),
    }
  }

  return undefined
}

/** One line for what gh said went wrong, without its noise. */
const ghProblem = (stderr: string): string => {
  if (/auth login|not logged|authentication/i.test(stderr)) return t('gh.noSession')
  if (/could not resolve|network|timeout|dial tcp/i.test(stderr)) return t('gh.offline')
  const line = stderr.split('\n').map(l => l.trim()).find(l => l !== '')

  return line === undefined ? t('gh.noAnswer') : line.slice(0, 120)
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
    status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { timeoutMs: GIT_TIMEOUT_MS, env: GIT_ENV })
  } catch {
    return { ...before, state: 'error', error: t('git.missing'), at, isLoading: false }
  }
  if (status.exitCode !== 0) {
    // The messages are asked for in English; the Spanish one is still read, should git ignore the request.
    const isOutside = /not a git repository|no es un repositorio/i.test(status.stderr)

    return {
      ...NO_GIT,
      ops: before.ops,
      state: isOutside ? 'none' : 'error',
      ...(isOutside ? {} : { error: status.stderr.trim().split('\n')[0]?.slice(0, 120) ?? t('git.failed') }),
      at,
    }
  }
  const local = parseStatus(status.stdout)
  const remote = await $.process
    .run(['git', 'remote', 'get-url', 'origin'], { timeoutMs: GIT_TIMEOUT_MS, env: GIT_ENV })
    .then(r => (r.exitCode === 0 ? repoOf(r.stdout) : undefined))
    .catch(() => undefined)
  const sameBranch = before.branch === local.branch && before.detached === local.detached && before.repo === remote
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

    const read: GitInfo = { ...kept, ...pr, pr: pr.pr, run, remoteAt: at, remoteError: undefined }
    // The backoff counts from the last time CI looked different.
    const isSame = sameBranch && before.ciChangedAt !== undefined && ciSignature(before) === ciSignature(read)

    return { ...read, ciChangedAt: isSame ? before.ciChangedAt : at }
  } catch {
    return { ...kept, remoteAt: at, remoteError: t('gh.missing') }
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
    const sha = op.commit.sha.slice(0, 7)
    out.push({
      at,
      text:
        op.commit.branch === undefined
          ? t('op.commit', { verb, sha })
          : t('op.commitOn', { verb, sha, branch: op.commit.branch }),
    })
  }
  if (op.push !== undefined) out.push({ at, text: t('op.push', { branch: op.push.branch }) })
  if (op.branch !== undefined) {
    out.push({ at, text: t(op.branch.action === 'merged' ? 'op.merge' : 'op.rebase', { ref: op.branch.ref }) })
  }
  if (op.pr !== undefined) {
    const known = PR_ACTION[op.pr.action]
    const action = known === undefined ? op.pr.action : t(known)
    out.push({ at, text: t('op.pr', { number: op.pr.number, action }), ...(op.pr.url === undefined ? {} : { url: op.pr.url }) })
  }

  return out
}

const PR_ACTION: Record<string, Key> = {
  created: 'pr.created',
  edited: 'pr.edited',
  merged: 'pr.merged',
  commented: 'pr.commented',
  closed: 'pr.closed',
  reopened: 'pr.reopened',
  ready: 'pr.ready',
  draft: 'pr.draft',
  'auto-merge-enabled': 'pr.autoMergeEnabled',
  'auto-merge-disabled': 'pr.autoMergeDisabled',
}

/** How gh spells a review decision, in the card's words. */
export const reviewText = (review: string): string | undefined =>
  review === 'APPROVED'
    ? t('review.approved')
    : review === 'CHANGES_REQUESTED'
      ? t('review.changes')
      : review === 'REVIEW_REQUIRED'
        ? t('review.required')
        : undefined
