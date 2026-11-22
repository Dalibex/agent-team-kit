import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { HttpResponse } from 'claude-code'

import { isNewer, manifestVersion, parseVersion, recordFrom, releaseFrom, RELEASE_URL, UPDATE_KEY, UPDATE_MS } from '../hooks/update'
import { MANIFEST_VERSION, PANE, boot, shows, start } from './support'
import type { World } from './support'

const HOUR = 60 * 60 * 1000
/** A moment more than a day before any test's clock starts. */
const LONG_AGO = -2 * UPDATE_MS
const PAGE = 'https://github.com/Dalibex/agent-team-kit/releases/tag/v9.9.0'

/** What GitHub answers for `releases/latest`. */
const release = (tag: string, page = `https://github.com/Dalibex/agent-team-kit/releases/tag/${tag}`): HttpResponse => ({
  status: 200,
  ok: true,
  headers: {},
  text: JSON.stringify({ tag_name: tag, html_url: page, name: tag }),
})

/** The first 3 seconds after the start, when the check runs. */
const afterStart = async (world: World): Promise<void> => {
  await world.clock.advance(3500)
  await world.clock.settle()
}

/** The strip's update line, where the pane shows one: its link, or undefined. */
const updateLink = async ($: Engine): Promise<{ href: unknown; label: unknown } | undefined> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const links = await ui.findAll({ type: 'Link' })
  await ui.unmount()
  const found = links.find(link => /^agent-team .* (disponible|available)$/.test(String(link.props.label)))

  return found === undefined ? undefined : { href: found.props.href, label: found.props.label }
}

// ------------------------------------------------------------ the comparison

test('versions are compared number by number, and a text that is no version is never newer', () => {
  expect(parseVersion('v0.9.1')).toEqual([0, 9, 1])
  expect(parseVersion('0.10.0-rc1')).toEqual([0, 10, 0])
  expect(parseVersion('latest')).toBeUndefined()
  expect(isNewer('9.9.0', '0.8.4')).toBe(true)
  expect(isNewer('0.10.0', '0.9.9')).toBe(true)
  expect(isNewer('1.0.0', '0.99.99')).toBe(true)
  expect(isNewer('0.8.4', '0.8.4')).toBe(false)
  expect(isNewer('0.8.3', '0.8.4')).toBe(false)
  expect(isNewer('nightly', '0.8.4')).toBe(false)
  expect(isNewer('9.9.0', 'dev')).toBe(false)
})

test('the release and the manifest are read from their JSON, and bad ones read as nothing', () => {
  expect(releaseFrom(release('v9.9.0').text)).toEqual({ version: '9.9.0', url: PAGE })
  expect(releaseFrom(JSON.stringify({ tag_name: '9.9.0' }))).toEqual({ version: '9.9.0', url: 'https://github.com/Dalibex/agent-team-kit/releases/tag/9.9.0' })
  expect(releaseFrom(JSON.stringify({ tag_name: 'v9.9.0', html_url: 'https://evil.example/x' }))?.url).toBe(PAGE)
  expect(releaseFrom('<html>rate limited</html>')).toBeUndefined()
  expect(releaseFrom(JSON.stringify({ message: 'Not Found' }))).toBeUndefined()
  expect(manifestVersion('{"name":"agent-team","version":"0.8.4"}')).toBe('0.8.4')
  expect(manifestVersion('{"name":"agent-team"}')).toBeUndefined()
  expect(manifestVersion('not json')).toBeUndefined()
  expect(recordFrom('junk')).toEqual({ at: 0 })
  expect(recordFrom({ at: 5, version: '9.9.0', url: 'u', toasted: '9.9.0', extra: 1 })).toEqual({ at: 5, version: '9.9.0', url: 'u', toasted: '9.9.0' })
})

// ------------------------------------------------------------ the notice

test('a newer release shows a line in the strip with a link to it and the command to update, and toasts once', async ($, on) => {
  const world = boot(on)
  world.http = () => release('v9.9.0')
  await start($)
  await afterStart(world)

  expect(world.fetched.map(f => f.url)).toEqual([RELEASE_URL])
  expect(world.fetched[0]?.init?.headers?.['User-Agent']).toBeTruthy()
  expect(await updateLink($)).toEqual({ href: PAGE, label: 'agent-team 9.9.0 disponible' })
  expect(await shows($, 'desktop', /claude plugin update agent-team@agent-team-kit.*\/reload-plugins$/)).toBe(true)
  expect(await shows($, 'terminal', /claude plugin update agent-team@agent-team-kit.*\/reload-plugins$/)).toBe(true)
  expect(world.toasts.filter(text => text.includes('9.9.0'))).toEqual([
    'agent-team 9.9.0 está disponible: ejecuta `claude plugin marketplace update agent-team-kit` y `claude plugin update agent-team@agent-team-kit`, y luego /reload-plugins',
  ])
})

test('the notice speaks English when the pane does', { options: { language: 'en' } }, async ($, on) => {
  const world = boot(on)
  world.http = () => release('v9.9.0')
  await start($)
  await afterStart(world)

  expect(await updateLink($)).toEqual({ href: PAGE, label: 'agent-team 9.9.0 available' })
  expect(world.toasts).toContain(
    'agent-team 9.9.0 is available: run `claude plugin marketplace update agent-team-kit` and `claude plugin update agent-team@agent-team-kit`, then /reload-plugins',
  )
})

