// Everything that acts through `$`: the pane's writes, git and gh, sounds, notices and the skill slots.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionMeasureInput, UiPressArgument } from 'claude-code'
import type { AgentRow, ForegroundJob, Pack, Role, ShellTask, SkillView, Team, TeamModels, TeamRole, Trail } from '../types'
import { ciFinished, opsOf, readGit } from './github'
import { classify, progressOf } from './jobs'
import { extendTrail, newWarnings, pruneWarned, resetText, trailFrom, usageOf, windowName } from './usage'
import { t, tn } from './i18n'
import { planInstall, planRemove } from './rules'
import type { UpdateRecord } from './update'
import { isNewer, manifestVersion, recordFrom, releaseFrom, RELEASE_URL, UPDATE_KEY, UPDATE_MS } from './update'
import { branding, FAIL_SOUND, LOOK, seconds } from './look'
import { ARMED_KEY, armedBookFrom, runsFileName, CHIME_GAP_MS, cleanPackName, DELEGATION_KEY, PACK_NAME_MAX, packsFrom, projectKeyOf, reviewWarning, shortstatLines, closeRow, COMMAND, cycled, DEFAULT_MODELS, EMPTY, MODELS_KEY, modelsEntry, modelsFrom, TEAM_EFFORTS, TEAM_MODELS, FIRST_TAB, GIT_SHAPE, isShellRunning, jobEndOf, LONG_MS, namesCommittedWork, needsTail, NO_CHOICES, NO_IDS, NO_PACKS, NO_PICKER, NO_SLOTS, NO_UPDATE, PACK_SIZE, packDeleteAsk, PACKS_KEY, PACKS_VIEW, roleOf, shellOf, shellSound, SKILLS_EDIT, SLOTS_KEY, slotsFrom, STALE_MS, statusOfListed, stopLeftovers, stoppedIdOf, TAB_KEY, TAIL_MAX_BYTES, TEAM_SHAPE, titleOf, TOUCHES_GIT, TRAIL_KEY, USAGE_SHAPE, WARNED_KEY, withArmed, withJob, withRows, withShell } from './state'
import type { CardId, GitOperation, Ran, ShellCall } from './state'
import { NO_USAGE } from './usage'
import { NO_GIT } from './github'

// The state this module reads or writes; refs written here, starts and shapes from state.ts.
const team = atom({ plugin: 'agent-team', key: 'team' } as const, EMPTY, { shape: TEAM_SHAPE })
const now = atom({ plugin: 'agent-team', key: 'now' } as const, 0)
const expanded = atom({ plugin: 'agent-team', key: 'expanded' } as const, NO_IDS)
const usage = atom({ plugin: 'agent-team', key: 'usage' } as const, NO_USAGE, { shape: USAGE_SHAPE })
const git = atom({ plugin: 'agent-team', key: 'git' } as const, NO_GIT, { shape: GIT_SHAPE })
const tab = atom({ plugin: 'agent-team', key: 'tab' } as const, FIRST_TAB)
const slots = atom({ plugin: 'agent-team', key: 'slots' } as const, NO_SLOTS)
const armed = atom({ plugin: 'agent-team', key: 'armed' } as const, NO_IDS)
const choices = atom({ plugin: 'agent-team', key: 'choices' } as const, NO_CHOICES)
const picker = atom({ plugin: 'agent-team', key: 'picker' } as const, NO_PICKER)
const packs = atom({ plugin: 'agent-team', key: 'packs' } as const, NO_PACKS)
const armedPacks = atom({ plugin: 'agent-team', key: 'armedPacks' } as const, NO_IDS)
const project = atom({ plugin: 'agent-team', key: 'project' } as const, '')
const skillView = atom({ plugin: 'agent-team', key: 'skillView' } as const, PACKS_VIEW)
const delegation = atom({ plugin: 'agent-team', key: 'delegation' } as const, true)
const cwd = atom({ plugin: 'agent-team', key: 'cwd' } as const, '')
const updateNotice = atom({ plugin: 'agent-team', key: 'update' } as const, NO_UPDATE)
const models = atom({ plugin: 'agent-team', key: 'models' } as const, DEFAULT_MODELS)

/** Pins one line under the prompt with what is alive; clears it when idle. */
export async function refreshStatus($: EngineInterface): Promise<void> {
  const t = await read($, team)
  const at = await $.clock.now()
  const agents = t.agents.filter(a => a.status === 'running').length
  const shells = t.shells.filter(sh => isShellRunning(sh, at)).length
  if (agents === 0 && shells === 0) {
    $.ui.status(undefined)

    return
  }
  const parts: string[] = []
  if (agents > 0) parts.push(tn(agents, 'status.agents.one', 'status.agents.other'))
  if (shells > 0) parts.push(tn(shells, 'status.shells.one', 'status.shells.other'))
  $.ui.status(`${branding.statusPrefix}: ${parts.join(' · ')}`)
}

/**
 * Plays one of the mod's clips and never throws. On Windows the engine has no
 * player, so PowerShell's SoundPlayer plays the file; elsewhere the engine does.
 */
