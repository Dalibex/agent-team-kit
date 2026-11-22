import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { AgentRow, MainLoop } from '../types'
import { ciPollMs } from './github'
import { adopt, afterShell, announce, announceShell, changeRules, checkForUpdate, checkReviewSize, chime, closeShell, ensureChoices, followProject, loadChoices, loadProject, onNotice, onTaskStop, quietly, readTails, reconcile, refreshGit, refreshStatus, runTracked, scheduleGit, takeUsage, writeRuns } from './actions'
import { beginLanguage, settleLanguage, t } from './i18n'
import { branding, brandingOf, nameOf, seconds, setBranding } from './look'
import { UPDATE_MS } from './update'
import { renderPane } from './pane'
import { addRun, apiErrorText, COMMAND, contextFor, DELEGATION_KEY, detailOf, editPathOf, isMissedRound, isTeamBrief, TEAM_TYPES, withRead, spawnWarning, teamContext, whereOf, withTeamDelegation, EMPTY, endRow, FIRST_TAB, GIT_LOCAL_MS, GIT_SHAPE, IDLE_MAIN, isAlive, LOG_LINES, LONG_MS, needsTail, NO_CHOICES, NO_IDS, NO_PACKS, NO_SLOTS, OPEN_KEY, PACKS_KEY, packsFrom, PANE, PERSON_ORIGINS, namesPicked, pickedSkills, readPathOf, RECONCILE_MS, roleOf, runsEntry, teamRows, markOf, NO_LOGGED, plusTokens, workedOf, shellOf, shellSound, SLOTS_KEY, withSkill, slotsFrom, soundFor, statusOfTurn, stopLeftovers, TAB_KEY, tabFrom, TAIL_MS, TEAM_SHAPE, tokensOf, withRows, withShell } from './state'
import { NO_GIT } from './github'

// The state this module reads or writes; refs written here, starts and shapes from state.ts.
const team = atom({ plugin: 'agent-team', key: 'team' } as const, EMPTY, { shape: TEAM_SHAPE })
const now = atom({ plugin: 'agent-team', key: 'now' } as const, 0)
const git = atom({ plugin: 'agent-team', key: 'git' } as const, NO_GIT, { shape: GIT_SHAPE })
const tab = atom({ plugin: 'agent-team', key: 'tab' } as const, FIRST_TAB)
const slots = atom({ plugin: 'agent-team', key: 'slots' } as const, NO_SLOTS)
const armed = atom({ plugin: 'agent-team', key: 'armed' } as const, NO_IDS)
const packs = atom({ plugin: 'agent-team', key: 'packs' } as const, NO_PACKS)
const armedPacks = atom({ plugin: 'agent-team', key: 'armedPacks' } as const, NO_IDS)
const project = atom({ plugin: 'agent-team', key: 'project' } as const, '')
const cwd = atom({ plugin: 'agent-team', key: 'cwd' } as const, '')
const choices = atom({ plugin: 'agent-team', key: 'choices' } as const, NO_CHOICES)
const delegation = atom({ plugin: 'agent-team', key: 'delegation' } as const, true)
const logged = atom({ plugin: 'agent-team', key: 'logged' } as const, NO_LOGGED)

