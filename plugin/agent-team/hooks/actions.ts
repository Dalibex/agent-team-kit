// Everything that acts through `$`: the pane's writes, git and gh, sounds, notices and the skill slots.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionMeasureInput, UiPressArgument } from 'claude-code'
import type { AgentRow, ForegroundJob, Pack, Role, ShellTask, SkillView, Trail } from '../types'
import { ciFinished, opsOf, readGit } from './github'
import { classify, progressOf } from './jobs'
import { extendTrail, newWarnings, pruneWarned, resetText, trailFrom, usageOf, windowName } from './usage'
import { branding, FAIL_SOUND, LOOK, seconds } from './look'
import { ARMED_KEY, armedBookFrom, CHIME_GAP_MS, cleanPackName, DELEGATION_KEY, PACK_NAME_MAX, packsFrom, projectKeyOf, reviewWarning, shortstatLines, closeRow, COMMAND, EMPTY, FIRST_TAB, GIT_SHAPE, isShellRunning, jobEndOf, LONG_MS, needsTail, NO_CHOICES, NO_IDS, NO_PACKS, NO_PICKER, NO_SLOTS, PACK_SIZE, packDeleteAsk, PACKS_KEY, PACKS_VIEW, roleOf, shellOf, shellSound, SKILLS_EDIT, SLOTS_KEY, STALE_MS, statusOfListed, TAB_KEY, TAIL_MAX_BYTES, TEAM_SHAPE, titleOf, TOUCHES_GIT, TRAIL_KEY, USAGE_SHAPE, WARNED_KEY, withArmed, withJob, withRows, withShell } from './state'
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
  if (agents > 0) parts.push(`${agents} agente${agents === 1 ? '' : 's'} trabajando`)
  if (shells > 0) parts.push(`${shells} shell${shells === 1 ? '' : 's'} en segundo plano`)
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
  await update($, team, t =>
    t.agents.reduce((acc, row) => {
      if (row.status !== 'running' || row.lastActiveAt >= listedAt) return acc
      const status = listed.get(row.id)
      const ended = status === undefined ? undefined : statusOfListed(status)
      if (ended !== undefined) {
        return closeRow(acc, row.id, {
          status: ended,
          endedAt: listedAt,
          endNote: 'cerrado según la lista de agentes del motor',
          closedByList: true,
        })
      }
      if (status === undefined && listedAt - row.lastActiveAt > STALE_MS) {
        return closeRow(acc, row.id, {
          status: 'stopped',
          endedAt: listedAt,
          endNote: `sin noticias desde hace ${seconds(listedAt - row.lastActiveAt)}`,
          closedByList: true,
        })
      }

      return acc
    }, t),
  )
  await update($, now, () => listedAt)
  await refreshStatus($)
}

/** Closes the shell a task notification is about, by the ids it carries. */
export async function closeShell(
  $: EngineInterface,
  task: { id?: string; toolUseId?: string; status?: string },
  how: string,
): Promise<ShellTask | undefined> {
  const at = await $.clock.now()
  let hit: ShellTask | undefined
  const key = task.id ?? task.toolUseId ?? ''
  await update($, team, t => {
    hit = undefined
    if (key !== '' && t.seen.includes(key)) return t
    const running = t.shells.filter(sh => isShellRunning(sh, at))
    const found =
      running.find(sh => task.toolUseId !== undefined && sh.id === task.toolUseId) ??
      running.find(sh => task.id !== undefined && (sh.taskId === task.id || sh.id === task.id))
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
    const running = t.shells.filter(sh => isShellRunning(sh, at) && inLoop(sh))
    const byId = t.shells
      .filter(sh => isShellRunning(sh, at))
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
  await update($, team, t => {
    const known = new Set(t.agents.map(a => a.id))
    const rows: AgentRow[] = running
      .filter(a => !known.has(a.id))
      .map(a => ({
        id: a.id,
        type: a.type,
        role: roleOf(a.type),
        description: a.description,
        prompt: '(empezó antes de que el panel mirase, así que no se sabe su encargo)',
        startedAt: at,
        lastActiveAt: at,
        calls: 0,
        status: 'running',
      }))

    return rows.length === 0 ? t : { ...t, agents: withRows(t.agents, rows) }
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

/** Puts a skill in a slot, or empties it; the store keeps it for every session and project. */
export async function setSlot($: EngineInterface, index: number, name: string | null): Promise<void> {
  await update($, slots, list => list.map((one, i) => (i === index ? name : one)))
  const held = await read($, slots)
  await quietly($.store.set(SLOTS_KEY, held))
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
 * when git does not answer, nothing is said.
 */
export async function checkReviewSize($: EngineInterface, id: string, spawnCwd?: string): Promise<void> {
  const g = await read($, git)
  if (g.state !== 'ok') return
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
    if (shown.deny !== undefined) $.ui.toast(`No se puede abrir su conversación: ${shown.deny}`)
  } catch {
    $.ui.toast('No se puede abrir su conversación ahora.')
  }
}

// One compaction at a time: a second press while one runs does nothing.
export let isCompacting = false

/** Compacts the conversation, as /compact does; it waits for no turn, so a running one refuses it. */
export async function compactNow($: EngineInterface): Promise<void> {
  if (isCompacting) return
  isCompacting = true
  $.ui.toast('Compactando el contexto…')
  try {
    const done = await $.session.compact()
    $.ui.toast('skip' in done && done.skip !== undefined ? `No se compactó: ${done.skip}` : 'Contexto compactado.')
  } catch {
    $.ui.toast('No se puede compactar mientras Claude trabaja: espera a que acabe el turno.')
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
    $.ui.toast(copied.isCopied ? 'Informe copiado.' : 'No se pudo copiar el informe.')
  } catch {
    $.ui.toast('No se pudo copiar el informe.')
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
      void announce($, `${titleOf(match)} ${status === 'done' ? 'terminó' : 'falló'} tras ${seconds(took)}`)
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
  void announce($, `${what} ${sh.outcome === 'completed' ? 'terminó' : 'falló'} tras ${seconds(took)}`)
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
 * percentage they printed. A file that did not grow, or is too big to copy
 * every two seconds, is left alone.
 */
export async function readTails($: EngineInterface): Promise<void> {
  const t = await read($, team)
  const at = await $.clock.now()
  const found = new Map<string, number | undefined>()
  for (const sh of t.shells.filter(one => needsTail(one, at))) {
    try {
      const stat = await $.fs.stat(sh.outputPath as string)
      if (stat.size > TAIL_MAX_BYTES || tailSizes.get(sh.id) === stat.size) continue
      tailSizes.set(sh.id, stat.size)
      found.set(sh.id, progressOf(await $.fs.read(sh.outputPath as string)))
    } catch {
      // not written yet, or gone: the next tick tries again while it runs
    }
  }
  // Ended shells are never read again.
  for (const id of tailSizes.keys()) if (!t.shells.some(sh => sh.id === id && needsTail(sh, at))) tailSizes.delete(id)
  if (found.size === 0) return
  await update($, team, cur => ({
    ...cur,
    shells: cur.shells.map(sh => {
      if (!found.has(sh.id)) return sh
      const progress = found.get(sh.id)

      return progress === undefined ? sh : { ...sh, progress }
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
