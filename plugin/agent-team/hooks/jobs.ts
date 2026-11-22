import type { JobKind, JobMatch } from '../types'
import { t } from './i18n'

/** What the pane calls each kind of job, in the pane's language. */
export const kindText = (kind: JobKind): string => t(`job.${kind}`)

/** A job's row title: the tool, the kind of job and what it works on ("maven · build · clean, install"). */
export const jobTitle = (job: JobMatch): string => {
  const kind = kindText(job.kind)
  const fallbacks = FALLBACK_TARGETS.map(key => t(key))
  // A target that only says the kind again ("build · build") or a rule's stand-in for "no target named" adds nothing.
  const isEcho = job.target === job.kind || job.target === kind || fallbacks.includes(job.target)

  return isEcho ? `${job.manager} · ${kind}` : `${job.manager} · ${kind} · ${job.target}`
}

/** The words a rule puts as the target when the command names none. */
const FALLBACK_TARGETS = [
  'job.target.project',
  'job.target.packages',
  'job.target.crates',
  'job.target.modules',
  'job.target.nuget',
  'job.target.image',
  'job.target.repository',
  'job.target.download',
  'job.target.file',
] as const

/** The words of a command that are not flags, quotes stripped. */
const argsOf = (rest: string): string[] =>
  rest
    .split(/\s+/)
    .map(word => word.replace(/^["']|["']$/g, ''))
    .filter(word => word !== '' && !word.startsWith('-') && !word.includes('='))

/** A few words for the packages a command names, or `fallback` when it names none. */
const listOf = (words: string[], fallback: string): string => {
  if (words.length === 0) return fallback
  const shown = words.slice(0, 3).join(', ')

  return words.length > 3 ? t('job.more', { shown, n: words.length - 3 }) : shown
}

/** The last segment of a URL or path, without `.git`. */
const lastPart = (text: string): string =>
  text
    .replace(/[?#].*$/, '')
    .replace(/\.git$/, '')
    .split(/[\\/]/)
    .filter(part => part !== '')
    .pop() ?? text

/** A rule that knows the command is not a job (a server, a watcher) answers undefined. */
type Rule = { re: RegExp; match: (m: RegExpExecArray) => JobMatch | undefined }

const NODE = '(npm|pnpm|yarn|bun)(?:\\.cmd)?'

/** A build that never ends: a watch flag (`-w` only after `--`, where npm hands flags on). */
const isWatching = (rest: string): boolean =>
  /(?:^|\s)(?:--watch|--watchAll|--continuous)(?=\s|$|=(?!false\b|0\b))/.test(rest) || /\s--(?:\s|\s.*\s)-w(?=\s|$)/.test(` ${rest}`)

/** A dev server a build tool runs in the foreground: it ends only when it is stopped. */
const MAVEN_SERVER = /(?:^|\s)[\w.-]+:(?:run|dev)(?=\s|$)/
const GRADLE_SERVER = /(?:^|\s)(?:bootRun|bootTestRun|quarkusDev)(?=\s|$)|(?:^|\s)(?:--continuous|-t)(?=\s|$)/

/** Where a curl or iwr writes its body when it only checks that a server answers. */
const NULL_SINK = /(?:^|\s)(?:-o|--output|-OutFile)[\s=]+["']?(?:\/dev\/null|nul|\$null)["']?(?=\s|$)/i
const MAVEN = '(?:\\.[\\\\/])?(mvnw?(?:\\.cmd)?)'
const GRADLE = '(?:\\.[\\\\/])?(gradlew?(?:\\.bat)?)'

/**
 * Checked in order on each part of a command line: builds before installs, so
 * `mvn install` and `npm run build` read as builds and `npm install` as an install.
 */
const RULES: Rule[] = [
  {
    re: new RegExp(`^${MAVEN}\\b(.*)$`, 'i'),
    match: m =>
      MAVEN_SERVER.test(m[2] ?? '') ? undefined : { kind: 'build', manager: 'maven', target: listOf(argsOf(m[2] ?? ''), 'build') },
  },
  {
    re: new RegExp(`^${GRADLE}\\b(.*)$`, 'i'),
    match: m =>
      GRADLE_SERVER.test(m[2] ?? '') ? undefined : { kind: 'build', manager: 'gradle', target: listOf(argsOf(m[2] ?? ''), 'build') },
  },
  {
    re: new RegExp(`^${NODE}\\s+(?:run\\s+)?(build|test|lint|typecheck|check|e2e)\\b(.*)$`, 'i'),
    match: m =>
      isWatching(m[3] ?? '')
        ? undefined
        : { kind: 'build', manager: (m[1] ?? 'npm').toLowerCase(), target: (m[2] ?? 'build').toLowerCase() },
  },
  {
    re: /^npx(?:\.cmd)?\s+expo\s+install\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'expo', target: listOf(argsOf(m[1] ?? ''), t('job.target.project')) }),
  },
  {
    re: new RegExp(`^${NODE}\\s+(install|i|add|ci)\\b(.*)$`, 'i'),
    match: m => ({
      kind: 'install',
      manager: (m[1] ?? 'npm').toLowerCase(),
      target: listOf(argsOf(m[3] ?? ''), t('job.target.project')),
    }),
  },
  { re: /^yarn(?:\.cmd)?\s*$/i, match: () => ({ kind: 'install', manager: 'yarn', target: t('job.target.project') }) },
  {
    re: /^(?:(?:python3?|py)(?:\s+-\d(?:\.\d+)?)?\s+-m\s+pip|pip3?|uv\s+pip)\s+install\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'pip', target: listOf(argsOf(m[1] ?? ''), t('job.target.project')) }),
  },
  {
    re: /^(uv|poetry|pipx|conda)\s+(add|install|sync)\b(.*)$/i,
    match: m => ({
      kind: 'install',
      manager: (m[1] ?? 'uv').toLowerCase(),
      target: listOf(argsOf(m[3] ?? ''), t('job.target.project')),
    }),
  },
  {
    re: /^(winget|choco|scoop|brew|gem|pipx)\s+(install|upgrade)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: (m[1] ?? 'winget').toLowerCase(), target: listOf(argsOf(m[3] ?? ''), t('job.target.packages')) }),
  },
  {
    re: /^(?:sudo\s+)?(apt|apt-get|dnf|pacman)\s+(?:install|-S)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: (m[1] ?? 'apt').toLowerCase(), target: listOf(argsOf(m[2] ?? ''), t('job.target.packages')) }),
  },
  {
    re: /^cargo\s+(install|add)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'cargo', target: listOf(argsOf(m[2] ?? ''), t('job.target.crates')) }),
  },
  {
    re: /^cargo\s+(build|test|check)\b/i,
    match: m => ({ kind: 'build', manager: 'cargo', target: (m[1] ?? 'build').toLowerCase() }),
  },
  {
    re: /^go\s+(install|get)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'go', target: listOf(argsOf(m[2] ?? '').map(lastPart), t('job.target.modules')) }),
  },
  {
    re: /^go\s+(build|test)\b/i,
    match: m => ({ kind: 'build', manager: 'go', target: (m[1] ?? 'build').toLowerCase() }),
  },
  {
    re: /^dotnet\s+(build|test|publish)\b/i,
    match: m => ({ kind: 'build', manager: 'dotnet', target: (m[1] ?? 'build').toLowerCase() }),
  },
  {
    re: /^dotnet\s+(restore|add\s+package)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'dotnet', target: listOf(argsOf(m[2] ?? ''), t('job.target.nuget')) }),
  },
  {
    re: /^composer\s+(install|require|update)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'composer', target: listOf(argsOf(m[2] ?? ''), t('job.target.project')) }),
  },
  {
    re: /^(Install-Module|Install-Package)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'powershell', target: listOf(argsOf(m[2] ?? ''), t('job.target.modules')) }),
  },
  { re: /^(?:(?:python3?|py)\s+-m\s+)?pytest\b/i, match: () => ({ kind: 'build', manager: 'pytest', target: 'tests' }) },
  {
    re: /^docker\s+(?:buildx\s+)?build\b(.*)$/i,
    match: () => ({ kind: 'build', manager: 'docker', target: t('job.target.image') }),
  },
  {
    // The subcommand sits right after compose's own options: an `up` inside `exec ... sh -c "...up"` is not it.
    re: /^docker(?:\s+|-)compose(?:\s+(?:-f|--file|-p|--project-name|--profile|--env-file|--project-directory|--ansi|--parallel|--progress)(?:=|\s+)\S+|\s+-{1,2}[\w-]+(?:=\S+)?)*\s+(up|build|pull)\b(.*)$/i,
    match: m => {
      const sub = (m[1] ?? 'up').toLowerCase()
      // Attached, `up` runs the stack until it is stopped; only a detached one comes back.
      if (sub === 'up' && !/(?:^|\s)(?:-d|--detach|--wait)(?=\s|$)/.test(m[2] ?? '')) return undefined

      return { kind: sub === 'pull' ? 'download' : 'build', manager: 'compose', target: sub }
    },
  },
  {
    re: /^docker\s+pull\b(.*)$/i,
    match: m => ({ kind: 'download', manager: 'docker', target: listOf(argsOf(m[1] ?? ''), t('job.target.image')) }),
  },
  {
    re: /^git\s+clone\b(.*)$/i,
    match: m => ({ kind: 'download', manager: 'git', target: lastPart(argsOf(m[1] ?? '')[0] ?? t('job.target.repository')) }),
  },
  {
    re: /^gh\s+(?:repo\s+clone|release\s+download)\b(.*)$/i,
    match: m => ({ kind: 'download', manager: 'gh', target: lastPart(argsOf(m[1] ?? '')[0] ?? t('job.target.download')) }),
  },
  { re: /^(wget)\b(.*)$/i, match: m => download('wget', m[2] ?? '') },
  {
    // only a download that saves a file: a curl that prints an API answer is not one
    re: /^(curl|Invoke-WebRequest|iwr)\b(?=.*\s(?:-o|-O|--output|--remote-name|-OutFile)\b)(.*)$/i,
    match: m => (NULL_SINK.test(m[2] ?? '') ? undefined : download((m[1] ?? 'curl').toLowerCase(), m[2] ?? '')),
  },
]