export const register: Register = (on, options) => {
  setBranding(brandingOf(options.teamName))
  // An explicit `language` is known now; `auto` waits for the first hook that has the engine to read the environment with.
  beginLanguage(options.language)
  // Notification rows already checked against the shells: the transcript
  // redraws them often, and each check would be a no-op state pass.
  const checkedRows = new Set<string>()

  on('session.start', async ($, e, next) => {
    await settleLanguage($, options.language, true)
    await $.command.register({
      name: COMMAND,
      description: t('command.description'),
      argumentHint: '[rules [off]]',
    })
    // Open unless the person hid it with /agent-team, a choice kept across sessions.
    const wasHidden = await $.store.get(OPEN_KEY).then(
      v => v === false,
      () => false,
    )
    if (!wasHidden) void quietly($.ui.open({ id: PANE, title: branding.title }))
    await quietly(adopt($))
    const storedDelegation = await $.store.get(DELEGATION_KEY).then(v => v !== false, () => true)
    await quietly(update($, delegation, () => storedDelegation))
    const storedTab = await $.store.get(TAB_KEY).then(tabFrom, () => undefined)
    if (storedTab !== undefined) await quietly(update($, tab, () => storedTab))
    // The 0.7 slots are kept as they were: they are the loose skills now.
    const storedSlots = await $.store.get(SLOTS_KEY).then(slotsFrom, () => undefined)
    if (storedSlots !== undefined) await quietly(update($, slots, () => storedSlots))
    const storedPacks = await $.store.get(PACKS_KEY).then(packsFrom, () => undefined)
    if (storedPacks !== undefined) await quietly(update($, packs, () => storedPacks))
    // The picks are this project's: what was picked here last time, still held by a slot or a pack.
    await quietly(loadProject($, e.cwd))
    // The slots' tooltips describe their skills: the list is read once the session is up.
    $.clock.after(2000, () => void quietly(loadChoices($)))
    // The figures the status line already has: the pane need not wait for the next turn.
    await quietly($.session.usage().then(figures => takeUsage($, figures)))
    // git and gh are asked off the start's path, once the session is up.
    scheduleGit($, true, 1500)
    // The kit's latest release, asked for off the start's path; the ticker asks again once a day if the session lasts.
    const isCheckingUpdates = options.updateCheck !== false
    $.clock.after(3000, () => void quietly(checkForUpdate($, isCheckingUpdates)))

    // One ticker for the whole session: it only writes while something moves,
    // now and then checks running rows against the engine's own list, reads
    // background jobs' output, and asks GitHub again while CI still runs.
    // It writes once more on the alive-to-idle edge, so the last afterglow is drawn away.
    let checkedAt = 0
    let tailedAt = 0
    let wasAlive = false
    let updatedAt = await $.clock.now()
    $.clock.every(1000, async () => {
      try {
        const t = await read($, team)
        const at = await $.clock.now()
        const alive = isAlive(t, at)
        if (alive || wasAlive) await update($, now, () => at)
        wasAlive = alive
        if (at - checkedAt >= RECONCILE_MS && t.agents.some(a => a.status === 'running')) {
          checkedAt = at
          await quietly(reconcile($, at))
        }
        if (at - tailedAt >= TAIL_MS && t.shells.some(sh => needsTail(sh, at))) {
          tailedAt = at
          await quietly(readTails($))
        }
        if (isCheckingUpdates && at - updatedAt >= UPDATE_MS) {
          updatedAt = at
          void quietly(checkForUpdate($, true))
        }
        const g = await read($, git)
        // GitHub is asked less often the longer CI stays unchanged, and no more after an hour of it.
        const wait = ciPollMs(g)
        if (g.state === 'ok' && !g.isLoading && wait !== undefined && at - g.remoteAt >= wait) {
          void refreshGit($, true)
        }
      } catch {
        // a missed tick is redrawn by the next one; the interval must live on
      }
    })

    return next(e)
  })

  // A session that used the team leaves one entry in the session log: written
  // from the pane's own state, no model involved. It never holds the end back.
  on('session.end', async ($, e, next) => {
    if (options.sessionLog !== false) {
      await quietly(
        (async () => {
          await settleLanguage($, options.language)
          const squad = await read($, team)
          if (teamRows(squad.agents).length === 0) return
          const where = whereOf(undefined, await read($, cwd), await read($, git))
          const at = await $.clock.now()
          const entry = runsEntry(squad, where, at, await read($, logged))
          if (entry === '') return
          // Only what reached the log counts as logged: a skipped entry is tried again at a later end of
          // this process (a /clear, a resume); on a real exit it is lost. The budget is read just before the write.
          if (await writeRuns($, entry, at, e.sessionId, () => next.budget.remainingMs)) await update($, logged, () => markOf(squad))
        })(),
      )
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // The skills picked in the slots ride along with every prompt the person
  // sends while they stay picked: the model reads which to have loaded, the
  // person's text stays as typed. The line under the drawing shows them.
  on('prompt.submit', async ($, e, next) => {
    await settleLanguage($, options.language)
    if (e.command !== undefined || e.isMeta === true || !PERSON_ORIGINS.has(e.origin.kind)) return next(e)
    // After `/cd` the picks are the new project's.
    await quietly(followProject($))
    const loose = await read($, armed)
    const packIds = await read($, armedPacks)
    if (loose.length === 0 && packIds.length === 0) return next(e)
    // A skill uninstalled since it was put in a slot is left out, the session's list read again when it lacks one.
    await quietly(ensureChoices($, namesPicked(loose, await read($, packs), packIds)))
    const lines = contextFor(pickedSkills(loose, await read($, packs), packIds, await read($, choices)))
    if (lines.length === 0) return next(e)

    return next({ ...e, context: [...(e.context ?? []), ...lines] })
  }).catch(($, e, next) => next(e))

  // The engine's own measurements: after each main turn, and when a limit
  // window moves a whole point. Pushed, so the pane never polls for them.
  on('session.measure', async ($, e, next) => {
    await settleLanguage($, options.language)
    await quietly(takeUsage($, e))

    return next(e)
  }).catch(($, e, next) => next(e))

  // The engine's Agent tool advises against delegating unasked; the person
  // asked for a team, so the team's own paragraph takes that one's place,
  // unless they turned it off in the pane (read when a session draws the tool).
  on('tool.describe', { tool: 'Agent' }, async ($, e, next) => {
    await settleLanguage($, options.language)
    const described = await next(e)
    const isOn = await $.store.get(DELEGATION_KEY).then(v => v !== false, () => true)

    return isOn ? { ...described, description: withTeamDelegation(described.description) } : described
  }).catch(($, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    await settleLanguage($, options.language)
    // `/agent-team rules` and `/agent-team rules off` handle the team rules in CLAUDE.md; bare, the command toggles the pane.
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(word => word !== '')
    if (words.length > 0) {
      const isRules = words[0] === 'rules' && (words.length === 1 || (words[1] === 'off' && words.length === 2))
      // CLAUDE.md is the person's: only a command they typed may change it, not a plugin, a schedule or a notification.
      if (isRules && !PERSON_ORIGINS.has(e.origin.kind)) return { text: t('rules.typed') }
      if (isRules) return { text: await changeRules($, words.length === 1 ? 'install' : 'remove') }

      return { text: t('command.usage') }
    }
    const mine = await $.ui.panes()
    const isOpen = mine.some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      await $.store.set(OPEN_KEY, false)

      return { text: t('command.hidden', { title: branding.title }) }
    }
    await $.ui.open({ id: PANE, title: branding.title })
    await $.store.set(OPEN_KEY, true)

    return { text: t('command.shown', { title: branding.title }) }
  }).catch(() => ({ text: t('command.failed') }))

  // A team agent's brief gets the project, its branch and the picked skills:
  // what the agent cannot see from the conversation it was not part of.
  on('agent.spawn', async ($, e, next) => {
    await settleLanguage($, options.language)
    let brief = e
    const isTeam = isTeamBrief(e)
    if (isTeam) {
      await quietly(followProject($))
      await quietly(ensureChoices($, namesPicked(await read($, armed), await read($, packs), await read($, armedPacks))))
      const picked = pickedSkills(await read($, armed), await read($, packs), await read($, armedPacks), await read($, choices))
      const where = whereOf(e.cwd, await read($, cwd), await read($, git))
      brief = { ...e, prompt: `${e.prompt}${teamContext(where, picked)}` }
    }
    const started = await next(brief)
    if (started.deny !== undefined || started.agentId === undefined) return started

    const at = await $.clock.now()
    const row: AgentRow = {
      id: started.agentId,
      type: e.subagentType,
      role: roleOf(e.subagentType),
      description: e.description,
      // A resume's prompt is the message that woke it, not its brief: keep the brief.
      prompt: e.resume !== undefined ? '' : e.prompt.slice(0, 1200),
      startedAt: at,
      lastActiveAt: at,
      calls: 0,
      status: 'running',
      model: started.model,
    }
    const isFromClaude = e.parentAgentId === undefined
    // Waste the pane can see at the spawn: a brief sent again, or one without its Goal and Why.
    const isNew = e.resume === undefined && !e.fork
    const warn = isNew ? spawnWarning((await read($, team)).agents, row, isTeam, e.prompt) : undefined
    const marked: AgentRow = warn === undefined ? row : { ...row, warn }
    await quietly(
      update($, team, t => ({
        ...t,
        agents: withRows(t.agents, [marked]),
        main: isFromClaude && row.role === 'explorer' ? { ...t.main, hasAskedExplorer: true } : t.main,
      })),
    )
    await quietly(update($, now, () => at))
    await quietly(refreshStatus($))
    // A reviewer on a small diff is said once git has counted it, off the spawn's path.
    if (isNew && row.role === 'reviewer' && warn === undefined) void quietly(checkReviewSize($, started.agentId, e.cwd, e.prompt))

    return started
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    await settleLanguage($, options.language)
    const at = await $.clock.now()
    // A skill loaded with the Skill tool shows on the row of whoever loaded it.
    if (e.tool === 'Skill' && typeof e.skill === 'string' && e.skill !== '') {
      const name = e.skill
      const loop = e.agentId
      await quietly(
        update($, team, t =>
          loop === undefined
            ? { ...t, main: { ...t.main, skills: withSkill(t.main.skills, name) } }
            : { ...t, agents: t.agents.map(a => (a.id === loop ? { ...a, skills: withSkill(a.skills, name) } : a)) },
        ),
      )
    }
    if (e.agentId !== undefined) {
      const id = e.agentId
      const known = (await read($, team)).agents.some(a => a.id === id)
      if (!known) await quietly(adopt($, [id]))
      await quietly(
        update($, team, t => ({
          ...t,
          agents: t.agents.map(a =>
            a.id === id ? { ...a, calls: a.calls + 1, lastTool: e.tool, lastActiveAt: at } : a,
          ),
        })),
      )
      if ((e.tool === 'Bash' || e.tool === 'PowerShell') && e.run_in_background === true) {
        const ran = await next(e)
        // Refused or failed, nothing runs in the background: no row to wait an hour on.
        if (ran.deny !== undefined || ran.isError === true) return ran
        const owner = (await read($, team)).agents.find(a => a.id === id)
        const shell = shellOf(e, ran, at, { id, role: owner?.role ?? 'other' })
        await quietly(update($, team, t => ({ ...t, shells: withShell(t.shells, shell) })))
        await quietly(update($, now, () => at))
        await quietly(refreshStatus($))
        afterShell($, e.command, ran, at)

        return ran
      }
      if (e.tool === 'Bash' || e.tool === 'PowerShell') {
        const owner = (await read($, team)).agents.find(a => a.id === id)

        return runTracked($, e, () => next(e), at, { id, role: owner?.role ?? 'other' })
      }
    } else {
      const detail = detailOf(e)
      const line = detail === '' ? e.tool : `${e.tool} · ${detail}`
      const file = readPathOf(e)
      const edit = editPathOf(e)
      await quietly(
        update($, team, t => ({
          ...t,
          main: {
            ...t.main,
            calls: t.main.calls + 1,
            lastTool: e.tool,
            lastDetail: detail,
            log: [...t.main.log, line].slice(-LOG_LINES),
            ...withRead(t.main, file, edit),
          },
        })),
      )
      await quietly(update($, now, () => at))
      if ((e.tool === 'Bash' || e.tool === 'PowerShell') && e.run_in_background === true) {
        const ran = await next(e)
        if (ran.deny !== undefined || ran.isError === true) return ran
        const shell = shellOf(e, ran, at)
        await quietly(update($, team, t => ({ ...t, shells: withShell(t.shells, shell) })))
        await quietly(refreshStatus($))
        afterShell($, e.command, ran, at)

        return ran
      }
      if (e.tool === 'Bash' || e.tool === 'PowerShell') return runTracked($, e, () => next(e), at)
    }
    // A shell stopped with TaskStop gets no task notification: its answer closes the row.
    if (e.tool === 'TaskStop') {
      const ran = await next(e)
      await quietly(onTaskStop($, e, ran))

      return ran
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // A background task's end reaches the session as a notification: by the
  // delivery event, by the row the transcript keeps, or by the turn it wakes.
  on('session.receive', async ($, e, next) => {
    await settleLanguage($, options.language)
    if (e.origin.kind === 'task-notification' || e.text.includes('<task-notification>')) {
      await onNotice($, e.text, 'receive', e.agentId)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.append', async ($, e, next) => {
    await settleLanguage($, options.language)
    if (e.message.type === 'user') {
      const text = e.message.content
        .map(b => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
        .join('\n')
      if (text.includes('<task-notification>')) await onNotice($, text, 'append', e.agentId)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await settleLanguage($, options.language)
    if (e.text.includes('<task-notification>')) await onNotice($, e.text, 'turn.start', e.agentId)
    const at = await $.clock.now()
    if (e.agentId === undefined) {
      await quietly(
        update($, team, t => ({
          ...t,
          main: { ...IDLE_MAIN, status: 'working', since: at, lastTokens: t.main.lastTokens } satisfies MainLoop,
        })),
      )
    } else {
      // A message may resume an agent that had ended, under the same id.
      const id = e.agentId
      const row = (await read($, team)).agents.find(a => a.id === id)
      if (row === undefined) {
        await quietly(adopt($, [id]))
        await quietly(update($, team, t => ({ ...t, agents: t.agents.map(a => (a.id === id ? { ...a, turnId: e.turnId } : a)) })))
      } else if (row.status === 'running') {
        // The turn's id tells a later end of another turn, whose start was missed, from this one's.
        if (row.turnId !== e.turnId) {
          await quietly(update($, team, t => ({ ...t, agents: t.agents.map(a => (a.id === id ? { ...a, turnId: e.turnId } : a)) })))
        }
      } else {
        await quietly(
          update($, team, t => ({
            ...t,
            agents: t.agents.map(a =>
              a.id === id
                ? ({
                    ...a,
                    status: 'running',
                    startedAt: at,
                    lastActiveAt: at,
                    endedAt: undefined,
                    endNote: undefined,
                    closedByList: undefined,
                    tokens: undefined,
                    answer: undefined,
                    skills: undefined,
                    turnId: e.turnId,
                    // Rounds are the team rules' count: an agent outside the team has none.
                    rounds: TEAM_TYPES.has(a.type) ? (a.rounds ?? 0) + 1 : a.rounds,
                    workedMs: workedOf(a, at),
                    spent: plusTokens(a.spent, a.tokens),
                  } satisfies AgentRow)
                : a,
            ),
          })),
        )
        await quietly(refreshStatus($))
      }
    }
    await quietly(update($, now, () => at))

    return next(e)
  }).catch(($, e, next) => next(e))

  // An API failure that ended a turn, by kind: turn.complete only says
  // "error", StopFailure says which. Claude's row keeps it until the next
  // turn starts; an agent's row takes it as its end note.
  on('classic.StopFailure', async ($, e, next) => {
    await settleLanguage($, options.language)
    const text = apiErrorText(e.error)
    const agentId = (e as { agent_id?: string }).agent_id
    await quietly(
      update($, team, t =>
        agentId === undefined
          ? { ...t, main: { ...t.main, apiError: text } }
          : { ...t, agents: t.agents.map(a => (a.id === agentId ? { ...a, endNote: text } : a)) },
      ),
    )

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await settleLanguage($, options.language)
    const tokens = tokensOf(e.usage)
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      await quietly(
        update($, team, t => ({
          ...t,
          main: { ...t.main, status: 'idle', lastTokens: tokens ?? t.main.lastTokens } satisfies MainLoop,
          totals: addRun(t.totals, 'main', tokens),
          jobs: stopLeftovers(t.jobs, undefined, at),
        })),
      )
      // A turn may have edited files: the count of uncommitted ones moves. Local only.
      const g = await read($, git)
      if (g.state !== 'none' && at - g.at >= GIT_LOCAL_MS) scheduleGit($, false, 500)
    } else {
      const id = e.agentId
      const at = await $.clock.now()
      const status = statusOfTurn(e.reason)
      const row = (await read($, team)).agents.find(a => a.id === id)
      const ending = row !== undefined && (row.status === 'running' || row.closedByList === true) ? row : undefined
      // A round whose start was missed ends like any other: its sound, and its notice when it ran long.
      const missed = row !== undefined && isMissedRound(row, e.turnId) ? row : undefined
      const role = (ending ?? missed)?.role
      // StopFailure, when it came first, put the precise API error on the running row: it stays.
      const apiError = ending?.status === 'running' ? ending.endNote : undefined
      const endNote = e.reason === 'aborted' ? t('end.aborted') : e.reason === 'error' ? (apiError ?? t('end.error')) : undefined
      await quietly(
        update($, team, t => ({
          ...endRow(
            t,
            id,
            {
              status,
              endedAt: at,
              tokens,
              endNote,
              answer: e.reason === 'refusal' ? undefined : e.answer.slice(0, 2000),
              turnId: e.turnId,
              ...(e.usage?.model !== undefined ? { model: e.usage.model } : {}),
            },
            e.durationMs,
          ),
          jobs: stopLeftovers(t.jobs, id, at),
        })),
      )
      await quietly(update($, now, () => at))
      await quietly(refreshStatus($))
      if (role !== undefined) void chime($, soundFor(role, status))
      if (ending !== undefined && ending.status === 'running' && status !== 'stopped' && at - ending.startedAt >= LONG_MS) {
        const what = nameOf(ending.role)
        const time = seconds(at - ending.startedAt)
        void announce($, `${t(status === 'done' ? 'notify.done' : 'notify.failed', { what, time })}: ${ending.description}`)
      }
      if (missed !== undefined && status !== 'stopped' && e.durationMs >= LONG_MS) {
        const what = nameOf(missed.role)
        void announce($, `${t(status === 'done' ? 'notify.done' : 'notify.failed', { what, time: seconds(e.durationMs) })}: ${missed.description}`)
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // The row the transcript draws for a task notification carries the task's
  // ids and status: the one signal that needs no text format.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    await settleLanguage($, options.language)
    const task = e.props.task
    const rowKey = task === undefined ? '' : `${task.toolUseId ?? ''}|${task.id ?? ''}`
    if (task !== undefined && rowKey !== '|' && !checkedRows.has(rowKey)) {
      checkedRows.add(rowKey)
      // State is read-only while drawing, so the write runs a tick later, in a
      // dispatch of its own.
      const about = { id: task.id, toolUseId: task.toolUseId, status: task.status }
      $.clock.after(0, () => {
        void closeShell($, about, 'matched by the notification row')
          .then(async closed => {
            if (closed !== undefined) {
              await quietly(refreshStatus($))
              void chime($, shellSound(closed))
              announceShell($, closed)
            }
          })
          .catch(() => undefined)
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await settleLanguage($, options.language)

    return renderPane($, e)
  })
}