export async function playClip($: EngineInterface, clip: string): Promise<void> {
  try {
    if ((await $.env.get('OS')) === 'Windows_NT') {
      // The path travels in an environment variable, so no quoting can break the command.
      const file = `${$.plugin.root}/${clip}`.replace(/\//g, '\\')
      await $.process.run(
        [
          'powershell.exe',
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          '(New-Object Media.SoundPlayer $env:AGENT_TEAM_CLIP).PlaySync()',
        ],
        { env: { AGENT_TEAM_CLIP: file }, timeoutMs: 10_000 },
      )

      return
    }
    await $.audio.play({ asset: clip })
  } catch {
    // no player here: the pane still shows the end
  }
}

/**
 * Ends the rows whose end the pane missed: the engine says they ended, or no
 * longer lists them and they went quiet. A row active since the list was
 * taken (a tool call, a resume) is newer than the snapshot and left alone; a
 * row closed here still takes its own turn.complete if that arrives late.
 */
export async function reconcile($: EngineInterface, listedAt: number): Promise<void> {
  const listed = new Map((await $.agent.list()).map(a => [a.id, a.status]))
  // A closed row's foreground jobs lost their end with it: left running, they would spin and keep the ticker busy.
  const close = (acc: Team, id: string, end: Parameters<typeof closeRow>[2]): Team => {
    const closed = closeRow(acc, id, end)

    return { ...closed, jobs: stopLeftovers(closed.jobs, id, listedAt) }
  }
  await update($, team, squad =>
    squad.agents.reduce((acc, row) => {
      if (row.status !== 'running' || row.lastActiveAt >= listedAt) return acc
      const status = listed.get(row.id)
      const ended = status === undefined ? undefined : statusOfListed(status)
      if (ended !== undefined) {
        return close(acc, row.id, {
          status: ended,
          endedAt: listedAt,
          endNote: t('end.listed'),
          closedByList: true,
        })
      }
      if (status === undefined && listedAt - row.lastActiveAt > STALE_MS) {
        return close(acc, row.id, {
          status: 'stopped',
          endedAt: listedAt,
          endNote: t('end.quiet', { time: seconds(listedAt - row.lastActiveAt) }),
          closedByList: true,
        })
      }

      return acc
    }, squad),
  )
  await update($, now, () => listedAt)
  await refreshStatus($)
}

/**
 * Closes the shell a task notification is about, by the ids it carries; with
 * `command` (TaskStop's answer names it), the one shell without a task id
 * running it when no id matches. Any shell not ended counts, however old.
 */
export async function closeShell(
  $: EngineInterface,
  task: { id?: string; toolUseId?: string; status?: string; command?: string },
  how: string,
): Promise<ShellTask | undefined> {
  const at = await $.clock.now()
  let hit: ShellTask | undefined
  const key = task.id ?? task.toolUseId ?? ''
  await update($, team, t => {
    hit = undefined
    if (key !== '' && t.seen.includes(key)) return t
    const running = t.shells.filter(sh => sh.endedAt === undefined)
    const squash = (v: string): string => v.replace(/\s+/g, ' ').trim()
    const command = task.command === undefined ? '' : squash(task.command)
    const byCommand = command === '' ? [] : running.filter(sh => sh.taskId === undefined && squash(sh.command) === command)
    const found =
      running.find(sh => task.toolUseId !== undefined && sh.id === task.toolUseId) ??
      running.find(sh => task.id !== undefined && (sh.taskId === task.id || sh.id === task.id)) ??
      (byCommand.length === 1 ? byCommand[0] : undefined)
    if (found === undefined) return t
    const closed: ShellTask = {
      ...found,
      taskId: found.taskId ?? task.id,
      endedAt: at,
      outcome: task.status ?? 'completed',
      diag: `${found.diag}; ${how}`,
    }
    hit = closed
    const keys = [task.id, task.toolUseId].filter((k): k is string => k !== undefined && k !== '')

    return {
      ...t,
      seen: [...t.seen, ...keys].slice(-30),
      shells: t.shells.map(sh => (sh === found ? closed : sh)),
    }
  })
  if (hit !== undefined) await quietly(update($, now, () => at))

  return hit
}

/**
 * A background shell stopped with TaskStop: no task notification follows, so
 * the call's own answer closes its row as stopped, at once.
 */
export async function onTaskStop(
  $: EngineInterface,
  asked: { task_id?: string; shell_id?: string },
  ran: Ran,
): Promise<void> {
  const id = stoppedIdOf(asked, ran)
  if (id === undefined) return
  // A shell whose task id was never read is found by the command the answer names.
  const command = (ran.result as { command?: unknown } | undefined)?.command
  const closed = await closeShell(
    $,
    { id, status: 'killed', ...(typeof command === 'string' ? { command } : {}) },
    'stopped with TaskStop',
  )
  if (closed !== undefined) await quietly(refreshStatus($))
}

/**
 * Handles the text of a task notification, whatever path brought it: closes
 * the shell it is about (by id, by quoted command, or as the only one running)
 * and keeps a trace line for the unfolded rows.
 */
export async function onNoticeText(
  $: EngineInterface,
  text: string,
  via: string,
  loop?: string,
): Promise<ShellTask | undefined> {
  const id = /<task-id>\s*([^<\s]+)\s*<\/task-id>/.exec(text)?.[1]
  const status = /<status>\s*([^<\s]+)\s*<\/status>/.exec(text)?.[1] ?? 'completed'
  const isAboutAnAgent = /subagent|agent\s+"|agentId/i.test(text)
  const at = await $.clock.now()
  let closed: ShellTask | undefined
  const squash = (v: string): string => v.replace(/\s+/g, ' ').trim()
  const flat = squash(text)
  const key = id ?? `text:${flat.slice(0, 200)}`
  await update($, team, t => {
    closed = undefined
    // The same notice can arrive by the delivery event, the transcript row and
    // the turn it wakes: handle it once.
    if (t.seen.includes(key)) return t
    const inLoop = (sh: ShellTask): boolean => (sh.owner?.id ?? undefined) === loop
    // The guesses (by quoted text, as the only one running) count running shells alone; a match by
    // id reaches any shell not ended, however old: one past SHELL_MS may still run, and its end is news.
    const running = t.shells.filter(sh => isShellRunning(sh, at) && inLoop(sh))
    const byId = t.shells
      .filter(sh => sh.endedAt === undefined)
      .find(sh => id !== undefined && (sh.taskId === id || sh.id === id))
    const idIsKnown = id !== undefined && t.shells.some(sh => sh.taskId === id || sh.id === id)
    // By text only when exactly one running shell is quoted: two Maven calls
    // share their first characters, so a prefix is never enough.
    const byText = running.filter(
      sh => flat.includes(squash(sh.command)) || flat.includes(squash(sh.description)),
    )
    let hit = byId ?? (byText.length === 1 ? byText[0] : undefined)
    let how =
      hit === undefined
        ? ''
        : byId !== undefined
          ? `matched by id via ${via}`
          : `matched by its whole command or description via ${via}`
    // A notice that names a task the pane does not know is about something
    // else: never guess from it. Only an id-less notice may fall back.
    if (hit === undefined && id === undefined && running.length === 1 && !isAboutAnAgent && !idIsKnown) {
      hit = running[0]
      how = `matched as the only running shell via ${via}`
    }
    const notice = `${via} · ${status} ${id ?? '(no id)'}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`
    const ended = hit === undefined ? undefined : { ...hit, endedAt: at, outcome: status, diag: `${hit.diag}; ${how}` }
    closed = ended

    return {
      ...t,
      seen: [...t.seen, key].slice(-30),
      notices: [...t.notices, notice].slice(-4),
      shells: hit === undefined ? t.shells : t.shells.map(sh => (sh === hit && ended !== undefined ? ended : sh)),
    }
  })
  await quietly(update($, now, () => at))
  if (closed !== undefined) await quietly(refreshStatus($))

  return closed
}

// ------------------------------------------------------------------ hooks

/**
 * Adopts agents the pane did not see start: the ones already running when
 * the plugin loaded (a /reload-plugins mid-task) or whose spawn it missed.
 * `ids` limits the adoption to those agents; absent, every running agent.
 */
export async function adopt(
  $: EngineInterface,
  ids?: readonly string[],
): Promise<void> {
  const list = await $.agent.list()
  const at = await $.clock.now()
  const running = list.filter(
    a =>
      (a.status === 'running' || a.status === 'pending' || a.status === 'waiting') &&
      (ids === undefined || ids.includes(a.id)),
  )
  if (running.length === 0) return
  await update($, team, squad => {
    const known = new Set(squad.agents.map(a => a.id))
    const rows: AgentRow[] = running
      .filter(a => !known.has(a.id))
      .map(a => ({
        id: a.id,
        type: a.type,
        role: roleOf(a.type),
        description: a.description,
        prompt: t('agent.unseen'),
        startedAt: at,
        lastActiveAt: at,
        calls: 0,
        status: 'running',
      }))

    return rows.length === 0 ? squad : { ...squad, agents: withRows(squad.agents, rows) }
  })
  await update($, now, () => at)
}

/** Runs a state write and swallows its failure: the pane must never block. */
export const quietly = async (write: Promise<unknown>): Promise<void> => {
  try {
    await write
  } catch {
    // a lost redraw is better than a denied tool call
  }
}

// Endings that land together (a notice by two paths, two agents at once) play
// one sound. A module variable: a reload resets it, which costs at most a chime.
export let lastChimeAt = Number.NEGATIVE_INFINITY

/** Plays a clip unless another one just played. */
export async function chime($: EngineInterface, clip: string | undefined): Promise<void> {
  if (clip === undefined) return
  try {
    const at = await $.clock.now()
    if (at - lastChimeAt < CHIME_GAP_MS) return
    lastChimeAt = at
  } catch {
    return
  }
  await playClip($, clip)
}

/** A notice's text, whatever path brought it: close its shell and ring its owner's sound. */
export async function onNotice($: EngineInterface, text: string, via: string, loop?: string): Promise<void> {
  try {
    const closed = await onNoticeText($, text, via, loop)
    if (closed !== undefined) {
      void chime($, shellSound(closed))
      announceShell($, closed)
    }
  } catch {
    // the pane must never hold a delivery up
  }
}

/**
 * Turns the Agent tool's team paragraph on or off. The engine keeps the tool's
 * text for the thread it has sent: dropping the cached answer makes the change
 * reach the next conversation or compaction, the prompt cache left whole.
 */
export async function toggleDelegation($: EngineInterface): Promise<void> {
  await update($, delegation, isOn => !isOn)
  await quietly(read($, delegation).then(isOn => $.store.set(DELEGATION_KEY, isOn)))
  $.ui.invalidate('tool.describe')
}

/**
 * Writes the team's models and keeps them in the store; the next spawn of a
 * team agent runs on them. The Agent tool's team paragraph names them: its
 * cached text is dropped, as the Delegate switch does, for the next conversation.
 */
async function setModels($: EngineInterface, change: (models: TeamModels) => TeamModels): Promise<void> {
  // The store is the one truth, shared by every window: a change applies to what it holds now, so another
  // window's choice made since this one started is kept. Only a store that cannot be read falls back to the atom.
  const stored = await $.store.get(MODELS_KEY).then(modelsFrom, () => undefined)
  const changed = change(stored ?? (await read($, models)))
  await update($, models, () => changed)
  await quietly($.store.set(MODELS_KEY, modelsEntry(changed)))
  $.ui.invalidate('tool.describe')
}

/** Moves a role's model to the next one: Haiku, Sonnet, Opus, then Haiku again. */
export async function cycleModel($: EngineInterface, role: TeamRole): Promise<void> {
  await setModels($, m => ({ ...m, [role]: { ...m[role], model: cycled(TEAM_MODELS, m[role].model) } }))
}

/** Moves a role's effort to the next level: low up to max, then low again. */
export async function cycleEffort($: EngineInterface, role: TeamRole): Promise<void> {
  await setModels($, m => ({ ...m, [role]: { ...m[role], effort: cycled(TEAM_EFFORTS, m[role].effort) } }))
}

/** Puts every role back on what its agent file says. */
export async function resetModels($: EngineInterface): Promise<void> {
  await setModels($, () => DEFAULT_MODELS)
}

/** Shows a tab under the drawing; the next session opens on it. */
export async function showTab($: EngineInterface, id: CardId): Promise<void> {
  await update($, tab, () => id)
  await quietly($.store.set(TAB_KEY, id))
}

/** Fills the pickers with the session's slash commands and skills, built-ins and this pane's own left out. */
export async function loadChoices($: EngineInterface): Promise<void> {
  const listed = await $.command.list()
  const own = new Set([COMMAND])
  const picked = listed
    .filter(c => c.source !== 'builtin' && !own.has(c.name))
    .map(c => ({ name: c.name, description: c.description }))
    .sort((a, b) => a.name.localeCompare(b.name))
  await update($, choices, () => picked)
}

/**
 * Reads the session's skills again when the list is empty or lacks one of
 * `names`: a plugin listed late must not have its skills dropped as gone.
 */
export async function ensureChoices($: EngineInterface, names: readonly string[]): Promise<void> {
  const known = await read($, choices)
  if (known.length > 0 && names.every(n => known.some(c => c.name === n))) return
  await loadChoices($)
}

/**
 * Makes `folder` the session's project: its folder for the briefs, its key
 * for the picks, and the picks kept for it, as far as a slot or a pack still
 * holds them. Nothing picked there before, nothing picked now.
 */
export async function loadProject($: EngineInterface, folder: string): Promise<void> {
  const key = projectKeyOf(folder)
  await update($, project, () => key)
  await update($, cwd, () => folder)
  const kept = await $.store.get(ARMED_KEY).then(book => armedBookFrom(book)[key], () => undefined)
  const heldSkills = await read($, slots)
  const heldPacks = (await read($, packs)).flatMap(p => (p === null ? [] : [p.id]))
  await update($, armed, () => (kept?.skills ?? []).filter(n => heldSkills.includes(n)))
  await update($, armedPacks, () => (kept?.packs ?? []).filter(id => heldPacks.includes(id)))
}

/** Follows the session to its new project root after `/cd` or a worktree move; a root it cannot read changes nothing. */
export async function followProject($: EngineInterface): Promise<void> {
  const folder = await $.session.root().catch(() => undefined)
  if (folder === undefined || folder === '') return
  if (projectKeyOf(folder) === (await read($, project))) return
  await loadProject($, folder)
}

/** One slot changed in a list: a skill another slot already holds does not go in twice, and only a list's first copy of a skill stays. */
const withSlot = (list: readonly (string | null)[], index: number, name: string | null): (string | null)[] => {
  const isElsewhere = name !== null && list.some((one, i) => one === name && i !== index)
  const changed = isElsewhere ? [...list] : list.map((one, i) => (i === index ? name : one))

  return changed.map((one, i) => (one !== null && changed.indexOf(one) !== i ? null : one))
}

// The slot changes of this window, one at a time: each reads the store after the last one wrote it.
// A module variable: a reload starts it over, harmlessly.
let slotQueue: Promise<void> = Promise.resolve()

/**
 * Puts a skill in a slot, or empties it; the store keeps it for every session
 * and project. The change applies over what the store holds now, so a slot
 * another window filled meanwhile is kept, and changes made in this window
 * meanwhile wait their turn; a store that cannot be read keeps the change in
 * this session alone. A skill another slot holds does not go in a second one.
 */
export function setSlot($: EngineInterface, index: number, name: string | null): Promise<void> {
  const done = slotQueue.then(() => changeSlot($, index, name))
  slotQueue = done.catch(() => undefined)

  return done
}

async function changeSlot($: EngineInterface, index: number, name: string | null): Promise<void> {
  const stored = await $.store.get(SLOTS_KEY).then(
    value => ({ isRead: true, list: value === undefined ? undefined : slotsFrom(value) }),
    () => ({ isRead: false, list: undefined }),
  )
  await update($, slots, list => withSlot(stored.list ?? list, index, name))
  const held = await read($, slots)
  if (stored.isRead) await quietly($.store.set(SLOTS_KEY, held))
  // A skill no slot holds any more is no longer picked.
  const before = await read($, armed)
  if (before.some(one => !held.includes(one))) {
    await update($, armed, list => list.filter(one => held.includes(one)))
    await quietly(saveArmed($))
  }
}

/** Picks a slot's skill for the prompts to come, or unpicks it; the project keeps the choice. */
export async function toggleArmed($: EngineInterface, name: string): Promise<void> {
  await update($, armed, list => (list.includes(name) ? list.filter(one => one !== name) : [...list, name]))
  await quietly(saveArmed($))
}

/**
 * Shows the packs, the loose skills or one pack in the skills tab; any picker
 * closes and any delete waiting for its second press is forgotten. Leaving a
 * pack tidies its name, and drops it when it was never named nor filled.
 */
export async function showSkills($: EngineInterface, view: SkillView): Promise<void> {
  const before = await read($, skillView)
  await update($, picker, () => null)
  await update($, expanded, list => list.filter(one => !one.startsWith(PACK_DELETE_PREFIX)))
  if (before.kind === 'pack' && !(view.kind === 'pack' && view.id === before.id)) {
    const left = (await read($, packs)).find(one => one?.id === before.id) ?? null
    if (left !== null && cleanPackName(left.name) === '' && left.skills.every(one => one === null)) {
      await changePacks($, list => list.map(one => (one?.id === left.id ? null : one)))
    } else if (left !== null && cleanPackName(left.name) !== left.name) {
      await setPackName($, left.id, left.name, true)
    }
  }
  await update($, skillView, () => view)
}

const PACK_DELETE_PREFIX = packDeleteAsk('')

/**
 * Applies one change to the packs over what the store holds now, not over
 * this session's copy, so a pack another window made or changed meanwhile is
 * kept; the session's copy takes the result. A store that cannot be read keeps
 * the change in this session alone.
 */
async function changePacks($: EngineInterface, change: (list: (Pack | null)[]) => (Pack | null)[]): Promise<void> {
  const stored = await $.store.get(PACKS_KEY).then(
    value => ({ isRead: true, list: value === undefined ? undefined : packsFrom(value) }),
    () => ({ isRead: false, list: undefined }),
  )
  const next = change(stored.list ?? (await read($, packs)))
  await update($, packs, () => next)
  if (stored.isRead) await quietly($.store.set(PACKS_KEY, next))
}

/** Makes an empty pack in the slot pressed, or the first free one if another window took it, and opens it. */
export async function createPack($: EngineInterface, index: number): Promise<void> {
  const at = await $.clock.now()
  const id = `pack-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const made: Pack = { id, name: '', skills: Array.from({ length: PACK_SIZE }, () => null) }
  await changePacks($, list => {
    const free = list[index] === null ? index : list.indexOf(null)

    return free < 0 ? list : list.map((one, i) => (i === free ? made : one))
  })
  if (!(await read($, packs)).some(one => one?.id === id)) return
  await showSkills($, { kind: 'pack', id })
}

/**
 * Renames a pack. While it is typed the text is kept as typed (one line, cut
 * to fit), so a space at its end survives the redraw; `isDone` tidies it.
 */
export async function setPackName($: EngineInterface, id: string, typed: string, isDone = false): Promise<void> {
  const name = isDone ? cleanPackName(typed) : typed.replace(/[\r\n]+/g, ' ').slice(0, PACK_NAME_MAX)
  await changePacks($, list => list.map(one => (one?.id === id ? { ...one, name } : one)))
}

/** Puts a skill in one of a pack's slots, or empties it. */
export async function setPackSkill($: EngineInterface, id: string, slot: number, name: string | null): Promise<void> {
  await changePacks($, list =>
    list.map(one => (one?.id === id ? { ...one, skills: one.skills.map((s, i) => (i === slot ? name : s)) } : one)),
  )
}

/** Picks a pack for the prompts to come, or unpicks it; the project keeps the choice. */
export async function togglePack($: EngineInterface, id: string): Promise<void> {
  await update($, armedPacks, list => (list.includes(id) ? list.filter(one => one !== id) : [...list, id]))
  await quietly(saveArmed($))
}

/** Deletes a pack on the second press: the first one only asks. Its pick goes with it. */
export async function deletePack($: EngineInterface, id: string): Promise<void> {
  const ask = packDeleteAsk(id)
  if (!(await read($, expanded)).includes(ask)) {
    await update($, expanded, list => [...list, ask])

    return
  }
  await update($, expanded, list => list.filter(one => one !== ask))
  await changePacks($, list => list.map(one => (one?.id === id ? null : one)))
  if ((await read($, armedPacks)).includes(id)) {
    await update($, armedPacks, list => list.filter(one => one !== id))
    await quietly(saveArmed($))
  }
  await showSkills($, PACKS_VIEW)
}

/**
 * Marks a reviewer's row when the change it was sent on is small: the lines
 * `git diff --shortstat HEAD` counts, staged and not. Outside a repository, or
 * when git does not answer, nothing is said; nor when the work may be
 * committed (the branch is ahead, or the brief names a commit range or a PR),
 * which the uncommitted lines do not measure.
 */
export async function checkReviewSize($: EngineInterface, id: string, spawnCwd?: string, brief = ''): Promise<void> {
  const g = await read($, git)
  if (g.state !== 'ok') return
  if (g.ahead > 0 || namesCommittedWork(brief)) return
  // A reviewer working in another folder reviews a tree git was not read in.
  if (spawnCwd !== undefined && projectKeyOf(spawnCwd) !== (await read($, project))) return
  // New files the diff does not count may be most of the change: then the size says nothing.
  const fresh = await $.process.run(['git', 'ls-files', '--others', '--exclude-standard'], { timeoutMs: 5000 })
  if (fresh.exitCode !== 0 || fresh.stdout.trim() !== '') return
  const ran = await $.process.run(['git', 'diff', '--shortstat', 'HEAD'], { timeoutMs: 5000 })
  if (ran.exitCode !== 0) return
  const warn = reviewWarning(shortstatLines(ran.stdout))
  if (warn === undefined) return
  await update($, team, t => ({ ...t, agents: t.agents.map(a => (a.id === id && a.warn === undefined ? { ...a, warn } : a)) }))
}

/** Keeps this project's picks in the store, for its next sessions; nothing before the session knows its project. */
export async function saveArmed($: EngineInterface): Promise<void> {
  const where = await read($, project)
  if (where === '') return
  const entry = { skills: await read($, armed), packs: await read($, armedPacks), at: await $.clock.now() }
  // A read that fails would turn every other project's picks into nothing: then nothing is written.
  const book = await $.store.get(ARMED_KEY).then(armedBookFrom, () => undefined)
  if (book === undefined) return
  await $.store.set(ARMED_KEY, withArmed(book, where, entry))
}

/** Enters or leaves edit mode, where a press on a slot opens its picker; leaving closes any picker. */
export async function toggleSkillEdit($: EngineInterface): Promise<void> {
  const isEditing = (await read($, expanded)).includes(SKILLS_EDIT)
  if (isEditing) await update($, picker, () => null)
  await update($, expanded, list => (isEditing ? list.filter(one => one !== SKILLS_EDIT) : [...list, SKILLS_EDIT]))
}

/** Opens a slot's picker on its groups, the choices read afresh: a loose slot's, or one of a pack's. */
export async function openPicker($: EngineInterface, slot: number, pack?: string): Promise<void> {
  await quietly(loadChoices($))
  await update($, picker, () => ({ slot, ...(pack === undefined ? {} : { pack }), page: 0 }))
}

/** The pack a picker fills, kept as it steps between groups and pages. */
const packOf = (p: { pack?: string }): { pack?: string } => (p.pack === undefined ? {} : { pack: p.pack })

/** One step back in the picker: from a group's skills to the groups, from the groups out. */
export async function pickerBack($: EngineInterface): Promise<void> {
  await update($, picker, p => (p === null || p.group === undefined ? null : { slot: p.slot, ...packOf(p), page: 0 }))
}

/** Shows a group's skills, from their first page. */
export async function pickGroup($: EngineInterface, group: string): Promise<void> {
  await update($, picker, p => (p === null ? null : { slot: p.slot, ...packOf(p), group, page: 0 }))
}

/** Turns the picker's page; the render keeps it within range. */
export async function turnPage($: EngineInterface, delta: number): Promise<void> {
  await update($, picker, p => (p === null ? null : { ...p, page: Math.max(0, p.page + delta) }))
}

/** Fills the open picker's slot (or empties it) and closes the picker. */
export async function choose($: EngineInterface, name: string | null): Promise<void> {
  const open = await read($, picker)
  if (open === null) return
  if (open.pack === undefined) await setSlot($, open.slot, name)
  else if (name === null || !(await read($, packs)).find(one => one?.id === open.pack)?.skills.some((n, i) => n === name && i !== open.slot)) {
    // A skill the pack holds in another slot does not go in twice.
    await setPackSkill($, open.pack, open.slot, name)
  }
  await update($, picker, () => null)
}

/** Puts an agent's conversation in the main view; says why when the engine will not. */
export async function viewAgent($: EngineInterface, agentId: string): Promise<void> {
  try {
    const shown = (await $.ui.view({ agentId })) as { deny?: string }
    if (shown.deny !== undefined) $.ui.toast(t('toast.view.denied', { reason: shown.deny }))
  } catch {
    $.ui.toast(t('toast.view.failed'))
  }
}

// One compaction at a time: a second press while one runs does nothing.
export let isCompacting = false

/** Compacts the conversation, as /compact does; it waits for no turn, so a running one refuses it. */
export async function compactNow($: EngineInterface): Promise<void> {
  if (isCompacting) return
  isCompacting = true
  $.ui.toast(t('toast.compact.working'))
  try {
    const done = await $.session.compact()
    $.ui.toast(
      'skip' in done && done.skip !== undefined ? t('toast.compact.skipped', { reason: done.skip }) : t('toast.compact.done'),
    )
  } catch {
    $.ui.toast(t('toast.compact.busy'))
  } finally {
    isCompacting = false
  }
}

/** A system notification for something long that ended; never throws. */
export async function announce($: EngineInterface, text: string): Promise<void> {
  try {
    await $.ui.notify(text, { title: branding.title })
  } catch {
    // notifications off or no channel: the pane still shows the end
  }
}

/** Copies a text to the clipboard of the surface that was pressed. */
export async function copyText($: EngineInterface, text: string, press: UiPressArgument): Promise<void> {
  try {
    const copied = await $.ui.copy({ text, surface: press.surface })
    $.ui.toast(copied.isCopied ? t('toast.copy.done') : t('toast.copy.failed'))
  } catch {
    $.ui.toast(t('toast.copy.failed'))
  }
}

/** Ends a foreground job once, with how it ended. */
export async function endJob($: EngineInterface, id: string, status: ForegroundJob['status']): Promise<void> {
  const at = await $.clock.now()
  await update($, team, t => ({
    ...t,
    jobs: t.jobs.map(j => (j.id === id && j.status === 'running' ? { ...j, status, endedAt: at } : j)),
  }))
  await update($, now, () => at)
}

/**
 * Runs a foreground shell call; an install, build or download gets a row of
 * its own while it runs and its outcome after. One moved to the background
 * mid-way (ctrl+b, or its timeout) carries on as a background shell.
 */
export async function runTracked<R extends Ran>(
  $: EngineInterface,
  e: ShellCall,
  run: () => Promise<R>,
  at: number,
  owner?: { id: string; role: Role },
): Promise<R> {
  const match = classify(e.command)
  if (match === undefined) {
    const ran = await run()
    afterShell($, e.command, ran, at)

    return ran
  }
  const id = e.tool_use_id ?? `job-${at}`
  const job: ForegroundJob = {
    ...match,
    id,
    tool: e.tool,
    command: e.command.slice(0, 400),
    startedAt: at,
    status: 'running',
    ...(owner === undefined ? {} : { owner }),
  }
  await quietly(update($, team, t => ({ ...t, jobs: withJob(t.jobs, job) })))
  await quietly(update($, now, () => at))
  let ran: R
  try {
    ran = await run()
  } catch (error) {
    await quietly(endJob($, id, 'failed'))
    throw error
  }
  const backgroundId = (ran.result as { backgroundTaskId?: unknown } | undefined)?.backgroundTaskId
  if (typeof backgroundId === 'string') {
    const shell = shellOf(e, ran, at, owner)
    await quietly(
      update($, team, t => ({ ...t, jobs: t.jobs.filter(j => j.id !== id), shells: withShell(t.shells, shell) })),
    )
    await quietly(refreshStatus($))
  } else {
    const status = jobEndOf(ran)
    await quietly(endJob($, id, status))
    const took = (await $.clock.now()) - at
    if (status !== 'stopped' && took >= LONG_MS) {
      void announce($, t(status === 'done' ? 'notify.done' : 'notify.failed', { what: titleOf(match), time: seconds(took) }))
    }
  }
  afterShell($, e.command, ran, at)

  return ran
}

/** A background shell that ran long and ended on its own: a system notification says how. */
export function announceShell($: EngineInterface, sh: ShellTask): void {
  const took = (sh.endedAt ?? sh.startedAt) - sh.startedAt
  if (took < LONG_MS || (sh.outcome !== 'completed' && sh.outcome !== 'failed')) return
  const what = sh.job === undefined ? sh.description : titleOf(sh.job)
  void announce($, t(sh.outcome === 'completed' ? 'notify.done' : 'notify.failed', { what, time: seconds(took) }))
}

/**
 * After a shell call: records what it did with git, as the tool reported it,
 * and reads the repository again shortly. GitHub is asked again only when
 * the call could have changed something there.
 */
export function afterShell($: EngineInterface, command: string, ran: Ran, at: number): void {
  const op = (ran.result as { gitOperation?: GitOperation } | undefined)?.gitOperation
  const ops = opsOf(op, at)
  if (ops.length > 0) {
    void quietly(update($, git, g => ({ ...g, ops: [...g.ops, ...ops].slice(-4) })))
    scheduleGit($, op?.push !== undefined || op?.pr !== undefined || op?.branch !== undefined)

    return
  }
  if (TOUCHES_GIT.test(command)) {
    scheduleGit($, /\b(push|pull|fetch|merge|checkout|switch|pr|run)\b/.test(command))
  }
}

/** Output file sizes last read, by shell id: an unchanged file is not read again. */
export const tailSizes = new Map<string, number>()

/**
 * Reads the output files of running background shells for the last
 * percentage they printed. A file that grew is news: its shell still runs.
 * A file that did not grow, or is too big to copy every two seconds, is not read.
 */
export async function readTails($: EngineInterface): Promise<void> {
  const t = await read($, team)
  const at = await $.clock.now()
  const found = new Map<string, number | undefined>()
  const grew = new Set<string>()
  for (const sh of t.shells.filter(one => needsTail(one, at))) {
    try {
      const stat = await $.fs.stat(sh.outputPath as string)
      const before = tailSizes.get(sh.id)
      if (before === stat.size) continue
      tailSizes.set(sh.id, stat.size)
      // A file first seen (a new shell, or any after a reload) says nothing of when it last grew.
      if (before !== undefined) grew.add(sh.id)
      if (stat.size > TAIL_MAX_BYTES) continue
      found.set(sh.id, progressOf(await $.fs.read(sh.outputPath as string)))
    } catch {
      // not written yet, or gone: the next tick tries again while it runs
    }
  }
  // Ended shells are never read again.
  for (const id of tailSizes.keys()) if (!t.shells.some(sh => sh.id === id && needsTail(sh, at))) tailSizes.delete(id)
  if (grew.size === 0 && found.size === 0) return
  await update($, team, cur => ({
    ...cur,
    shells: cur.shells.map(sh => {
      if ((!grew.has(sh.id) && !found.has(sh.id)) || sh.endedAt !== undefined) return sh
      const progress = found.get(sh.id)

      return { ...sh, ...(grew.has(sh.id) ? { lastNewsAt: at } : {}), ...(progress === undefined ? {} : { progress }) }
    }),
  }))
}

// One git read at a time: a request that lands meanwhile is folded into one
// more read after it. Module variables: a reload starts them over, harmlessly.
export let gitBusy = false
export let gitAgain: { remote: boolean } | undefined
export let gitTimer = false
export let gitTimerRemote = false

/** Reads the repository again; `remote` asks GitHub too. Never throws. */
export async function refreshGit($: EngineInterface, remote: boolean): Promise<void> {
  if (gitBusy) {
    gitAgain = { remote: remote || gitAgain?.remote === true }

    return
  }
  gitBusy = true
  try {
    await update($, git, g => ({ ...g, isLoading: true }))
    const before = await read($, git)
    const after = await readGit($, before, remote)
    // Ops recorded while git answered are newer than `before`: keep them.
    await update($, git, g => ({ ...after, ops: g.ops, isLoading: false }))
    const finished = ciFinished(before, after)
    if (finished !== undefined) {
      $.ui.toast(finished.text, { timeoutMs: 8000 })
      void chime($, finished.isOk ? LOOK.main.sound : FAIL_SOUND)
    }
  } catch {
    await quietly(update($, git, g => ({ ...g, isLoading: false })))
  } finally {
    gitBusy = false
    const again = gitAgain
    gitAgain = undefined
    if (again !== undefined) void refreshGit($, again.remote)
  }
}

/** Reads git a little later: commands that touch it come in bursts. */
export function scheduleGit($: EngineInterface, remote: boolean, delayMs = 2500): void {
  gitTimerRemote = gitTimerRemote || remote
  if (gitTimer) return
  gitTimer = true
  $.clock.after(delayMs, () => {
    const wantsRemote = gitTimerRemote
    gitTimer = false
    gitTimerRemote = false
    void refreshGit($, wantsRemote)
  })
}

/** Takes the engine's figures: keeps them for the pane and warns once per threshold crossed. */
export async function takeUsage($: EngineInterface, figures: Pick<SessionMeasureInput, 'rateLimits' | 'context'>) {
  const at = await $.clock.now()
  // The trail outlives the session: a new one picks it up from the store.
  const before = (await read($, usage)).trail ?? (await $.store.get(TRAIL_KEY).then(trailFrom, () => undefined))
  const reading = usageOf(figures, at)
  const trail = extendTrail(before, reading.windows.find(w => w.kind === 'five_hour'), at)
  const taken = trail === undefined ? reading : { ...reading, trail }
  await update($, usage, () => taken)
  // Compared by the last reading, not the count: a full trail keeps its length.
  const lastAt = (one: Trail | undefined): number | undefined => one?.points[one.points.length - 1]?.[0]
  if (trail !== undefined && lastAt(trail) !== lastAt(before)) {
    await quietly($.store.set(TRAIL_KEY, trail))
  }
  const stored = await $.store.get(WARNED_KEY).then(
    v => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []),
    () => [] as string[],
  )
  const warned = pruneWarned(stored, at)
  const { keys, lines } = newWarnings(taken.windows, warned)
  if (keys.length === 0) {
    if (warned.length !== stored.length) await quietly($.store.set(WARNED_KEY, warned))

    return
  }
  await quietly($.store.set(WARNED_KEY, [...warned, ...keys]))
  for (const line of lines) {
    const w = taken.windows.find(one => line.startsWith(windowName(one.kind)))
    const reset = resetText(w?.resetsAt, at)
    $.ui.toast(`⚠ ${line}${reset === undefined ? '' : `: ${reset}`}`, { timeoutMs: 8000 })
  }
}

// ------------------------------------------------------- the team rules in CLAUDE.md

/**
 * The Claude config folder: CLAUDE_CONFIG_DIR, else the home folder with
 * `.claude`. On Windows the home is USERPROFILE when it is set (what Node's
 * os.homedir reads first there), else HOME; elsewhere HOME first, so WSL, which
 * may carry the Windows USERPROFILE, writes its own, and USERPROFILE only when
 * HOME is not set either. Undefined when none is set.
 */
export async function configDir($: EngineInterface): Promise<string | undefined> {
  const plain = (dir: string): string => dir.replace(/[\\/]+$/, '')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined))?.trim()
  if (config !== undefined && config !== '') return plain(config)
  const isWindows = (await $.env.get('OS').catch(() => undefined)) === 'Windows_NT'
  const profile = (await $.env.get('USERPROFILE').catch(() => undefined))?.trim() ?? ''
  const home = (await $.env.get('HOME').catch(() => undefined))?.trim() ?? ''
  const base = (isWindows ? profile : '') || home || profile
  if (base === '') return undefined

  return `${plain(base)}/.claude`
}

/** Where the global CLAUDE.md is: in the config folder. */
export async function claudeMdPath($: EngineInterface): Promise<string | undefined> {
  const dir = await configDir($)

  return dir === undefined ? undefined : `${dir}/CLAUDE.md`
}

/** Where the session log is, under the config folder: one file per session. A runs.md from 0.8.6 or before, beside it, is left as it is. */
export const RUNS_DIR = 'agent-team/runs'

/** What the session end must have left to write the log: with less, nothing is written. */
export const RUNS_MIN_MS = 400

/** Whether the session end has too little of its budget left to write the log. */
export const isLateForRuns = (remainingMs: number): boolean => remainingMs < RUNS_MIN_MS

/** Names tried for one session's file: a taken one gets a suffix (`-2`, `-3`...), so the log never writes over a file. */
const RUNS_NAMES = 20

/**
 * Writes this session's entry to a file of its own in the session log, under
 * the config folder (its folders are made when missing), and says whether it
 * did. No other file is read: two windows ending together write two files. A
 * name already taken gets a suffix; nothing is written over. With less than
 * RUNS_MIN_MS of the end's budget left (`remainingMs`, asked just before the
 * write) nothing is written and one line goes to the debug log: the entry is
 * tried again at a later end of this process (a /clear, a resume), and lost
 * on a real exit.
 */
export async function writeRuns(
  $: EngineInterface,
  entry: string,
  at: number,
  sessionId: string,
  remainingMs: () => number = () => Number.POSITIVE_INFINITY,
): Promise<boolean> {
  const dir = await configDir($)
  if (dir === undefined || entry === '') return false
  const base = `${dir}/${RUNS_DIR}/${runsFileName(at, sessionId)}`
  let path: string | undefined
  for (let n = 1; n <= RUNS_NAMES && path === undefined; n += 1) {
    const name = n === 1 ? `${base}.md` : `${base}-${n}.md`
    if (!(await $.fs.exists(name))) path = name
  }
  if (path === undefined) {
    $.ui.log(`agent-team: ${RUNS_NAMES} session log files named ${base} already exist; this entry was not written`, { to: 'debug' })

    return false
  }
  if (isLateForRuns(remainingMs())) {
    $.ui.log(`agent-team: the session end had ${Math.round(remainingMs())} ms left; the session log entry was not written`, { to: 'debug' })

    return false
  }
  await $.fs.write(path, entry)

  return true
}

/** The copies of CLAUDE.md the pane keeps beside it: how they are named and how many stay. */
const BACKUP_MARK = '.agent-team-'
const BACKUP_KEEP = 5

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The bytes of a padded base64 text. */
const bytesOfBase64 = (base64: string): number[] => {
  const bytes: number[] = []
  let bits = 0
  let held = 0
  for (const ch of base64) {
    const value = BASE64.indexOf(ch)
    if (value < 0) continue
    held = (held << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((held >> bits) & 0xff)
    }
  }

  return bytes
}

/**
 * The file as the person wrote it: its text, whether it began with a UTF-8 BOM
 * (set aside, put back on writing) and, as `isUtf8`, whether its bytes are
 * exactly the UTF-8 of that text. A file in another encoding reads as text
 * with replacement characters, and writing that back would damage it.
 */
async function readFile($: EngineInterface, path: string): Promise<{ text: string; bom: boolean; isUtf8: boolean }> {
  const bytes = bytesOfBase64((await $.fs.read(path, { as: 'bytes' })).base64)
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const body = bom ? bytes.slice(3) : bytes
  const text = (await $.fs.read(path)).replace(/^﻿/, '')
  const again = new TextEncoder().encode(text)

  return { text, bom, isUtf8: again.length === body.length && body.every((byte, i) => byte === again[i]) }
}

/** A backup name next to `path` that nothing holds: the time to the millisecond and a counter. */
async function freeBackup($: EngineInterface, path: string): Promise<string> {
  const stamp = new Date(await $.clock.now()).toISOString().replace(/[-:.]/g, '').slice(0, 18)
  for (let n = 0; ; n += 1) {
    const name = `${path}${BACKUP_MARK}${stamp}-${n}.bak`
    if (!(await $.fs.exists(name))) return name
  }
}

/** Removes a file: through PowerShell on Windows (the path in the environment, so no quoting can break it), else `rm`. */
async function removeFile($: EngineInterface, path: string): Promise<void> {
  if ((await $.env.get('OS').catch(() => undefined)) === 'Windows_NT') {
    await $.process.run(
      ['powershell.exe', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', 'Remove-Item -LiteralPath $env:AGENT_TEAM_DELETE -Force'],
      { env: { AGENT_TEAM_DELETE: path.replace(/\//g, '\\') }, timeoutMs: 10_000 },
    )
  } else {
    await $.process.run(['rm', '-f', '--', path], { timeoutMs: 10_000 })
  }
}

/** Keeps the last BACKUP_KEEP copies beside CLAUDE.md and removes the older ones; a failure here changes nothing the person asked for. */
async function pruneBackups($: EngineInterface, path: string): Promise<void> {
  try {
    const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    const dir = path.slice(0, cut)
    const file = path.slice(cut + 1)
    const names = (await $.fs.list(dir))
      .filter(entry => entry.kind === 'file' && entry.name.startsWith(`${file}${BACKUP_MARK}`) && entry.name.endsWith('.bak'))
      .map(entry => entry.name)
      .sort()
    for (const name of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) await removeFile($, `${dir}/${name}`)
  } catch {
    // an old copy left over is harmless
  }
}

/**
 * Puts the team rules in the global CLAUDE.md, or takes them out, and says
 * what happened. Nothing is written when the file is not UTF-8, its markers
 * cannot be trusted or an older team section is there. A file that exists is
 * copied next to itself first, and a symbolic link is written through to what
 * it leads to.
 */
export async function changeRules($: EngineInterface, mode: 'install' | 'remove'): Promise<string> {
  const path = await claudeMdPath($)
  if (path === undefined) return t('rules.noPlace')
  let backup: string | undefined
  try {
    const exists = await $.fs.exists(path)
    const stat = exists ? await $.fs.stat(path, { resolve: true }).catch(() => undefined) : undefined
    const real = stat?.isLink === true && stat.realPath !== undefined ? stat.realPath : path
    const file = exists ? await readFile($, real) : undefined
    if (file !== undefined && !file.isUtf8) return t('rules.notUtf8', { path })
    const plan = mode === 'install' ? planInstall(file?.text) : planRemove(file?.text)
    if (plan.kind === 'malformed') return t('rules.malformed', { path, why: t(`rules.why.${plan.why}`) })
    if (plan.kind === 'current') return t('rules.current', { path })
    if (plan.kind === 'none') return t('rules.none', { path })
    if (plan.kind === 'marker') return t('rules.marker', { path })
    if (plan.kind === 'legacy') return t('rules.legacy', { path, line: plan.line, heading: plan.heading })
    const lead = file?.bom === true ? '﻿' : ''
    if (file !== undefined) {
      const name = await freeBackup($, path)
      await $.fs.write(name, `${lead}${file.text}`)
      backup = name
    }
    await $.fs.write(real, `${lead}${plan.text}`)
    await pruneBackups($, path)
    const done = { create: 'rules.created', append: 'rules.appended', replace: 'rules.replaced', remove: 'rules.removed' } as const
    const key = plan.kind === 'replace' && plan.isEdited ? 'rules.replacedEdited' : done[plan.kind]

    return t(key, { path, backup: backup ?? '' })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    return backup === undefined ? t('rules.failed', { path, reason }) : t('rules.failedAfterBackup', { path, reason, backup })
  }
}

// ------------------------------------------------------------- the update notice

/** Asks GitHub for the kit's latest release; undefined when it cannot be had. */
async function latestRelease($: EngineInterface): Promise<{ version: string; url: string } | undefined> {
  try {
    const answer = await $.http.fetch(RELEASE_URL, {
      headers: { 'User-Agent': 'agent-team-kit', Accept: 'application/vnd.github+json' },
    })

    return answer.ok ? releaseFrom(answer.text) : undefined
  } catch {
    return undefined
  }
}

/**
 * Tells when a newer release of the kit exists: GitHub is asked at most once a
 * day (the time and the answer kept in the store), the version running is read
 * from the plugin's own manifest, a newer one is kept for the strip and
 * announced in one toast per version. A failed ask stays silent.
 */
export async function checkForUpdate($: EngineInterface, isEnabled: boolean): Promise<void> {
  if (!isEnabled) {
    await update($, updateNotice, () => null)

    return
  }
  // The person asked for no non-essential traffic: this is one, so GitHub is not asked, whatever the variable holds.
  const noTraffic = await $.env.get('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC').catch(() => undefined)
  const isQuiet = noTraffic !== undefined && noTraffic !== ''
  const own = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).then(manifestVersion, () => undefined)
  if (own === undefined) return
  const at = await $.clock.now()
  let record = await $.store.get(UPDATE_KEY).then(recordFrom, () => ({ at: 0 }) as UpdateRecord)
  if (!isQuiet && (record.at === 0 || record.at > at || at - record.at >= UPDATE_MS)) {
    const latest = await latestRelease($)
    record = { ...record, at, ...(latest === undefined ? {} : latest) }
    await quietly($.store.set(UPDATE_KEY, record))
  }
  const { version, url } = record
  if (version === undefined || url === undefined || !isNewer(version, own)) {
    await update($, updateNotice, () => null)

    return
  }
  await update($, updateNotice, () => ({ version, url }))
  if (record.toasted !== version) {
    $.ui.toast(t('update.toast', { version }), { timeoutMs: 10_000 })
    await quietly($.store.set(UPDATE_KEY, { ...record, toasted: version }))
  }
}