/** A file download, named after the last part of its URL. */
function download(manager: string, rest: string): JobMatch {
  const url = /https?:\/\/[^\s"']+/.exec(rest)?.[0]

  return { kind: 'download', manager, target: url === undefined ? t('job.target.file') : lastPart(url) }
}

/**
 * Recognises an install, build or download in a shell command line: the
 * first part (split on &&, ||, ; and |) that matches a rule. A `cd x &&`
 * before it, or an env assignment, is skipped.
 */
export const classify = (command: string): JobMatch | undefined => {
  const parts = command
    .split(/&&|\|\||;|\||\r?\n/)
    .map(part => part.trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/, '').replace(/^&\s+/, ''))
    .filter(part => part !== '')
  for (const part of parts) {
    for (const rule of RULES) {
      const m = rule.re.exec(part)
      if (m !== null) {
        const job = rule.match(m)
        if (job !== undefined) return job
        // The part is job-shaped but does not end (a server, a watcher): no later rule reads it.
        break
      }
    }
  }

  return undefined
}

/** Strips colour codes and keeps what a terminal would show after carriage returns. */
export const plain = (text: string): string =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .split('\n')
    .map(line => line.split('\r').filter(piece => piece.trim() !== '').pop() ?? '')
    .join('\n')

/**
 * The progress the end of an output shows: its last percentage, or a step
 * count such as `[12/50]` or `(3 of 8)`. Undefined when it shows none.
 */
