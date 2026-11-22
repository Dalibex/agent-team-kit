import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, RenderChildren, RenderInput } from 'claude-code'
import type { SlotPicker, StatItem, TeamModel } from '../types'
import { reviewText } from './github'
import { jobTitle } from './jobs'
import { t, tn } from './i18n'
import { kilo, levelOf, percentText, projectionOf, refreshContext, resetClock, roundTokens, windowShort } from './usage'
import { barCells, cacheShare, contextPercent, inTokens, NO_STATS, STATS_SHAPE, toolItems, topRest } from './stats'
import { choose, compactNow, copyText, createPack, cycleEffort, cycleModel, deletePack, isWaitingForReload, openPicker, pickerBack, pickGroup, pressUpdateNow, quietly, refreshGit, resetModels, setPackName, showSkills, showTab, toggleArmed, toggleDelegation, toggleNotify, togglePack, toggleSkillEdit, toggleSound, turnPage, viewAgent } from './actions'
import { drawTeam, gaugesOf, overReadTitle, slotsOf, usageAlt } from './drawing'
import { ASK, BRAND, branding, clockText, titlePlate, COMPACT_AT, CONTEXT_COLOR, DEFAULT_BRANCHES, GIT_COLOR, JOB_MARK, JOB_METER, LEVEL_COLOR, LOOK, meterCols, nameOf, OFF, seconds, SKILL_COLOR, SPINNER, STATUS_MARK, statusText, tokenLine, TRACK, USAGE_COLOR, WARN } from './look'
import { ciMark, DEFAULT_MODELS, EMPTY, familyOf, isCostlier, isDefaultChoice, TEAM_EFFORTS, TEAM_MODELS, TEAM_ROLES, FIRST_TAB, spendParts, NO_PACKS, PACK_NAME_MAX, packDeleteAsk, PACKS_VIEW, freshOf, GIT_SHAPE, groupLabel, groupOf, isAsking, isOverReading, jobRowsOf, NO_CHOICES, NO_GROUP, NO_IDS, NO_PICKER, NO_SLOTS, NO_UPDATE, PICK_PAGE, ROUNDS_LIMIT, runMark, sessionTokensOf, SHOWN_ROWS, SKILLS_EDIT, slotLabel, TABS, TEAM_SHAPE, USAGE_SHAPE } from './state'
import type { CardId } from './state'
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
const armedPacks = atom({ plugin: 'agent-team', key: 'armedPacks' } as const, NO_IDS)
const packs = atom({ plugin: 'agent-team', key: 'packs' } as const, NO_PACKS)
const skillView = atom({ plugin: 'agent-team', key: 'skillView' } as const, PACKS_VIEW)
const delegation = atom({ plugin: 'agent-team', key: 'delegation' } as const, true)
const choices = atom({ plugin: 'agent-team', key: 'choices' } as const, NO_CHOICES)
const picker = atom({ plugin: 'agent-team', key: 'picker' } as const, NO_PICKER)
const updateNotice = atom({ plugin: 'agent-team', key: 'update' } as const, NO_UPDATE)
const stats = atom({ plugin: 'agent-team', key: 'stats' } as const, NO_STATS, { shape: STATS_SHAPE })
const models = atom({ plugin: 'agent-team', key: 'models' } as const, DEFAULT_MODELS)
const soundOn = atom({ plugin: 'agent-team', key: 'soundOn' } as const, true)
const notifyOn = atom({ plugin: 'agent-team', key: 'notifyOn' } as const, true)
const updating = atom({ plugin: 'agent-team', key: 'updating' } as const, false)

/** A model as its button names it. */
const MODEL_LABEL: Record<TeamModel, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus' }
/** The width of a role's name in the models block, so its buttons line up: the longest name and a space. */
const ROLE_COLS = 12
/** The widths of the model and effort buttons, so the columns line up: the longest value ("Sonnet", "medium") and the button's chrome. */
const MODEL_COLS = 10
const EFFORT_COLS = 10
/** The `expanded` ids of the Team tab's two sections; there an id means folded, so both start unfolded. */
const FOLD_CONFIG = 'fold-config'
const FOLD_ACTIONS = 'fold-actions'

/**
 * The pane: the drawing (the team and its usage column), the line under it
 * and the cards. Redrawn when any value it reads changes, and once a second
 * while something works.
 */
