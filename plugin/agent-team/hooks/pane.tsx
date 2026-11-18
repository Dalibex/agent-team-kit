import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, RenderChildren, RenderInput } from 'claude-code'
import type { SlotPicker } from '../types'
import { reviewText } from './github'
import { kilo, levelOf, percentText, projectionOf, resetClock, roundTokens, windowShort } from './usage'
import { choose, compactNow, copyText, createPack, deletePack, openPicker, pickerBack, pickGroup, refreshGit, setPackName, showSkills, showTab, toggleArmed, toggleDelegation, togglePack, toggleSkillEdit, turnPage, viewAgent } from './actions'
import { drawTeam, gaugesOf, slotsOf, usageAlt } from './drawing'
import { BRAND, branding, clockText, titlePlate, COMPACT_AT, CONTEXT_COLOR, DEFAULT_BRANCHES, GIT_COLOR, JOB_MARK, JOB_METER, LEVEL_COLOR, LOOK, meterCols, seconds, SKILL_COLOR, SPINNER, STATUS_MARK, STATUS_TEXT, tokenLine, TRACK, WARN } from './look'
import { ciMark, EMPTY, familyOf, FIRST_TAB, spendParts, NO_PACKS, PACK_NAME_MAX, packDeleteAsk, PACKS_VIEW, freshOf, GIT_SHAPE, groupOf, isOverReading, jobRowsOf, NO_CHOICES, NO_GROUP, NO_IDS, NO_PICKER, NO_SLOTS, PICK_PAGE, runMark, sessionTokensOf, SHOWN_ROWS, SKILLS_EDIT, slotLabel, TABS, TEAM_SHAPE, USAGE_SHAPE } from './state'
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

/**
 * The pane: the drawing (the team and its usage column), the line under it
 * and the cards. Redrawn when any value it reads changes, and once a second
 * while something works.
 */
