// The update notice: reading the kit's latest release and comparing it with the plugin that is running. Pure logic; the calls through `$` live in actions.ts.

/** Where GitHub names the kit's newest release. */
export const RELEASE_URL = 'https://api.github.com/repos/Dalibex/agent-team-kit/releases/latest'
/** Kept in `$.store` across sessions: when the release was last asked for, and what it answered. */
export const UPDATE_KEY = 'updateCheck'
/** The release is asked for at most this often. */
export const UPDATE_MS = 24 * 60 * 60 * 1000

/** What the store keeps of the day's check. */
export type UpdateRecord = {
  /** When GitHub was last asked, whether it answered or not; 0 when it never was. */
  at: number
  /** The newest release it named, as `X.Y.Z`, kept while a later ask fails. */
  version?: string
  /** The page of that release. */
  url?: string
  /** The newest version already told in a toast: one toast per version. */
  toasted?: string
}

/** A version as three numbers, or undefined when it does not start with `X.Y.Z` (a leading `v` is allowed). */
export const parseVersion = (text: string): [number, number, number] | undefined => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim())
  if (m === null) return undefined

  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Whether `candidate` is a later version than `own`; a text that is no version is never later. */
export const isNewer = (candidate: string, own: string): boolean => {
  const a = parseVersion(candidate)
  const b = parseVersion(own)
  if (a === undefined || b === undefined) return false
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }

  return false
}

/** The `version` of a plugin.json's text, or undefined. */
export const manifestVersion = (json: string): string | undefined => {
  try {
    const { version } = JSON.parse(json) as { version?: unknown }

    return typeof version === 'string' && parseVersion(version) !== undefined ? version : undefined
  } catch {
    return undefined
  }
}

/** The release a `releases/latest` answer names: its `X.Y.Z` and its page on GitHub, or undefined. */
export const releaseFrom = (body: string): { version: string; url: string } | undefined => {
  try {
    const { tag_name: tag, html_url: page } = JSON.parse(body) as { tag_name?: unknown; html_url?: unknown }
    const parsed = typeof tag === 'string' ? parseVersion(tag) : undefined
    if (parsed === undefined || typeof tag !== 'string') return undefined
    const version = parsed.join('.')
    const url =
      typeof page === 'string' && page.startsWith('https://github.com/')
        ? page
        : `https://github.com/Dalibex/agent-team-kit/releases/tag/${tag.trim()}`

    return { version, url }
  } catch {
    return undefined
  }
}

/** The check's record read back from the store, whatever it held. */
export const recordFrom = (value: unknown): UpdateRecord => {
  if (value === null || typeof value !== 'object') return { at: 0 }
  const f = value as Record<string, unknown>

  return {
    at: typeof f.at === 'number' && Number.isFinite(f.at) ? f.at : 0,
    ...(typeof f.version === 'string' ? { version: f.version } : {}),
    ...(typeof f.url === 'string' ? { url: f.url } : {}),
    ...(typeof f.toasted === 'string' ? { toasted: f.toasted } : {}),
  }
}