test('the version running is the manifest’s own: a manifest that says 9.9.0 is up to date with a 9.9.0 release', async ($, on) => {
  const world = boot(on)
  world.files['.claude-plugin/plugin.json'] = JSON.stringify({ name: 'agent-team', version: '9.9.0' })
  world.http = () => release('v9.9.0')
  await start($)
  await afterStart(world)

  expect(world.fetched).toHaveLength(1)
  expect(await updateLink($)).toBeUndefined()
})

for (const [what, tag] of [
  ['the same version', `v${MANIFEST_VERSION}`],
  ['an older version', 'v0.8.3'],
  ['an older minor', 'v0.7.9'],
] as const) {
  test(`${what} raises nothing`, async ($, on) => {
    const world = boot(on)
    world.http = () => release(tag)
    await start($)
    await afterStart(world)

    expect(world.fetched).toHaveLength(1)
    expect(await updateLink($)).toBeUndefined()
    expect(await shows($, 'desktop', /claude plugin update/)).toBe(false)
    expect(world.toasts).toEqual([])
  })
}

for (const [what, answer] of [
  ['no network', undefined],
  ['an error status', { status: 500, ok: false, headers: {}, text: 'oops' }],
  ['a rate limit', { status: 403, ok: false, headers: {}, text: '{"message":"API rate limit exceeded"}' }],
  ['a body that is not JSON', { status: 200, ok: true, headers: {}, text: '<html></html>' }],
  ['a release with no usable tag', { status: 200, ok: true, headers: {}, text: '{"tag_name":"nightly"}' }],
] as const) {
  test(`${what} stays silent`, async ($, on) => {
    const world = boot(on)
    if (answer !== undefined) world.http = () => answer
    await start($)
    await afterStart(world)

    expect(world.fetched).toHaveLength(1)
    expect(await updateLink($)).toBeUndefined()
    expect(world.toasts).toEqual([])
    // the ask is on record, so a down network is not tried again until tomorrow
    expect(world.stored[UPDATE_KEY]).toMatchObject({ at: expect.any(Number) })
  })
}

test('a failed ask keeps the newer release an earlier one found', async ($, on) => {
  const world = boot(on, { store: { [UPDATE_KEY]: { at: LONG_AGO, version: '9.9.0', url: PAGE, toasted: '9.9.0' } } })
  await start($)
  await afterStart(world)

  expect(world.fetched).toHaveLength(1)
  expect(await updateLink($)).toEqual({ href: PAGE, label: 'agent-team 9.9.0 disponible' })
})

test('with the updateCheck option off GitHub is never asked and nothing is shown', { options: { updateCheck: false } }, async ($, on) => {
  const world = boot(on, { store: { [UPDATE_KEY]: { at: LONG_AGO, version: '9.9.0', url: PAGE } } })
  world.http = () => release('v9.9.0')
  await start($)
  await afterStart(world)
  await world.clock.advance(10 * 60 * 1000)

  expect(world.fetched).toEqual([])
  expect(await updateLink($)).toBeUndefined()
  expect(world.toasts).toEqual([])
})

// ----------------------------------------------------------- once a day

test('GitHub is asked at most once a day: a record from the last day is used as it stands', async ($, on) => {
  const world = boot(on)
  world.http = () => release('v9.9.0')
  world.stored[UPDATE_KEY] = { at: world.clock.now() - 23 * HOUR, version: '9.9.0', url: PAGE, toasted: '9.9.0' }
  await start($)
  await afterStart(world)

  expect(world.fetched).toEqual([])
  expect(await updateLink($)).toEqual({ href: PAGE, label: 'agent-team 9.9.0 disponible' })
  // already toasted for this version, in an earlier session
  expect(world.toasts.filter(text => text.includes('9.9.0'))).toEqual([])
})

test('the first ask is recorded with its time, and a second session within the day does not ask again', async ($, on) => {
  const world = boot(on)
  world.http = () => release('v9.9.0')
  await start($)
  await afterStart(world)
  const record = world.stored[UPDATE_KEY] as { at: number }
  expect(world.fetched).toHaveLength(1)
  expect(record.at).toBeGreaterThan(0)

  await start($)
  await afterStart(world)
  expect(world.fetched).toHaveLength(1)
}
)

test('a record older than a day is asked again, and a still newer version toasts again', async ($, on) => {
  const world = boot(on)
  world.stored[UPDATE_KEY] = { at: LONG_AGO, version: '9.9.0', url: PAGE, toasted: '9.9.0' }
  world.http = () => release('v9.9.1')
  await start($)
  await afterStart(world)

  expect(world.fetched).toHaveLength(1)
  expect(await updateLink($)).toEqual({
    href: 'https://github.com/Dalibex/agent-team-kit/releases/tag/v9.9.1',
    label: 'agent-team 9.9.1 disponible',
  })
  expect(world.toasts.filter(text => text.includes('9.9.1'))).toHaveLength(1)
  expect(world.stored[UPDATE_KEY]).toMatchObject({ version: '9.9.1', toasted: '9.9.1' })
})

test('a session that runs on does not ask again within the day', async ($, on) => {
  const world = boot(on)
  world.http = () => release('v0.8.4')
  await start($)
  await afterStart(world)
  expect(world.fetched).toHaveLength(1)

  // the ticker only looks at the clock; the next ask is a day after the start (a mocked clock cannot run a day of one-second ticks)
  await world.clock.advance(10 * 60 * 1000)
  expect(world.fetched).toHaveLength(1)
})