export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Button, Link, Input } = $.ui.resolve(e)
  // The surfaces that draw images (all but the terminal) get the cards' pixel titles.
  const SvgImage = e.surface === 'terminal' ? undefined : ($.ui.resolve(e) as Elements['desktop']).Svg
  const squad = await read($, team)
  const tick = await read($, now)
  const at = tick === 0 ? await $.clock.now() : tick
  const u = await read($, usage)
  const g = await read($, git)
  const shown = await read($, tab)
  const open = await read($, expanded)
  const slotNames = await read($, slots)
  const picked = await read($, armed)
  const packIds = await read($, armedPacks)
  const packsPicked = packIds.length
  const packList = await read($, packs)
  const view = await read($, skillView)
  const isDelegating = await read($, delegation)
  const chosenModels = await read($, models)
  const newer = await read($, updateNotice)
  const isUpdating = await read($, updating)
  const isAwaitingReload = isWaitingForReload()
  const isSoundOn = await read($, soundOn)
  const isNotifyOn = await read($, notifyOn)
  // The usage tab's figures are read only while it is shown: a hidden one is not redrawn by every tool call.
  const counted = shown === 'usage' ? await read($, stats) : NO_STATS
  const cols = meterCols(e.props.bodyColumns)

  // Ids of rows that still exist: unfolding one also drops the ids of rows
  // that left the history, so the list does not grow for the whole session.
  const live = new Set<string>([
    'main',
    SKILLS_EDIT,
    FOLD_CONFIG,
    FOLD_ACTIONS,
    ...packList.flatMap(p => (p === null ? [] : [packDeleteAsk(p.id)])),
    ...squad.shells.map(sh => sh.id),
    ...squad.jobs.map(j => j.id),
    ...squad.agents.flatMap(a => [a.id, `report-${a.id}`]),
  ])
  const toggle = (id: string) =>
    void update($, expanded, list =>
      list.includes(id) ? list.filter(one => one !== id) : [...list.filter(one => live.has(one)), id],
    )

  // ---------------------------------------------------------- pieces

  /**
   * A meter of `cols` cells. With a percentage, the lit part is that share;
   * without one, a short lit run moves along the track, a step per tick.
   */
  const meter = (key: string, percent: number | undefined, color: string, width = cols) => {
    let before: number
    let lit: number
    if (percent === undefined) {
      const run = Math.max(3, Math.round(width / 5))
      const head = (Math.floor(at / 1000) * 2) % (width + run)
      before = Math.max(0, head - run)
      lit = Math.min(width, head) - before
    } else {
      before = 0
      lit = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
    }
    const after = width - before - lit

    return (
      <Box key={key} flexDirection="row" flexShrink={0}>
        {before > 0 && <Text dimColor>{TRACK.repeat(before)}</Text>}
        {lit > 0 && <Text color={color}>{TRACK.repeat(lit)}</Text>}
        {after > 0 && <Text dimColor>{TRACK.repeat(after)}</Text>}
      </Box>
    )
  }

  /** The shown tab's card: its title, in the drawing's neon pixel letters where images are drawn, over its body. */
  const card = (id: CardId, accent: string, title: string, plate: string, body: () => RenderChildren) => {
    const art = SvgImage === undefined ? undefined : titlePlate(plate, accent)

    return (
      <Box key={`card-${id}`} flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
        {art !== undefined && SvgImage !== undefined ? (
          <Box flexShrink={0}>
            <SvgImage source={art.source} alt={title} width={art.width} height={art.height} />
          </Box>
        ) : (
          <Text>
            <Text color={accent}>✦ </Text>
            <Text bold>{title}</Text>
          </Text>
        )}
        <Box flexDirection="column" rowGap="xs" marginTop="xs" paddingBottom="xs">
          {body()}
        </Box>
      </Box>
    )
  }

  // ------------------------------------------------------ the strip

  // Where the drawing is drawn, the usage lives in its band; the terminal
  // has no drawing, so its strip carries the figures too.
  const isTextOnly = e.surface === 'terminal'
  const eta = projectionOf(u.trail)
  const jobRows = jobRowsOf(squad, at)
  const runningJobs = jobRows.filter(r => r.state === 'running')
  // A PR that is no longer open has no live checks; a branch with no PR shows its last workflow run.
  const ci =
    g.pr === undefined
      ? g.run === undefined
        ? undefined
        : runMark(g.run)
      : g.pr.ended === undefined
        ? ciMark(g.pr.checks)
        : undefined
  const chips = [
    // A newer release of the kit: where to read it and how to get it. Once one is installed and waits
    // for a reload, the chip says only that, whether or not a newer release is still known.
    newer === null && !isAwaitingReload ? null : (
      <Box key="chip-update" flexDirection="row" flexWrap="wrap" columnGap={1}>
        {newer !== null && !isAwaitingReload && <Link href={newer.url} label={t('update.available', { version: newer.version })} />}
        {/* While an update runs the button is not offered: one press, one update. */}
        {isAwaitingReload ? (
          <Text color={WARN}>{t('update.now.reload')}</Text>
        ) : isUpdating ? (
          <Text color={WARN}>{t('update.now.busy')}</Text>
        ) : (
          <Button key="update-now" label={t('update.now.button')} onPress={() => void pressUpdateNow($)} />
        )}
        {!isAwaitingReload && <Text dimColor>{t('update.hint')}</Text>}
      </Box>
    ),
    ...(isTextOnly
      ? [
          ...u.windows.map(w => (
            <Text key={`chip-${w.kind}`} color={LEVEL_COLOR[levelOf(w.percent)]} bold={levelOf(w.percent) !== 'calm'}>
              {`${windowShort(w.kind)} ${percentText(w.percent)}`}
            </Text>
          )),
          u.context === undefined ? null : (
            <Text key="chip-ctx" color={CONTEXT_COLOR}>
              {`ctx ${u.context.tokens === undefined ? '--' : roundTokens(u.context.tokens)}/${roundTokens(u.context.window)}`}
            </Text>
          ),
          eta === undefined ? null : (
            <Text key="chip-eta" color={WARN}>{t('chip.eta', { time: resetClock(eta, at) ?? '' })}</Text>
          ),
        ]
      : []),
    // Near the end of the window, one press compacts the conversation.
    (u.context?.percent ?? 0) >= COMPACT_AT ? (
      <Button
        key="compact"
        label={t('compact.button', { percent: percentText(u.context?.percent ?? 0) })}
        onPress={() => void compactNow($)}
      />
    ) : null,
    g.state === 'ok' && (g.branch !== undefined || g.detached === true) ? (
      <Text key="chip-git" color={GIT_COLOR}>
        {`⎇ ${g.branch ?? t('git.detached')}${g.ahead > 0 ? ` ↑${g.ahead}` : ''}${g.behind > 0 ? ` ↓${g.behind}` : ''}`}
      </Text>
    ) : null,
    ci === undefined ? null : <Text key="chip-ci" color={ci.color}>{`CI ${ci.mark}`}</Text>,
    runningJobs.length === 0 ? null : (
      <Text key="chip-jobs" color={BRAND[1]}>
        {`⟳ ${runningJobs.length === 1 ? (runningJobs[0]?.title ?? '') : t('chip.jobs', { n: runningJobs.length })}`}
      </Text>
    ),
    // The picked skills stay in sight from every tab.
    picked.length + packsPicked === 0 ? null : (
      <Text key="chip-skills" color={SKILL_COLOR} bold>
        {`✦ ${[
          ...packList.flatMap(p => (p !== null && packIds.includes(p.id) ? [`▣ ${p.name === '' ? t('pack.short') : p.name}`] : [])),
          ...picked.map(slotLabel),
        ].join(' · ')}`}
      </Text>
    ),
  ].filter(chip => chip !== null)
  const strip =
    chips.length > 0 ? (
      <Box key="strip" flexDirection="row" flexWrap="wrap" columnGap={2}>
        {chips}
      </Box>
    ) : isTextOnly ? (
      <Text key="strip" dimColor>
        {t('chip.noFigures')}
      </Text>
    ) : null

  // ------------------------------------------------------- the team

  // One frame per tick: the ticker redraws once a second while anything works.
  const beat = Math.floor(at / 1000)
  const spin = SPINNER[beat % SPINNER.length] ?? '●'
  const workingText = `${spin} ${t('status.running')}${'.'.repeat(1 + (beat % 3))}`
  const busy = squad.agents.filter(a => a.status === 'running').length
  const asking = squad.agents.filter(isAsking).length
  const recent = [...squad.agents].reverse().slice(0, SHOWN_ROWS)

  /** One line: who, a generic state or the task, then time; what unfolds sits under it. */
  const line = (
    key: string,
    who: RenderChildren,
    what: RenderChildren,
    meta: string,
    isOpen: boolean,
    onToggle: () => void,
  ) => (
    // Two lines, so a narrow pane cuts nothing off: who, its time and the
    // fold arrow on the first; what it is doing on the second, the whole
    // width for it.
    <Box key={key} flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Box flexGrow={1} flexShrink={1}>
          {who}
        </Box>
        {meta !== '' && (
          <Box flexShrink={0}>
            <Text dimColor>{meta}</Text>
          </Box>
        )}
        <Button key={`${key}-x`} plain dimColor label={isOpen ? '▾' : '▸'} onPress={onToggle} />
      </Box>
      <Box paddingLeft={2}>{what}</Box>
    </Box>
  )

  /**
   * The sound and notification switches: one glyph each (a Button holds only
   * strings and Text), a red cross after it while off. Their label names them.
   */
  const glyph = (icon: string, isOn: boolean) =>
    isOn
      ? [<Text key="icon">{icon}</Text>]
      : [
          <Text key="icon">{icon}</Text>,
          <Text key="off" color={OFF}>
            ✕
          </Text>,
        ]
  const toggles = (direction: 'row' | 'column') => (
    <Box key="toggles" flexDirection={direction} flexShrink={0} rowGap="xs" columnGap={1} {...(direction === 'column' ? { paddingTop: 'sm' as const } : {})}>
      <Button key="toggle-sound" label={isSoundOn ? t('toggle.sound.on') : t('toggle.sound.off')} onPress={() => void toggleSound($)}>
        {glyph('♪', isSoundOn)}
      </Button>
      <Button key="toggle-notify" label={isNotifyOn ? t('toggle.notify.on') : t('toggle.notify.off')} onPress={() => void toggleNotify($)}>
        {glyph('🔔', isNotifyOn)}
      </Button>
    </Box>
  )

  /** One of the Team tab's sections: a header that folds it, its arrow and bold title, over its rows. */
  const section = (id: string, title: string, rows: RenderChildren[]) => {
    const isFolded = open.includes(id)

    return (
      <Box key={`${id}-section`} flexDirection="column" rowGap="sm">
        <Box flexDirection="row">
          <Button key={id} plain label={title} onPress={() => toggle(id)}>
            {isFolded ? '▸ ' : '▾ '}
            <Text bold>{title}</Text>
          </Button>
        </Box>
        {!isFolded && (
          <Box flexDirection="column" rowGap="sm">
            {rows}
          </Box>
        )}
      </Box>
    )
  }

  const teamBody = () => {
    const m = squad.main
    const sessionTokens = sessionTokensOf(squad)
    const isMainOpen = open.includes('main')
    const isMainWorking = m.status === 'working'
    const doing =
      m.lastDetail !== undefined && m.lastDetail !== '' ? `${m.lastTool ?? ''} · ${m.lastDetail}` : (m.lastTool ?? t('main.thinking'))
    const rows: RenderChildren[] = [
      <Box key="main" flexDirection="column">
        {line(
          'main-row',
          <Text color={LOOK.main.color} bold={isMainWorking}>{`${isMainWorking ? '●' : '○'} Claude`}</Text>,
          <Text color={isMainWorking ? LOOK.main.color : undefined} dimColor={!isMainWorking} wrap="truncate-end">
            {isMainWorking ? workingText : t('main.idle')}
          </Text>,
          isMainWorking ? seconds(at - m.since) : '',
          isMainOpen,
          () => toggle('main'),
        )}
        {isOverReading(m) && (
          <Text color={WARN} wrap="truncate-end">{`⚠ ${t('warn.overread.line', { n: m.reads.length })}`}</Text>
        )}
        {m.apiError !== undefined && (
          <Text color="#ff8a8a" wrap="truncate-end">{`⚠ ${m.apiError}`}</Text>
        )}
        {(m.skills?.length ?? 0) > 0 && (
          <Text color={SKILL_COLOR} dimColor wrap="truncate-end">{`✦ ${(m.skills ?? []).map(slotLabel).join(' · ')}`}</Text>
        )}
        {isMainOpen && (
          <Box flexDirection="column" paddingLeft={2}>
            <Text dimColor wrap="wrap">
              {isMainWorking ? tn(m.calls, 'main.working.one', 'main.working.other', { doing }) : t('main.waiting')}
            </Text>
            {m.log.map((entry, i) => (
              <Text key={`log-${i}`} dimColor wrap="truncate-end">
                {entry}
              </Text>
            ))}
            {m.lastTokens !== undefined && <Text dimColor wrap="wrap">{t('main.lastTurn', { tokens: tokenLine(m.lastTokens) })}</Text>}
            {sessionTokens !== '' && (
              <Text dimColor wrap="wrap">
                {t('main.sessionTokens', { tokens: sessionTokens })}
              </Text>
            )}
            {squad.notices.map((notice, i) => (
              <Text key={`notice-${i}`} dimColor wrap="truncate-end">
                {t('main.notice', { notice })}
              </Text>
            ))}
          </Box>
        )}
      </Box>,
    ]
    for (const a of recent) {
      const isOpen = open.includes(a.id)
      const isRunning = a.status === 'running'
      const answer = a.answer ?? ''
      const rounds = a.rounds ?? 0
      // An agent that stopped to ask reads as asking, its questions first when unfolded, until it is woken again.
      const asks = isAsking(a)
      const questions = a.questions ?? []
      const meta = [seconds((a.endedAt ?? at) - a.startedAt), familyOf(a.model), rounds >= 1 ? `↻${rounds}` : undefined]
        .filter((part): part is string => part !== undefined && part !== '')
        .join(' · ')
      rows.push(
        <Box key={`agent-row-${a.id}`} flexDirection="column">
          {line(
            `agent-${a.id}`,
            <Text
              color={a.status === 'stopped' ? undefined : LOOK[a.role].color}
              dimColor={a.status === 'stopped'}
              bold={isRunning}
            >
              {asks ? (
                <Text color={ASK} bold>
                  ?
                </Text>
              ) : (
                STATUS_MARK[a.status]
              )}
              {` ${nameOf(a.role)}`}
            </Text>,
            isRunning ? (
              <Text color={LOOK[a.role].color} wrap="truncate-end">
                {workingText}
              </Text>
            ) : asks ? (
              <Text color={ASK} wrap="truncate-end">
                {t('ask.count', { n: questions.length })}
              </Text>
            ) : (
              <Text dimColor wrap="truncate-end">
                {a.description}
              </Text>
            ),
            meta,
            isOpen,
            () => toggle(a.id),
          )}
          {a.warn !== undefined && (
            <Text color={WARN} wrap="truncate-end">{`⚠ ${a.warn}`}</Text>
          )}
          {rounds >= ROUNDS_LIMIT && (
            <Text color={WARN} wrap="truncate-end">{`⚠ ${t('warn.rounds', { n: rounds })}`}</Text>
          )}
          {(a.skills?.length ?? 0) > 0 && (
            <Text color={SKILL_COLOR} dimColor wrap="truncate-end">{`✦ ${(a.skills ?? []).map(slotLabel).join(' · ')}`}</Text>
          )}
          {isOpen && (
            <Box flexDirection="column" paddingLeft={2}>
              {questions.map((question, i) => (
                <Text key={`question-${a.id}-${i}`} color={ASK} wrap="wrap">
                  {`${i + 1}. ${question}`}
                </Text>
              ))}
              <Text wrap="wrap">{a.description}</Text>
              <Text dimColor wrap="wrap">
                {[
                  asks ? t('ask.count', { n: questions.length }) : statusText(a.status),
                  isRunning ? a.lastTool : undefined,
                  tn(a.calls, 'agent.tools.one', 'agent.tools.other'),
                  a.tokens === undefined || freshOf(a.tokens) === 0 ? undefined : t('tokens.count', { n: kilo(freshOf(a.tokens)) }),
                ]
                  .filter((part): part is string => part !== undefined && part !== '')
                  .join(' · ')}
              </Text>
              <Text dimColor wrap="wrap">
                {a.prompt}
              </Text>
              {a.tokens !== undefined && <Text dimColor wrap="wrap">{t('agent.tokens', { line: tokenLine(a.tokens) })}</Text>}
              {a.endNote !== undefined && <Text dimColor wrap="wrap">{t('agent.end', { note: a.endNote })}</Text>}
              {answer !== '' && (
                <Box>
                  <Button
                    key={`report-${a.id}`}
                    plain
                    dimColor
                    label={`${open.includes(`report-${a.id}`) ? '▾' : '▸'} ${t('agent.report')}`}
                    onPress={() => toggle(`report-${a.id}`)}
                  />
                </Box>
              )}
              {answer !== '' && open.includes(`report-${a.id}`) && <Text wrap="wrap">{answer}</Text>}
              <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
                {/* Only the terminal draws the main view `$.ui.view` moves; the apps draw their own transcript and deny it. */}
                {e.surface === 'terminal' && (
                  <Button key={`view-${a.id}`} label={t('agent.view')} onPress={() => void viewAgent($, a.id)} />
                )}
                {answer !== '' && (
                  <Button key={`copy-${a.id}`} label={t('agent.copy')} onPress={press => void copyText($, answer, press)} />
                )}
              </Box>
            </Box>
          )}
        </Box>,
      )
    }
    // The Agent tool's team paragraph is read when a session first draws the tool: a change waits for the next one.
    const config: RenderChildren[] = []
    config.push(
      <Box key="team-foot" flexDirection="row" columnGap={1}>
        <Box flexShrink={0}>
          <Button key="delegation" label={isDelegating ? t('delegate.on') : t('delegate.off')} onPress={() => void toggleDelegation($)} />
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="wrap">
            {isDelegating ? t('delegate.hintOn') : t('delegate.hintOff')}
          </Text>
        </Box>
      </Box>,
    )
    // What each team role runs on: two buttons a role, read by the next spawn of its agent.
    const moved = TEAM_ROLES.filter(role => !isDefaultChoice(role, chosenModels[role]))
    config.push(
      <Box key="models" flexDirection="column" rowGap="sm">
        <Box flexDirection="column">
          <Text bold>{t('models.title')}</Text>
          <Text dimColor wrap="wrap">
            {t('models.hint')}
          </Text>
        </Box>
        {TEAM_ROLES.map(role => {
          const choice = chosenModels[role]

          // Each piece in a box of its own width, so the roles' columns line up; a narrow pane wraps them.
          return (
            <Box key={`models-${role}`} flexDirection="row" flexWrap="wrap" columnGap={1}>
              <Box width={ROLE_COLS} flexShrink={0}>
                <Text color={LOOK[role].color}>{nameOf(role)}</Text>
              </Box>
              {/* The desktop app draws a button's label, so the label is the value itself: what the press changes. */}
              <Box width={MODEL_COLS} flexShrink={0}>
                <Button key={`model-${role}`} label={MODEL_LABEL[choice.model]} onPress={() => void cycleModel($, role)} />
              </Box>
              <Box width={EFFORT_COLS} flexShrink={0}>
                <Button key={`effort-${role}`} label={choice.effort} onPress={() => void cycleEffort($, role)} />
              </Box>
              {isDefaultChoice(role, choice) && (
                <Box flexShrink={0}>
                  <Text dimColor>{t('models.default')}</Text>
                </Box>
              )}
            </Box>
          )
        })}
        {moved.some(role => isCostlier(role, chosenModels[role])) && (
          <Text dimColor wrap="wrap">
            {t('models.costly')}
          </Text>
        )}
        {moved.length > 0 && (
          <Box>
            <Button key="models-reset" plain dimColor label={t('models.reset')} onPress={() => void resetModels($)} />
          </Box>
        )}
      </Box>,
    )

    // The team's settings first, under the card's title; then what Claude and its agents do.
    return [section(FOLD_CONFIG, t('section.config'), config), section(FOLD_ACTIONS, t('section.actions'), rows)]
  }

  // ----------------------------------------------------- the skills

  const isEditingSkills = open.includes(SKILLS_EDIT)
  const openPick = await read($, picker)
  // The pickers list them; the slots' tooltips take their descriptions.
  const choiceList = await read($, choices)
  const describe = (name: string): string | undefined => {
    const said = choiceList.find(c => c.name === name)?.description

    return said === undefined || said === '' ? undefined : said
  }
  const filledSlots = slotNames.filter((one): one is string => one !== null).length
  const tipWidth = Math.min(e.props.bodyColumns - 2, Math.max(20, Math.min(52, e.props.bodyColumns - 6)))

  /** A cell of a button grid, with the full name (and what it does) shown while the pointer rests on it. */
  type Cell = { cell: RenderChildren; tip?: string; detail?: string }

  /**
   * Cells of `width` that wrap to the next row. Each cell is a keyed Box, so
   * the pointer over it reveals its tooltip: a card painted above the cell,
   * hidden otherwise, that moves nothing around it. A right-hand cell's card
   * opens leftwards so it stays inside the pane.
   */
  const grid = (key: string, cells: Cell[], width: string) => {
    const perRow = Math.max(1, Math.round(100 / Number.parseFloat(width)))

    return (
      <Box key={key} flexDirection="row" flexWrap="wrap" rowGap="xs">
        {cells.map(({ cell, tip, detail }, i) => (
          <Box key={`${key}-${i}`} width={width} paddingRight={1}>
            {cell}
            {tip !== undefined && (
              <Box
                position="absolute"
                top={detail === undefined ? -3 : -4}
                {...(i % perRow === perRow - 1 && perRow > 1 ? { right: 0 } : { left: 0 })}
                width={tipWidth}
                display="none"
                hover={{ display: 'flex' }}
                flexDirection="column"
                borderStyle="round"
                borderColor={SKILL_COLOR}
                backgroundColor="#1b1726"
                paddingX={1}
              >
                <Text bold wrap="truncate-end">
                  {tip}
                </Text>
                {detail !== undefined && (
                  <Text dimColor wrap="truncate-end">
                    {detail}
                  </Text>
                )}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    )
  }

  /** The picker of one slot: its groups first, then a page of the chosen group's skills. Buttons only. */
  const pickerBody = (p: SlotPicker): RenderChildren[] => {
    const current = (p.pack === undefined ? slotNames[p.slot] : packList.find(one => one?.id === p.pack)?.skills[p.slot]) ?? null
    const groups = [...new Set(choiceList.map(c => groupOf(c.name)))].sort((a, b) =>
      a === NO_GROUP ? -1 : b === NO_GROUP ? 1 : a.localeCompare(b),
    )
    const head = (
      <Box key="pick-head" flexDirection="row" columnGap={2}>
        <Button key="skills-back" label={t('back')} onPress={() => void pickerBack($)} />
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="wrap">{`${pickTarget(p)}${p.group === undefined ? '' : ` · ${groupLabel(p.group)}`}`}</Text>
        </Box>
      </Box>
    )
    if (choiceList.length === 0) {
      return [
        head,
        <Text key="pick-none" dimColor wrap="wrap">
          {t('pick.none')}
        </Text>,
      ]
    }
    if (p.group === undefined) {
      return [
        head,
        <Text key="pick-hint" dimColor wrap="truncate-end">
          {current === null ? t('pick.plugin') : t('pick.pluginNow', { current })}
        </Text>,
        grid(
          'pick-groups',
          groups.map((group, i) => ({
            cell: (
              <Button
                key={`skills-group-${i}`}
                label={`${groupLabel(group)} (${choiceList.filter(c => groupOf(c.name) === group).length})`}
                onPress={() => void pickGroup($, group)}
              />
            ),
          })),
          '50%',
        ),
        ...(current === null
          ? []
          : [<Button key="skills-clear" plain dimColor label={t('pick.clear')} onPress={() => void choose($, null)} />]),
      ]
    }
    const inGroup = choiceList.filter(c => groupOf(c.name) === p.group)
    // A skill another slot of the same list holds (a pack's, or the loose ones) is marked and cannot go in twice.
    const heldElsewhere = new Set(
      (p.pack === undefined ? slotNames : (packList.find(one => one?.id === p.pack)?.skills ?? [])).filter(
        (n, i): n is string => n !== null && i !== p.slot,
      ),
    )
    const pages = Math.max(1, Math.ceil(inGroup.length / PICK_PAGE))
    const page = Math.min(p.page, pages - 1)
    const shown = inGroup.slice(page * PICK_PAGE, (page + 1) * PICK_PAGE)

    return [
      head,
      grid(
        'pick-skills',
        shown.map((c, i) => ({
          cell: (
            <Button
              key={`skills-choice-${i}`}
              {...(c.name === current ? { variant: 'primary' as const } : {})}
              {...(heldElsewhere.has(c.name) ? { dimColor: true } : {})}
              label={`${heldElsewhere.has(c.name) ? '✓ ' : ''}${slotLabel(c.name)}`}
              onPress={() => (heldElsewhere.has(c.name) ? undefined : void choose($, c.name))}
            />
          ),
          tip: c.name,
          ...(describe(c.name) === undefined ? {} : { detail: describe(c.name) }),
        })),
        '50%',
      ),
      ...(pages > 1
        ? [
            <Box key="pick-pages" flexDirection="row" columnGap={2} alignItems="center">
              {page > 0 && <Button key="skills-prev" label="◀" onPress={() => void turnPage($, -1)} />}
              <Text dimColor>{t('pick.page', { page: page + 1, pages })}</Text>
              {page < pages - 1 && <Button key="skills-next" label="▶" onPress={() => void turnPage($, 1)} />}
            </Box>,
          ]
        : []),
    ]
  }

  /** What a picker fills, in words: a loose slot, or a pack's. */
  const pickTarget = (p: SlotPicker): string => {
    if (p.pack === undefined) return t('pick.slot', { n: p.slot + 1 })
    const name = packList.find(one => one?.id === p.pack)?.name ?? ''

    return t('pick.packSlot', { name: name === '' ? t('pack.unnamed') : name, n: p.slot + 1 })
  }
  /** A slot's skill the session no longer has, once its list is known. */
  const isMissing = (name: string): boolean => choiceList.length > 0 && !choiceList.some(c => c.name === name)
  /** The pointer card of a skill slot: its whole name and what it does, or that it is gone. */
  const skillTip = (name: string | null): Omit<Cell, 'cell'> => {
    if (name === null) return {}
    const detail = isMissing(name) ? t('skill.missing') : describe(name)

    return detail === undefined ? { tip: name } : { tip: name, detail }
  }
  /** A slot's label: its short name, flagged when the skill is gone. */
  const skillLabel = (name: string): string => `${isMissing(name) ? '⚠ ' : ''}${slotLabel(name)}`

  /**
   * Eight loose slots in four rows of two, wide enough for a name. A press
   * picks or unpicks a slot's skill; an empty slot, or any slot in edit mode,
   * opens its picker instead. Resting the pointer on one shows its full name.
   */
  const looseBody = (): RenderChildren[] => {
    const cells = slotNames.map((name, i): Cell => {
      if (name === null || isEditingSkills) {
        return {
          cell: (
            <Button
              key={`slot-btn-${i}`}
              hotkey={String(i + 1)}
              {...(name === null ? { plain: true as const, dimColor: true } : {})}
              label={name === null ? '＋' : `✎ ${skillLabel(name)}`}
              onPress={() => void openPicker($, i)}
            />
          ),
          ...skillTip(name),
        }
      }
      const isPicked = picked.includes(name)

      // With the pane focused, keys 1 to 8 press the slots.
      return {
        cell: (
          <Button
            key={`slot-btn-${i}`}
            hotkey={String(i + 1)}
            {...(isPicked ? { variant: 'primary' as const } : {})}
            label={`${isPicked ? '● ' : ''}${skillLabel(name)}`}
            onPress={() => void toggleArmed($, name)}
          />
        ),
        ...skillTip(name),
      }
    })

    return [
      <Box key="loose-head" flexDirection="row" columnGap={2} alignItems="center">
        <Button key="skills-packs" label={t('packs.back')} onPress={() => void showSkills($, PACKS_VIEW)} />
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="wrap">
            {t('loose.head')}
          </Text>
        </Box>
      </Box>,
      grid('slots', cells, '50%'),
      <Box key="skills-foot" flexDirection="row" columnGap={2}>
        <Box flexShrink={0}>
          <Button
            key="skills-edit"
            label={isEditingSkills ? t('back') : t('edit')}
            onPress={() => void toggleSkillEdit($)}
          />
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="wrap">
            {isEditingSkills
              ? t('loose.hintEdit')
              : picked.length > 0
                ? t('loose.hintPicked')
                : filledSlots === 0
                  ? t('loose.hintEmpty')
                  : t('loose.hintPick')}
          </Text>
        </Box>
      </Box>,
    ]
  }

  /**
   * The pack slots, two to a row. A press picks or unpicks a pack; an empty
   * slot makes a new pack and opens it, and in edit mode a press opens the
   * pack to rename it or change its skills. Keys 1 to 9 press the first nine.
   */
  const packsBody = (): RenderChildren[] => {
    const cells = packList.map((pack, i): Cell => {
      const hotkey = i < 9 ? { hotkey: String(i + 1) } : {}
      // An empty slot takes no key: a stray digit must not make a pack.
      if (pack === null) {
        return {
          cell: <Button key={`pack-btn-${i}`} plain dimColor label="＋" onPress={() => void createPack($, i)} />,
        }
      }
      const name = pack.name === '' ? t('pack.unnamed') : pack.name
      const held = pack.skills.filter((one): one is string => one !== null)
      const missing = held.filter(isMissing).length
      const tip = {
        tip: `${name} · ${tn(held.length, 'pack.skills.one', 'pack.skills.other')}`,
        detail:
          held.length === 0
            ? t('pack.emptyTip')
            : `${held.map(slotLabel).join(', ')}${missing > 0 ? ` · ${tn(missing, 'pack.missing.one', 'pack.missing.other')}` : ''}`,
      }
      if (isEditingSkills) {
        return {
          cell: (
            <Button
              key={`pack-btn-${i}`}
              {...hotkey}
              label={`✎ ${name}`}
              onPress={() => void showSkills($, { kind: 'pack', id: pack.id })}
            />
          ),
          ...tip,
        }
      }
      const isPicked = packIds.includes(pack.id)

      return {
        cell: (
          <Button
            key={`pack-btn-${i}`}
            {...hotkey}
            {...(isPicked ? { variant: 'primary' as const } : {})}
            label={`${isPicked ? '● ' : ''}${missing > 0 ? '⚠ ' : ''}${name} (${held.length})`}
            onPress={() => void togglePack($, pack.id)}
          />
        ),
        ...tip,
      }
    })
    const filledPacks = packList.filter(one => one !== null).length

    return [
      grid('packs', cells, '50%'),
      <Box key="packs-foot" flexDirection="row" flexWrap="wrap" columnGap={2} rowGap="xs">
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            {isEditingSkills
              ? t('packs.hintEdit')
              : packsPicked > 0
                ? t('packs.hintPicked')
                : filledPacks === 0
                  ? t('packs.hintEmpty')
                  : t('packs.hintPick')}
          </Text>
        </Box>
        <Button
          key="skills-edit"
          label={isEditingSkills ? t('back') : t('edit')}
          onPress={() => void toggleSkillEdit($)}
        />
        <Button
          key="skills-loose"
          label={`${t('packs.loose')}${picked.length > 0 ? ` ●${picked.length}` : ''}`}
          onPress={() => void showSkills($, { kind: 'loose' })}
        />
      </Box>,
    ]
  }

  /**
   * One pack open: its name in a text field, saved as it is typed, and its
   * twenty-four skill slots, each opening its picker. It can be picked from here,
   * and deleted with a second press.
   */
  const packBody = (id: string): RenderChildren[] => {
    const pack = packList.find(one => one?.id === id) ?? null
    if (pack === null) return packsBody()
    const isPicked = packIds.includes(pack.id)
    const isAsking = open.includes(packDeleteAsk(pack.id))
    const cells = pack.skills.map(
      (name, i): Cell => ({
        cell: (
          <Button
            key={`pack-slot-${i}`}
            {...(name === null ? { plain: true as const, dimColor: true } : {})}
            label={name === null ? '＋' : skillLabel(name)}
            onPress={() => void openPicker($, i, pack.id)}
          />
        ),
        ...skillTip(name),
      }),
    )

    return [
      <Box key="pack-head" flexDirection="column" rowGap="xs">
        <Box>
          <Button key="pack-back" label={t('packs.back')} onPress={() => void showSkills($, PACKS_VIEW)} />
        </Box>
        <Box>
          <Input
            key="pack-name"
            label={t('pack.nameLabel')}
            placeholder={t('pack.namePlaceholder', { max: PACK_NAME_MAX })}
            value={pack.name}
            submitLabel={t('pack.save')}
            {...(pack.name === '' ? { autoFocus: true as const } : {})}
            onInput={typed => void setPackName($, pack.id, typed)}
            onSubmit={typed => void setPackName($, pack.id, typed, true)}
          />
        </Box>
      </Box>,
      grid('pack-slots', cells, '50%'),
      <Box key="pack-foot" flexDirection="row" flexWrap="wrap" columnGap={2} rowGap="xs">
        <Button
          key="pack-pick"
          {...(isPicked ? { variant: 'primary' as const } : {})}
          label={isPicked ? t('pack.picked') : t('pack.pick')}
          onPress={() => void togglePack($, pack.id)}
        />
        <Button
          key="pack-delete"
          {...(isAsking ? {} : { plain: true as const, dimColor: true })}
          label={isAsking ? t('pack.confirmDelete') : t('pack.delete')}
          onPress={() => void deletePack($, pack.id)}
        />
      </Box>,
    ]
  }

  /** The skills tab: a picker while one is open, else the view it is on. */
  const skillsBody = (): RenderChildren[] => {
    if (openPick !== null) return pickerBody(openPick)
    if (view.kind === 'loose') return looseBody()
    if (view.kind === 'pack') return packBody(view.id)

    return packsBody()
  }

  // ------------------------------------------------------- the jobs

  const rows = jobRows
  /** A row's title with what the job works on, when it is a recognised job ("maven · build · clean, install"). */
  const titleWithTarget = (r: (typeof rows)[number]): string => {
    const match = squad.jobs.find(j => j.id === r.id) ?? squad.shells.find(sh => sh.id === r.id)?.job

    return match === undefined ? r.title : jobTitle(match)
  }
  /** One line per job: its mark, what it is, a small bar while it runs, and how long. */
  const jobsBody = () =>
    rows.length === 0
      ? [
          <Text key="jobs-empty" dimColor>
            {t('jobs.empty')}
          </Text>,
        ]
      : rows.map(r => {
          const isRunning = r.state === 'running'
          const ownerColor = LOOK[r.owner?.role ?? 'main'].color
          const markColor = isRunning
            ? ownerColor
            : r.state === 'done'
              ? '#4caf50'
              : r.state === 'failed'
                ? '#ff5c5c'
                : undefined

          return (
            <Box key={`job-${r.id}`} flexDirection="column">
              <Box flexDirection="row" columnGap={1}>
                <Box flexShrink={0}>
                  <Text color={markColor} dimColor={r.state === 'stopped'} bold={isRunning}>
                    {isRunning ? spin : JOB_MARK[r.state]}
                  </Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end" bold={isRunning} dimColor={r.state === 'stopped'}>
                    {titleWithTarget(r)}
                  </Text>
                </Box>
                <Box flexShrink={0}>
                  <Text dimColor>{seconds((r.endedAt ?? at) - r.startedAt)}</Text>
                </Box>
              </Box>
              {isRunning && (
                <Box flexDirection="row" columnGap={1} paddingLeft={2}>
                  {meter(`jobbar-${r.id}`, r.progress, ownerColor, JOB_METER)}
                  {r.progress !== undefined && <Text dimColor>{percentText(r.progress)}</Text>}
                </Box>
              )}
            </Box>
          )
        })

  // ------------------------------------------------------ the github

  const githubBody = () => {
    if (g.state === 'unknown') {
      return [
        <Text key="git-wait" dimColor>
          {t('git.looking')}
        </Text>,
      ]
    }
    if (g.state === 'none') {
      return [
        <Text key="git-none" dimColor wrap="wrap">
          {t('git.none')}
        </Text>,
      ]
    }
    const out: RenderChildren[] = []
    if (g.state === 'error') {
      out.push(
        <Box key="git-error-row" flexDirection="row" columnGap={1}>
          <Box flexShrink={0}>
            <Button key="git-refresh" plain dimColor label={g.isLoading ? '…' : '↻'} onPress={() => void refreshGit($, true)} />
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text key="git-error" color={WARN} wrap="truncate-end">
              {t('git.error', { error: g.error ?? t('git.noAnswer') })}
            </Text>
          </Box>
        </Box>,
      )
    } else {
      out.push(
        <Box key="git-where" flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            <Box flexShrink={0}>
              <Button
                key="git-refresh"
                plain
                dimColor
                label={g.isLoading ? '…' : '↻'}
                onPress={() => void refreshGit($, true)}
              />
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text color={GIT_COLOR} wrap="truncate-end">{`⎇ ${g.branch ?? (g.detached === true ? t('git.detached') : '?')}`}</Text>
            </Box>
          </Box>
          {(g.ahead > 0 || g.behind > 0 || g.dirty > 0) && (
            <Box flexDirection="row" flexWrap="wrap" columnGap={2} paddingLeft={2}>
              {(g.ahead > 0 || g.behind > 0) && <Text dimColor>{`↑${g.ahead} ↓${g.behind}`}</Text>}
              {g.dirty > 0 && <Text color={WARN}>{t('git.dirty', { n: g.dirty })}</Text>}
            </Box>
          )}
        </Box>,
      )
      if (g.repo !== undefined) {
        const base = `https://github.com/${g.repo}`
        const branch = g.branch
        // Each segment encoded on its own: a branch's slashes are part of the path.
        const branchPath = branch?.split('/').map(encodeURIComponent).join('/')
        const canOpenPr = g.pr === undefined && branch !== undefined && !DEFAULT_BRANCHES.has(branch)
        out.push(
          <Box key="git-links" flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Link key="link-repo" href={base} label="Repo" />
            {branchPath !== undefined && <Link key="link-branch" href={`${base}/tree/${branchPath}`} label={t('link.branch')} />}
            <Link key="link-issues" href={`${base}/issues`} label="Issues" />
            <Link key="link-pulls" href={`${base}/pulls`} label="PRs" />
            <Link key="link-actions" href={`${base}/actions`} label="Actions" />
            {canOpenPr && branchPath !== undefined && (
              <Link key="link-new-pr" href={`${base}/compare/${branchPath}?expand=1`} label={t('link.newPr')} />
            )}
          </Box>,
        )
      }
      if (g.pr !== undefined) {
        const review = reviewText(g.pr.review)
        const c = g.pr.checks
        out.push(
          <Box key="git-pr" flexDirection="column">
            <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
              <Link key="pr-link" href={g.pr.url} label={`#${g.pr.number}`} />
              {g.pr.ended !== undefined && (
                <Text dimColor>{g.pr.ended === 'merged' ? t('pr.merged') : t('pr.closed')}</Text>
              )}
              {g.pr.ended === undefined && c.ok > 0 && <Text color="#4caf50">{`✓ ${c.ok}`}</Text>}
              {g.pr.ended === undefined && c.failed > 0 && <Text color="#ff5c5c">{`✗ ${c.failed}`}</Text>}
              {g.pr.ended === undefined && c.pending > 0 && <Text color={WARN}>{`● ${c.pending}`}</Text>}
              {review !== undefined && <Text dimColor>{review}</Text>}
            </Box>
            <Box paddingLeft={2}>
              <Text wrap="truncate-end" dimColor={g.pr.isDraft}>
                {g.pr.title}
              </Text>
            </Box>
          </Box>,
        )
        // A red check links straight to its log: what broke, one click away.
        if (g.pr.ended === undefined && c.firstFailure !== undefined) {
          out.push(
            <Box key="git-failure" flexDirection="row" flexWrap="wrap" columnGap={2}>
              <Text color="#ff5c5c" wrap="wrap">{`✗ ${c.firstFailure.name}`}</Text>
              <Link key="failure-link" href={c.firstFailure.url} label={t('link.whatFailed')} />
            </Box>,
          )
        }
      } else if (g.run !== undefined) {
        const run = runMark(g.run)
        out.push(
          <Box key="git-run" flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Text color={run.color} wrap="wrap">{`${run.mark} ${g.run.name} ${run.text}`}</Text>
            {g.run.url !== '' && (
              <Link key="run-link" href={g.run.url} label={run.mark === '✗' ? t('link.whatFailed') : t('link.view')} />
            )}
          </Box>,
        )
      }
      if (g.reviewRequested > 0 || g.mine > 0) {
        // Each count opens its own list on GitHub, across every repository.
        out.push(
          <Box key="git-counts" flexDirection="row" flexWrap="wrap" columnGap={2}>
            {g.reviewRequested > 0 && (
              <Link
                key="link-review"
                href="https://github.com/pulls/review-requested"
                label={tn(g.reviewRequested, 'git.reviewRequested.one', 'git.reviewRequested.other')}
              />
            )}
            {g.mine > 0 && (
              <Link
                key="link-mine"
                href="https://github.com/pulls"
                label={tn(g.mine, 'git.mine.one', 'git.mine.other')}
              />
            )}
          </Box>,
        )
      }
      if (g.remoteError !== undefined) {
        out.push(
          <Text key="git-remote-error" color={WARN} wrap="wrap">
            {g.remoteError}
          </Text>,
        )
      }
    }
    const last = g.ops[g.ops.length - 1]
    if (last !== undefined) {
      out.push(
        <Box key="git-op" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text dimColor wrap="wrap">{`${clockText(last.at)} Claude: ${last.text}`}</Text>
          {last.url !== undefined && <Link key="op-link" href={last.url} label={t('link.open')} />}
        </Box>,
      )
    }

    return out
  }

  // ------------------------------------------------------- the usage

  const usageBody = () => {
    const rows: RenderChildren[] = []
    // A swatch is the legend's coloured square; one without a colour is drawn dim.
    const stat = (key: string, left: string, right: string, swatch?: { color?: string }) => (
      <Box key={key} flexDirection="row" columnGap={1}>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">
            {swatch !== undefined && <Text {...(swatch.color === undefined ? { dimColor: true } : { color: swatch.color })}>■ </Text>}
            {left}
          </Text>
        </Box>
        {right !== '' && (
          <Box flexShrink={0}>
            <Text dimColor>{right}</Text>
          </Box>
        )}
      </Box>
    )
    /** A heading, the figure beside it when there is one; it wraps whole on a narrow pane. */
    const heading = (key: string, title: string, figure = '') => (
      <Box key={key} flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text color={USAGE_COLOR} bold>{title}</Text>
        {figure !== '' && <Text dimColor>{figure}</Text>}
      </Box>
    )
    /** The biggest few of a list and the rest summed, each with its tokens (and how many it groups). */
    const list = (key: string, title: string, items: readonly StatItem[], extra?: string) => {
      if (items.length === 0) return null
      const { top, rest } = topRest(items)

      return (
        <Box key={key} flexDirection="column">
          <Text dimColor>{title}</Text>
          {top.map((one, i) => stat(`${key}-${i}`, one.count === undefined ? one.name : `${one.name} ×${one.count}`, kilo(one.tokens)))}
          {rest !== undefined && stat(`${key}-rest`, t('usage.more', { n: rest.count }), kilo(rest.tokens))}
          {extra !== undefined && <Text dimColor wrap="truncate-end">{extra}</Text>}
        </Box>
      )
    }

    const hasTokens = counted.turns > 0 || inTokens(counted) + counted.output > 0
    const spend = spendParts(squad)
    const tools = toolItems(counted.tools)
    const hasSpend = spend.parts.length > 0 || tools.length > 0 || counted.top.length > 0
    if (!hasTokens && !hasSpend && counted.context === undefined) {
      return [<Text key="usage-none" dimColor wrap="wrap">{t('usage.none')}</Text>]
    }

    // 1. What the session moved: tokens in and out, how much came from the cache.
    if (hasTokens) {
      const share = cacheShare(counted)
      rows.push(
        <Box key="usage-tokens" flexDirection="column">
          {heading('usage-tokens-h', t('usage.tokens'))}
          <Text wrap="wrap">
            {t('usage.tokens.line', { input: kilo(inTokens(counted)), output: kilo(counted.output) })}
          </Text>
          <Text dimColor wrap="wrap">
            {[
              share === undefined ? '' : t('usage.cache', { percent: percentText(share) }),
              tn(counted.turns, 'tokens.turns.one', 'tokens.turns.other'),
              counted.compactions > 0 ? tn(counted.compactions, 'usage.compactions.one', 'usage.compactions.other') : '',
            ]
              .filter(part => part !== '')
              .join(' · ')}
          </Text>
        </Box>,
      )
    }

    // 2. The context now: a stacked bar, its legend, and the biggest items under it.
    const ctx = counted.context
    if (ctx === undefined) {
      rows.push(
        <Box key="usage-context" flexDirection="column">
          {heading('usage-context-h', t('usage.context'))}
          <Text dimColor wrap="wrap">{t('usage.context.waiting')}</Text>
        </Box>,
      )
    } else {
      const SHADES = [CONTEXT_COLOR, BRAND[0], BRAND[1], BRAND[3], SKILL_COLOR, USAGE_COLOR, '#8fbf6a', '#5b8def']
      let usedAt = 0
      const painted = ctx.rows.map(row => {
        const color = row.kind === 'used' ? (SHADES[usedAt++ % SHADES.length] ?? CONTEXT_COLOR) : row.kind === 'buffer' ? '#6b6578' : undefined
        const name = row.kind === 'free' ? t('usage.free') : row.kind === 'buffer' ? t('usage.buffer') : row.name

        return { ...row, color, name }
      })
      const barWidth = Math.min(40, Math.max(4, e.props.bodyColumns - 8))
      rows.push(
        <Box key="usage-context" flexDirection="column">
          {heading(
            'usage-context-h',
            `${t('usage.context')} · ${percentText(u.context?.percent ?? contextPercent(ctx))}`,
            t('usage.context.size', { used: roundTokens(ctx.used), window: roundTokens(ctx.window) }),
          )}
          <Box key="usage-bar" flexDirection="row" flexShrink={0}>
            {barCells(painted, barWidth)
              .filter(seg => seg.cells > 0)
              .map(seg => (
                <Text key={`seg-${seg.name}`} {...(seg.color === undefined ? { dimColor: true } : { color: seg.color })}>
                  {TRACK.repeat(seg.cells)}
                </Text>
              ))}
          </Box>
          {painted.map(row =>
            stat(
              `legend-${row.name}`,
              row.name,
              kilo(row.tokens),
              row.color === undefined ? {} : { color: row.color },
            ),
          )}
        </Box>,
      )
      const groups = [
        list('usage-skills', t('usage.skills'), ctx.skills),
        list('usage-mcp', t('usage.mcp'), ctx.mcp, ctx.mcpDeferred > 0 ? t('usage.mcp.deferred', { n: ctx.mcpDeferred }) : undefined),
        list('usage-memory', t('usage.memory'), ctx.memory),
        list('usage-agents', t('usage.agents'), ctx.agents),
      ].filter(one => one !== null)
      if (groups.length > 0) {
        rows.push(
          <Box key="usage-items" flexDirection="column" rowGap="xs">
            {groups}
          </Box>,
        )
      }
    }

    // 3. Where it goes: each role (the line moved here from the team tab), the tools whose results weigh most, the costliest turns.
    if (hasSpend) {
      const spendRows: RenderChildren[] = [heading('usage-spend-h', t('usage.spend'))]
      if (spend.parts.length > 0) {
        spendRows.push(
          <Box key="team-spend" flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Text dimColor>{t('spend.label')}</Text>
            {spend.parts.map(p => (
              <Text key={`spend-${p.role}`} color={LOOK[p.role].color} dimColor>
                {p.text}
              </Text>
            ))}
            {spend.share !== '' && <Text dimColor>{spend.share}</Text>}
          </Box>,
        )
      }
      spendRows.push(list('usage-tools', t('usage.tools'), tools))
      if (counted.top.length > 0) {
        spendRows.push(
          <Box key="usage-turns" flexDirection="column">
            <Text dimColor>{t('usage.turns')}</Text>
            {counted.top.map(turn => (
              <Box key={`turn-${turn.n}`} flexDirection="column">
                {stat(`turn-${turn.n}-row`, t('usage.turn', { n: turn.n }), `${kilo(turn.tokens)} · ${seconds(turn.ms)}`)}
                {turn.prompt !== undefined && (
                  <Box paddingLeft={2}>
                    <Text dimColor wrap="truncate-end">{turn.prompt}</Text>
                  </Box>
                )}
              </Box>
            ))}
          </Box>,
        )
      }
      rows.push(
        <Box key="usage-spend" flexDirection="column" rowGap="xs">
          {spendRows}
        </Box>,
      )
    }

    return rows
  }

  // One tab at a time under the drawing: each button names its card and,
  // when there is news there, a short count, so a hidden tab still speaks.
  const ctxPercent = u.context?.percent ?? (counted.context === undefined ? 0 : contextPercent(counted.context))
  const TAB_LOOK: Record<CardId, { label: string; accent: string; badge: string }> = {
    // Agents waiting for answers speak from a hidden tab too.
    team: { label: t('tab.team'), accent: BRAND[0], badge: [busy > 0 ? `●${busy}` : '', asking > 0 ? `?${asking}` : ''].filter(b => b !== '').join(' ') },
    skills: { label: t('tab.skills'), accent: SKILL_COLOR, badge: picked.length + packsPicked > 0 ? `✦${picked.length + packsPicked}` : '' },
    jobs: { label: t('tab.jobs'), accent: BRAND[1], badge: runningJobs.length > 0 ? `⟳${runningJobs.length}` : '' },
    github: { label: t('tab.github'), accent: BRAND[2], badge: ci?.mark ?? '' },
    // Only a context nearly full speaks from a hidden tab.
    usage: { label: t('tab.usage'), accent: USAGE_COLOR, badge: ctxPercent >= COMPACT_AT ? percentText(ctxPercent) : '' },
  }
  const tabRow = (
    <Box key="tabs" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap="xs">
      {TABS.map(id => {
        const look = TAB_LOOK[id]

        return (
          <Button
            key={`tab-${id}`}
            {...(id === shown ? { variant: 'primary' as const } : {})}
            label={look.badge === '' ? look.label : `${look.label} ${look.badge}`}
            onPress={() =>
              // The breakdown is read again when the usage tab opens, never on the ticker.
              void showTab($, id).then(() => (id === 'usage' ? quietly(refreshContext($)) : undefined))
            }
          />
        )
      })}
    </Box>
  )
  const BODIES: Record<CardId, { title: string; plate: string; body: () => RenderChildren }> = {
    team: { title: t('card.team'), plate: t('plate.team'), body: teamBody },
    skills: { title: t('card.skills'), plate: t('plate.skills'), body: skillsBody },
    jobs: { title: t('card.jobs'), plate: t('plate.jobs'), body: jobsBody },
    github: { title: t('card.github'), plate: t('plate.github'), body: githubBody },
    usage: { title: t('card.usage'), plate: t('plate.usage'), body: usageBody },
  }
  const showing = BODIES[shown]
  const cards = (
    <Box key="cards" flexDirection="column" rowGap="sm">
      {strip}
      {tabRow}
      {card(shown, TAB_LOOK[shown].accent, showing.title, showing.plate, showing.body)}
    </Box>
  )

  if (e.surface === 'terminal') {
    // No SVG in the terminal: a one-line team with awake or asleep faces.
    const slots = slotsOf(squad)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text color={LOOK.main.color} bold>
            {`▄▀▄ ${branding.word} TEAM ▄▀▄`}
          </Text>
          {toggles('row')}
        </Box>
        <Text color={LOOK.main.color} bold>
          {'      [•_•] Claude'}
        </Text>
        <Text dimColor>{'        │'}</Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {slots.map((slot, i) => {
            // An agent that stopped to ask is awake, in purple, with a "?" until it is continued.
            const asks = slot.agent !== undefined && isAsking(slot.agent)

            return (
              <Text
                key={`slot-${slot.role}-${slot.agent?.id ?? i}`}
                color={asks ? ASK : slot.agent?.status === 'running' ? LOOK[slot.role].color : undefined}
                dimColor={!asks && slot.agent?.status !== 'running'}
              >
                {slot.agent?.status === 'running' ? '[•_•]' : asks ? '[•_•]?' : '[-_-]'} {nameOf(slot.role)}
                {slot.running > 1 ? ` ×${slot.running}` : ''}
              </Text>
            )
          })}
        </Box>
        {cards}
      </Box>
    )
  }

  // Desktop, editor and mobile all carry Svg; only the terminal lacks it.
  const { Svg } = $.ui.resolve(e) as Elements['desktop']
  // Ask for more width than the body has: the surface's height cap decides
  // the drawn size, and a smaller ask would bind first and shrink it.
  const width = Math.max(320, Math.round(e.props.bodyColumns * 16))

  // The drawing is a plain image, not an interactive frame: a frame keeps the
  // wheel to itself, so the pane would not scroll with the pointer over it.
  // Its SMIL animation still runs; what the frame's tooltips said, a card
  // under the pointer says instead.
  const tips = [
    ...gaugesOf(u, at).map(g => g.tip),
    ...(isOverReading(squad.main) ? [`${overReadTitle(squad.main.reads.length)}.`] : []),
  ]

  return (
    <Box flexDirection="column" rowGap="sm" paddingX={1} paddingY="xs">
      <Box key="drawing" flexDirection="row" columnGap={1} alignItems="flex-start">
        {toggles('column')}
        <Box key="drawing-art" flexDirection="column" flexGrow={1} flexShrink={1}>
          <Svg
            source={drawTeam(squad, at, u)}
            alt={t('alt.drawing', { title: branding.title, usage: usageAlt(u) })}
            width={width}
          />
          {tips.length > 0 && (
            <Box
              position="absolute"
              bottom={0}
              right={0}
              width={tipWidth}
              display="none"
              hover={{ display: 'flex' }}
              flexDirection="column"
              borderStyle="round"
              borderColor={CONTEXT_COLOR}
              backgroundColor="#1b1726"
              paddingX={1}
            >
              {tips.map((tip, i) => (
                <Text key={`drawing-tip-${i}`} dimColor={i > 0} wrap="wrap">
                  {tip}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>
      {cards}
    </Box>
  )
}
