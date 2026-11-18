import type { JobKind, JobMatch } from '../types'

/** What the pane calls each kind of job. */
export const KIND_TEXT: Record<JobKind, string> = {
  install: 'instalación',
  build: 'build',
  download: 'descarga',
}

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

  return words.length > 3 ? `${shown} y ${words.length - 3} más` : shown
}

/** The last segment of a URL or path, without `.git`. */
const lastPart = (text: string): string =>
  text
    .replace(/[?#].*$/, '')
    .replace(/\.git$/, '')
    .split(/[\\/]/)
    .filter(part => part !== '')
    .pop() ?? text

type Rule = { re: RegExp; match: (m: RegExpExecArray) => JobMatch }

const NODE = '(npm|pnpm|yarn|bun)'
const MAVEN = '(?:\\.[\\\\/])?(mvnw?(?:\\.cmd)?)'
const GRADLE = '(?:\\.[\\\\/])?(gradlew?(?:\\.bat)?)'

/**
 * Checked in order on each part of a command line: builds before installs, so
 * `mvn install` and `npm run build` read as builds and `npm install` as an install.
 */
const RULES: Rule[] = [
  {
    re: new RegExp(`^${MAVEN}\\b(.*)$`, 'i'),
    match: m => ({ kind: 'build', manager: 'maven', target: listOf(argsOf(m[2] ?? ''), 'build') }),
  },
  {
    re: new RegExp(`^${GRADLE}\\b(.*)$`, 'i'),
    match: m => ({ kind: 'build', manager: 'gradle', target: listOf(argsOf(m[2] ?? ''), 'build') }),
  },
  {
    re: new RegExp(`^${NODE}\\s+(?:run\\s+)?(build|test|lint|typecheck|check|e2e)\\b`, 'i'),
    match: m => ({ kind: 'build', manager: (m[1] ?? 'npm').toLowerCase(), target: (m[2] ?? 'build').toLowerCase() }),
  },
  {
    re: /^npx\s+expo\s+install\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'expo', target: listOf(argsOf(m[1] ?? ''), 'dependencias del proyecto') }),
  },
  {
    re: new RegExp(`^${NODE}\\s+(install|i|add|ci)\\b(.*)$`, 'i'),
    match: m => ({
      kind: 'install',
      manager: (m[1] ?? 'npm').toLowerCase(),
      target: listOf(argsOf(m[3] ?? ''), 'dependencias del proyecto'),
    }),
  },
  { re: /^yarn\s*$/i, match: () => ({ kind: 'install', manager: 'yarn', target: 'dependencias del proyecto' }) },
  {
    re: /^(?:(?:python3?|py)(?:\s+-\d(?:\.\d+)?)?\s+-m\s+pip|pip3?|uv\s+pip)\s+install\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'pip', target: listOf(argsOf(m[1] ?? ''), 'dependencias del proyecto') }),
  },
  {
    re: /^(uv|poetry|pipx|conda)\s+(add|install|sync)\b(.*)$/i,
    match: m => ({
      kind: 'install',
      manager: (m[1] ?? 'uv').toLowerCase(),
      target: listOf(argsOf(m[3] ?? ''), 'dependencias del proyecto'),
    }),
  },
  {
    re: /^(winget|choco|scoop|brew|gem|pipx)\s+(install|upgrade)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: (m[1] ?? 'winget').toLowerCase(), target: listOf(argsOf(m[3] ?? ''), 'paquetes') }),
  },
  {
    re: /^(?:sudo\s+)?(apt|apt-get|dnf|pacman)\s+(?:install|-S)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: (m[1] ?? 'apt').toLowerCase(), target: listOf(argsOf(m[2] ?? ''), 'paquetes') }),
  },
  {
    re: /^cargo\s+(install|add)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'cargo', target: listOf(argsOf(m[2] ?? ''), 'crates') }),
  },
  {
    re: /^cargo\s+(build|test|check)\b/i,
    match: m => ({ kind: 'build', manager: 'cargo', target: (m[1] ?? 'build').toLowerCase() }),
  },
  {
    re: /^go\s+(install|get)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'go', target: listOf(argsOf(m[2] ?? '').map(lastPart), 'módulos') }),
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
    match: m => ({ kind: 'install', manager: 'dotnet', target: listOf(argsOf(m[2] ?? ''), 'paquetes NuGet') }),
  },
  {
    re: /^composer\s+(install|require|update)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'composer', target: listOf(argsOf(m[2] ?? ''), 'dependencias del proyecto') }),
  },
  {
    re: /^(Install-Module|Install-Package)\b(.*)$/i,
    match: m => ({ kind: 'install', manager: 'powershell', target: listOf(argsOf(m[2] ?? ''), 'módulos') }),
  },
  { re: /^(?:python3?\s+-m\s+)?pytest\b/i, match: () => ({ kind: 'build', manager: 'pytest', target: 'tests' }) },
  {
    re: /^docker\s+(?:buildx\s+)?build\b(.*)$/i,
    match: () => ({ kind: 'build', manager: 'docker', target: 'imagen' }),
  },
  {
    re: /^docker(?:\s+|-)compose\b.*\b(up|build|pull)\b/i,
    match: m => ({
      kind: (m[1] ?? '').toLowerCase() === 'pull' ? 'download' : 'build',
      manager: 'compose',
      target: (m[1] ?? 'up').toLowerCase(),
    }),
  },
  {
    re: /^docker\s+pull\b(.*)$/i,
    match: m => ({ kind: 'download', manager: 'docker', target: listOf(argsOf(m[1] ?? ''), 'imagen') }),
  },
  {
    re: /^git\s+clone\b(.*)$/i,
    match: m => ({ kind: 'download', manager: 'git', target: lastPart(argsOf(m[1] ?? '')[0] ?? 'repositorio') }),
  },
  {
    re: /^gh\s+(?:repo\s+clone|release\s+download)\b(.*)$/i,
    match: m => ({ kind: 'download', manager: 'gh', target: lastPart(argsOf(m[1] ?? '')[0] ?? 'descarga') }),
  },
  { re: /^(wget)\b(.*)$/i, match: m => download('wget', m[2] ?? '') },
  {
    // only a download that saves a file: a curl that prints an API answer is not one
    re: /^(curl|Invoke-WebRequest|iwr)\b(?=.*\s(?:-o|-O|--output|--remote-name|-OutFile)\b)(.*)$/i,
    match: m => download((m[1] ?? 'curl').toLowerCase(), m[2] ?? ''),
  },
]

/** A file download, named after the last part of its URL. */
function download(manager: string, rest: string): JobMatch {
  const url = /https?:\/\/[^\s"']+/.exec(rest)?.[0]

  return { kind: 'download', manager, target: url === undefined ? 'fichero' : lastPart(url) }
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
      if (m !== null) return rule.match(m)
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
  const percentAt = lastPercent === undefined ? -1 : tail.lastIndexOf(lastPercent)
  const stepAt = lastStep === undefined ? -1 : tail.lastIndexOf(lastStep[0])
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