export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Button, Link, Input } = $.ui.resolve(e)
  // The surfaces that draw images (all but the terminal) get the cards' pixel titles.
  const SvgImage = e.surface === 'terminal' ? undefined : ($.ui.resolve(e) as Elements['desktop']).Svg
  const t = await read($, team)
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
  const cols = meterCols(e.props.bodyColumns)

  // Ids of rows that still exist: unfolding one also drops the ids of rows
  // that left the history, so the list does not grow for the whole session.
  const live = new Set<string>([
    'main',
    SKILLS_EDIT,
    ...packList.flatMap(p => (p === null ? [] : [packDeleteAsk(p.id)])),
    ...t.shells.map(sh => sh.id),
    ...t.jobs.map(j => j.id),
    ...t.agents.flatMap(a => [a.id, `report-${a.id}`]),
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
  const jobRows = jobRowsOf(t, at)
  const runningJobs = jobRows.filter(r => r.state === 'running')
  const ci = g.pr === undefined ? undefined : ciMark(g.pr.checks)
  const chips = [
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
            <Text key="chip-eta" color={WARN}>{`5h al 100% a las ${resetClock(eta, at) ?? ''}`}</Text>
          ),
        ]
      : []),
    // Near the end of the window, one press compacts the conversation.
    (u.context?.percent ?? 0) >= COMPACT_AT ? (
      <Button
        key="compact"
        label={`Compactar contexto (${percentText(u.context?.percent ?? 0)})`}
        onPress={() => void compactNow($)}
      />
    ) : null,
    g.state === 'ok' && g.branch !== undefined ? (
      <Text key="chip-git" color={GIT_COLOR}>
        {`⎇ ${g.branch}${g.ahead > 0 ? ` ↑${g.ahead}` : ''}${g.behind > 0 ? ` ↓${g.behind}` : ''}`}
      </Text>
    ) : null,
    ci === undefined ? null : <Text key="chip-ci" color={ci.color}>{`CI ${ci.mark}`}</Text>,
    runningJobs.length === 0 ? null : (
      <Text key="chip-jobs" color={BRAND[1]}>
        {`⟳ ${runningJobs.length === 1 ? (runningJobs[0]?.title ?? '') : `${runningJobs.length} en marcha`}`}
      </Text>
    ),
    // The picked skills stay in sight from every tab.
    picked.length + packsPicked === 0 ? null : (
      <Text key="chip-skills" color={SKILL_COLOR} bold>
        {`✦ ${[
          ...packList.flatMap(p => (p !== null && packIds.includes(p.id) ? [`▣ ${p.name === '' ? 'pack' : p.name}`] : [])),
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
        Sin cifras todavía
      </Text>
    ) : null

  // ------------------------------------------------------- the team

  // One frame per tick: the ticker redraws once a second while anything works.
  const beat = Math.floor(at / 1000)
  const spin = SPINNER[beat % SPINNER.length] ?? '●'
  const workingText = `${spin} trabajando${'.'.repeat(1 + (beat % 3))}`
  const busy = t.agents.filter(a => a.status === 'running').length
  const recent = [...t.agents].reverse().slice(0, SHOWN_ROWS)

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

  const teamBody = () => {
    const m = t.main
    const sessionTokens = sessionTokensOf(t)
    const isMainOpen = open.includes('main')
    const isMainWorking = m.status === 'working'
    const doing =
      m.lastDetail !== undefined && m.lastDetail !== '' ? `${m.lastTool ?? ''} · ${m.lastDetail}` : (m.lastTool ?? 'pensando')
    const rows: RenderChildren[] = [
      <Box key="main" flexDirection="column">
        {line(
          'main-row',
          <Text color={LOOK.main.color} bold={isMainWorking}>{`${isMainWorking ? '●' : '○'} Claude`}</Text>,
          <Text color={isMainWorking ? LOOK.main.color : undefined} dimColor={!isMainWorking} wrap="truncate-end">
            {isMainWorking ? workingText : 'en reposo'}
          </Text>,
          isMainWorking ? seconds(at - m.since) : '',
          isMainOpen,
          () => toggle('main'),
        )}
        {isOverReading(m) && (
          <Text color={WARN} wrap="truncate-end">{`⚠ ${m.reads.length} ficheros leídos sin el explorer`}</Text>
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
              {isMainWorking ? `${m.calls} herramienta${m.calls === 1 ? '' : 's'} · ahora ${doing}` : 'esperándote'}
            </Text>
            {m.log.map((entry, i) => (
              <Text key={`log-${i}`} dimColor wrap="truncate-end">
                {entry}
              </Text>
            ))}
            {m.lastTokens !== undefined && <Text dimColor wrap="wrap">último turno: {tokenLine(m.lastTokens)}</Text>}
            {sessionTokens !== '' && (
              <Text dimColor wrap="wrap">
                {`tokens nuevos de la sesión: ${sessionTokens}`}
              </Text>
            )}
            {t.notices.map((notice, i) => (
              <Text key={`notice-${i}`} dimColor wrap="truncate-end">
                aviso · {notice}
              </Text>
            ))}
          </Box>
        )}
      </Box>,
    ]
    // What the session has used so far, per role: the figure the team is there to keep down.
    const spend = spendParts(t)
    if (spend.parts.length > 0) {
      rows.push(
        <Box key="team-spend" flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Text dimColor>Sesión</Text>
          {spend.parts.map(p => (
            <Text key={`spend-${p.role}`} color={LOOK[p.role].color} dimColor>
              {p.text}
            </Text>
          ))}
          {spend.share !== '' && <Text dimColor>{spend.share}</Text>}
        </Box>,
      )
    }
    for (const a of recent) {
      const isOpen = open.includes(a.id)
      const isRunning = a.status === 'running'
      const answer = a.answer ?? ''
      const meta = [seconds((a.endedAt ?? at) - a.startedAt), familyOf(a.model)]
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
              {`${STATUS_MARK[a.status]} ${LOOK[a.role].name}`}
            </Text>,
            isRunning ? (
              <Text color={LOOK[a.role].color} wrap="truncate-end">
                {workingText}
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
          {(a.skills?.length ?? 0) > 0 && (
            <Text color={SKILL_COLOR} dimColor wrap="truncate-end">{`✦ ${(a.skills ?? []).map(slotLabel).join(' · ')}`}</Text>
          )}
          {isOpen && (
            <Box flexDirection="column" paddingLeft={2}>
              <Text wrap="wrap">{a.description}</Text>
              <Text dimColor wrap="wrap">
                {[
                  STATUS_TEXT[a.status],
                  isRunning ? a.lastTool : undefined,
                  `${a.calls} herramienta${a.calls === 1 ? '' : 's'}`,
                  a.tokens === undefined || freshOf(a.tokens) === 0 ? undefined : `${kilo(freshOf(a.tokens))} tokens`,
                ]
                  .filter((part): part is string => part !== undefined && part !== '')
                  .join(' · ')}
              </Text>
              <Text dimColor wrap="wrap">
                {a.prompt}
              </Text>
              {a.tokens !== undefined && <Text dimColor wrap="wrap">tokens: {tokenLine(a.tokens)}</Text>}
              {a.endNote !== undefined && <Text dimColor wrap="wrap">final: {a.endNote}</Text>}
              {answer !== '' && (
                <Box>
                  <Button
                    key={`report-${a.id}`}
                    plain
                    dimColor
                    label={`${open.includes(`report-${a.id}`) ? '▾' : '▸'} su informe`}
                    onPress={() => toggle(`report-${a.id}`)}
                  />
                </Box>
              )}
              {answer !== '' && open.includes(`report-${a.id}`) && <Text wrap="wrap">{answer}</Text>}
              <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
                <Button key={`view-${a.id}`} label="Ver su conversación" onPress={() => void viewAgent($, a.id)} />
                {answer !== '' && (
                  <Button key={`copy-${a.id}`} label="Copiar informe" onPress={press => void copyText($, answer, press)} />
                )}
              </Box>
            </Box>
          )}
        </Box>,
      )
    }
    // The Agent tool's team paragraph is read when a session first draws the tool: a change waits for the next one.
    rows.push(
      <Box key="team-foot" flexDirection="row" columnGap={1}>
        <Box flexShrink={0}>
          <Button
            key="delegation"
            plain
            dimColor
            label={isDelegating ? 'Delegar: sí' : 'Delegar: no'}
            onPress={() => void toggleDelegation($)}
          />
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="wrap">
            {isDelegating ? 'según tus reglas; un cambio vale en la próxima conversación' : 'solo si se lo pides; un cambio vale en la próxima conversación'}
          </Text>
        </Box>
      </Box>,
    )

    return rows
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
  const tipWidth = Math.max(20, Math.min(52, e.props.bodyColumns - 6))

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
        <Button key="skills-back" label="← Volver" onPress={() => void pickerBack($)} />
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="wrap">{`${pickTarget(p)}${p.group === undefined ? '' : ` · ${p.group}`}`}</Text>
        </Box>
      </Box>
    )
    if (choiceList.length === 0) {
      return [
        head,
        <Text key="pick-none" dimColor wrap="wrap">
          No encuentro skills ni comandos en esta sesión.
        </Text>,
      ]
    }
    if (p.group === undefined) {
      return [
        head,
        <Text key="pick-hint" dimColor wrap="truncate-end">
          {current === null ? 'Elige de qué plugin es la skill.' : `Ahora: ${current}. Elige de qué plugin es la nueva.`}
        </Text>,
        grid(
          'pick-groups',
          groups.map((group, i) => ({
            cell: (
              <Button
                key={`skills-group-${i}`}
                label={`${group} (${choiceList.filter(c => groupOf(c.name) === group).length})`}
                onPress={() => void pickGroup($, group)}
              />
            ),
          })),
          '50%',
        ),
        ...(current === null
          ? []
          : [<Button key="skills-clear" plain dimColor label="Vaciar hueco" onPress={() => void choose($, null)} />]),
      ]
    }
    const inGroup = choiceList.filter(c => groupOf(c.name) === p.group)
    // In a pack, a skill another of its slots holds is marked and cannot go in twice.
    const heldElsewhere = new Set(
      p.pack === undefined
        ? []
        : (packList.find(one => one?.id === p.pack)?.skills ?? []).filter((n, i): n is string => n !== null && i !== p.slot),
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
              <Text dimColor>{`${page + 1} de ${pages}`}</Text>
              {page < pages - 1 && <Button key="skills-next" label="▶" onPress={() => void turnPage($, 1)} />}
            </Box>,
          ]
        : []),
    ]
  }

  /** What a picker fills, in words: a loose slot, or a pack's. */
  const pickTarget = (p: SlotPicker): string => {
    if (p.pack === undefined) return `Hueco ${p.slot + 1}`
    const name = packList.find(one => one?.id === p.pack)?.name ?? ''

    return `${name === '' ? 'Pack sin nombre' : name} · hueco ${p.slot + 1}`
  }
  /** A slot's skill the session no longer has, once its list is known. */
  const isMissing = (name: string): boolean => choiceList.length > 0 && !choiceList.some(c => c.name === name)
  /** The pointer card of a skill slot: its whole name and what it does, or that it is gone. */
  const skillTip = (name: string | null): Omit<Cell, 'cell'> => {
    if (name === null) return {}
    const detail = isMissing(name) ? 'No está instalada en esta sesión: no se envía.' : describe(name)

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
        <Button key="skills-packs" label="← Packs" onPress={() => void showSkills($, PACKS_VIEW)} />
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="wrap">
            Skills sueltas: van enteras en cada consulta.
          </Text>
        </Box>
      </Box>,
      grid('slots', cells, '50%'),
      <Box key="skills-foot" flexDirection="row" columnGap={2}>
        <Box flexShrink={0}>
          <Button
            key="skills-edit"
            label={isEditingSkills ? '← Volver' : '✎ Editar'}
            onPress={() => void toggleSkillEdit($)}
          />
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="wrap">
            {isEditingSkills
              ? 'Pulsa un hueco para cambiar su skill.'
              : picked.length > 0
                ? 'Van en cada consulta hasta que las desmarques.'
                : filledSlots === 0
                  ? 'Pulsa ＋ para poner una skill en un hueco.'
                  : 'Pulsa una para que vaya en tus consultas.'}
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
      const name = pack.name === '' ? 'Pack sin nombre' : pack.name
      const held = pack.skills.filter((one): one is string => one !== null)
      const missing = held.filter(isMissing).length
      const tip = {
        tip: `${name} · ${held.length} skill${held.length === 1 ? '' : 's'}`,
        detail:
          held.length === 0
            ? 'Vacío: pulsa ✎ Editar y ábrelo para llenarlo.'
            : `${held.map(slotLabel).join(', ')}${missing > 0 ? ` · ${missing} no instalada${missing === 1 ? '' : 's'}` : ''}`,
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
              ? 'Pulsa un pack para renombrarlo o cambiar sus skills.'
              : packsPicked > 0
                ? 'Claude carga solo las skills que pida cada consulta.'
                : filledPacks === 0
                  ? 'Pulsa ＋ para crear un pack.'
                  : 'Pulsa un pack para que vaya en tus consultas.'}
          </Text>
        </Box>
        <Button
          key="skills-edit"
          label={isEditingSkills ? '← Volver' : '✎ Editar'}
          onPress={() => void toggleSkillEdit($)}
        />
        <Button
          key="skills-loose"
          label={`Skills sueltas${picked.length > 0 ? ` ●${picked.length}` : ''}`}
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
          <Button key="pack-back" label="← Packs" onPress={() => void showSkills($, PACKS_VIEW)} />
        </Box>
        <Box>
          <Input
            key="pack-name"
            label="Nombre"
            placeholder={`Nombre del pack (hasta ${PACK_NAME_MAX})`}
            value={pack.name}
            submitLabel="guardar"
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
          label={isPicked ? '● Marcado' : 'Marcar pack'}
          onPress={() => void togglePack($, pack.id)}
        />
        <Button
          key="pack-delete"
          {...(isAsking ? {} : { plain: true as const, dimColor: true })}
          label={isAsking ? '¿Seguro? Pulsa otra vez' : 'Borrar pack'}
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
  /** One line per job: its mark, what it is, a small bar while it runs, and how long. */
  const jobsBody = () =>
    rows.length === 0
      ? [
          <Text key="jobs-empty" dimColor>
            Nada en marcha.
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
                    {r.title}
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
          Mirando el repositorio…
        </Text>,
      ]
    }
    if (g.state === 'none') {
      return [
        <Text key="git-none" dimColor wrap="wrap">
          Esta carpeta no es un repositorio git.
        </Text>,
      ]
    }
    const out: RenderChildren[] = []
    if (g.state === 'error') {
      out.push(
        <Text key="git-error" color={WARN} wrap="truncate-end">
          {`git: ${g.error ?? 'no respondió'}`}
        </Text>,
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
              <Text color={GIT_COLOR} wrap="truncate-end">{`⎇ ${g.branch ?? '?'}`}</Text>
            </Box>
          </Box>
          {(g.ahead > 0 || g.behind > 0 || g.dirty > 0) && (
            <Box flexDirection="row" flexWrap="wrap" columnGap={2} paddingLeft={2}>
              {(g.ahead > 0 || g.behind > 0) && <Text dimColor>{`↑${g.ahead} ↓${g.behind}`}</Text>}
              {g.dirty > 0 && <Text color={WARN}>{`${g.dirty} sin commit`}</Text>}
            </Box>
          )}
        </Box>,
      )
      if (g.repo !== undefined) {
        const base = `https://github.com/${g.repo}`
        const branch = g.branch === undefined || g.branch === 'HEAD suelto' ? undefined : g.branch
        // Each segment encoded on its own: a branch's slashes are part of the path.
        const branchPath = branch?.split('/').map(encodeURIComponent).join('/')
        const canOpenPr = g.pr === undefined && branch !== undefined && !DEFAULT_BRANCHES.has(branch)
        out.push(
          <Box key="git-links" flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Link key="link-repo" href={base} label="Repo" />
            {branchPath !== undefined && <Link key="link-branch" href={`${base}/tree/${branchPath}`} label="Rama" />}
            <Link key="link-issues" href={`${base}/issues`} label="Issues" />
            <Link key="link-pulls" href={`${base}/pulls`} label="PRs" />
            <Link key="link-actions" href={`${base}/actions`} label="Actions" />
            {canOpenPr && branchPath !== undefined && (
              <Link key="link-new-pr" href={`${base}/compare/${branchPath}?expand=1`} label="Crear PR" />
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
              {c.ok > 0 && <Text color="#4caf50">{`✓ ${c.ok}`}</Text>}
              {c.failed > 0 && <Text color="#ff5c5c">{`✗ ${c.failed}`}</Text>}
              {c.pending > 0 && <Text color={WARN}>{`● ${c.pending}`}</Text>}
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
        if (c.firstFailure !== undefined) {
          out.push(
            <Box key="git-failure" flexDirection="row" flexWrap="wrap" columnGap={2}>
              <Text color="#ff5c5c" wrap="wrap">{`✗ ${c.firstFailure.name}`}</Text>
              <Link key="failure-link" href={c.firstFailure.url} label="ver qué falló" />
            </Box>,
          )
        }
      } else if (g.run !== undefined) {
        const run = runMark(g.run)
        out.push(
          <Box key="git-run" flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Text color={run.color} wrap="wrap">{`${run.mark} ${g.run.name} ${run.text}`}</Text>
            {g.run.url !== '' && (
              <Link key="run-link" href={g.run.url} label={run.mark === '✗' ? 'ver qué falló' : 'ver'} />
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
                label={`Te piden revisión en ${g.reviewRequested} PR`}
              />
            )}
            {g.mine > 0 && (
              <Link
                key="link-mine"
                href="https://github.com/pulls"
                label={`tienes ${g.mine} PR abierta${g.mine === 1 ? '' : 's'}`}
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
          {last.url !== undefined && <Link key="op-link" href={last.url} label="abrir" />}
        </Box>,
      )
    }

    return out
  }

  // One tab at a time under the drawing: each button names its card and,
  // when there is news there, a short count, so a hidden tab still speaks.
  const TAB_LOOK: Record<CardId, { label: string; accent: string; badge: string }> = {
    team: { label: 'Equipo', accent: BRAND[0], badge: busy > 0 ? `●${busy}` : '' },
    skills: { label: 'Skills', accent: SKILL_COLOR, badge: picked.length + packsPicked > 0 ? `✦${picked.length + packsPicked}` : '' },
    jobs: { label: 'Procesos', accent: BRAND[1], badge: runningJobs.length > 0 ? `⟳${runningJobs.length}` : '' },
    github: { label: 'GitHub', accent: BRAND[2], badge: ci?.mark ?? '' },
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
            onPress={() => void showTab($, id)}
          />
        )
      })}
    </Box>
  )
  const BODIES: Record<CardId, { title: string; plate: string; body: () => RenderChildren }> = {
    team: { title: 'Equipo', plate: 'EQUIPO', body: teamBody },
    skills: { title: 'Skills', plate: 'SKILLS', body: skillsBody },
    jobs: { title: 'Instalaciones y procesos', plate: 'PROCESOS', body: jobsBody },
    github: { title: 'GitHub', plate: 'GITHUB', body: githubBody },
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
    const slots = slotsOf(t)

    return (
      <Box flexDirection="column" gap={1}>
        <Text color={LOOK.main.color} bold>
          {`▄▀▄ ${branding.word} TEAM ▄▀▄`}
        </Text>
        <Text color={LOOK.main.color} bold>
          {'      [•_•] Claude'}
        </Text>
        <Text dimColor>{'        │'}</Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {slots.map((slot, i) => (
            <Text
              key={`slot-${slot.role}-${slot.agent?.id ?? i}`}
              color={slot.agent?.status === 'running' ? LOOK[slot.role].color : undefined}
              dimColor={slot.agent?.status !== 'running'}
            >
              {slot.agent?.status === 'running' ? '[•_•]' : '[-_-]'} {LOOK[slot.role].name}
              {slot.running > 1 ? ` ×${slot.running}` : ''}
            </Text>
          ))}
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
    ...(isOverReading(t.main) ? [`Claude ha leído ${t.main.reads.length} ficheros este turno sin mandar al explorer.`] : []),
  ]

  return (
    <Box flexDirection="column" rowGap="sm" paddingX={1} paddingY="xs">
      <Box key="drawing" flexDirection="column">
        <Svg
          source={drawTeam(t, at, u)}
          alt={`${branding.title}: Claude arriba y sus agentes debajo; cada uno se despierta mientras trabaja. Al pie, ${usageAlt(u)}`}
          width={width}
        />
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
      </Box>
      {cards}
    </Box>
  )
}