export const progressOf = (text: string): number | undefined => {
  const tail = plain(text.slice(-4000))
  const percents = [...tail.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s?%/g)]
  const lastPercent = percents[percents.length - 1]?.[1]
  const steps = [...tail.matchAll(/[[(](\d+)\s*(?:\/|of|de)\s*(\d+)[\])]/g)]
  const lastStep = steps[steps.length - 1]
  // Where each sits is where its own match is: the same digits may show up earlier in the text.
  const percentAt = percents[percents.length - 1]?.index ?? -1
  const stepAt = lastStep?.index ?? -1
  if (percentAt >= 0 && percentAt >= stepAt) {
    const value = Number((lastPercent ?? '').replace(',', '.'))

    return value >= 0 && value <= 100 ? value : undefined
  }
  if (lastStep !== undefined) {
    const done = Number(lastStep[1])
    const total = Number(lastStep[2])
    if (total > 0 && done <= total) return Math.round((done / total) * 100)
  }

  return undefined
}

/** Whether an output carries a tool's own failure verdict, whatever its exit code. */
export const looksFailed = (output: string): boolean =>
  /BUILD FAIL(URE|ED)\b|^npm (ERR!|error)\s|^ERROR: (Could not|No matching distribution)|^FAILURE: Build failed/m.test(plain(output))

/**
 * Where a background command writes its output, read from the tool's text:
 * "Output is being written to: <path>.output".
 */
export const outputPathOf = (text: string | undefined): string | undefined =>
  /Output is being written to:\s*(.+?\.output)(?=[.\s]|$)/.exec(text ?? '')?.[1]?.trim()
