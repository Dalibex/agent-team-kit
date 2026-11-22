// Every text the pane shows the person, in English and Spanish, and the language that picks between them.
// The texts the model reads (skillContext, packContext, teamContext, TEAM_DELEGATION) are not here: they stay English.

import type { EngineInterface } from 'claude-code'

export type Lang = 'en' | 'es'

const en = {
  // roles and states
  'role.other': 'agent',
  'status.running': 'working',
  'status.done': 'done',
  'status.failed': 'failed',
  'status.stopped': 'stopped',
  'tokens.line': '{input} in · {output} out · {cacheWrite} cache written · {cacheRead} cache read',
  'tokens.count': '{n} tokens',
  'tokens.turns.one': '{n} turn',
  'tokens.turns.other': '{n} turns',
  'spend.label': 'Session',
  'spend.line': 'Session: {all}',
  'spend.share': 'team {percent}',

  // time, windows and limits
  'day.0': 'Sun',
  'day.1': 'Mon',
  'day.2': 'Tue',
  'day.3': 'Wed',
  'day.4': 'Thu',
  'day.5': 'Fri',
  'day.6': 'Sat',
  'reset.now': 'resets now',
  'reset.inMin': 'resets in {n} min',
  'reset.inHours': 'resets in {h} h',
  'reset.inHoursMin': 'resets in {h} h {m} min',
  'reset.on': 'resets on {day} at {time}',
  'window.fiveHour': '5 h window',
  'window.sevenDay': 'Week',
  'window.spend': 'Spend',
  'window.warning': '{window} at {percent}',
  'gauge.spend': 'SPEND',
  'gauge.waiting': 'waiting',
  'gauge.waitingTip': "The figures arrive with the model's first answer.",
  'gauge.noReset': 'no reset time',
  'gauge.resets': 'resets {when}',
  'gauge.used': '{window}: {percent} used.',
  'gauge.resetsTip': 'Resets: {when}.',
  'gauge.reaches': 'At this rate it reaches 100% at {time}.',
  'gauge.projection': '↗ 100% at {time}',
  'ctx.note': 'session context',
  'ctx.tip': 'Context: {used} of {window} ({percent}).',
  'ctx.unmeasured': 'not measured yet',
  'alt.usage.waiting': 'usage, which arrives with the first answer.',
  'alt.usage.projection': 'at this rate the 5 h window fills at {time}',
  'alt.usage.context': 'context {used} of {window}',
  'alt.drawing': '{title}: Claude on top and its agents below; each one wakes up while it works. At the bottom, {usage}',
  'slot.idle': '{name}: no tasks yet',
  'warn.overread.title': 'Claude has read {n} files this turn without sending the explorer',
  'warn.overread.line': '{n} files read without the explorer',

  // the status line, notifications and toasts
  'status.agents.one': '{n} agent working',
  'status.agents.other': '{n} agents working',
  'status.shells.one': '{n} background shell',
  'status.shells.other': '{n} background shells',
  'notify.done': '{what} finished after {time}',
  'notify.failed': '{what} failed after {time}',
  'toast.view.denied': "Can't open its conversation: {reason}",
  'toast.view.failed': "Can't open its conversation right now.",
  'toast.compact.working': 'Compacting the context…',
  'toast.compact.skipped': 'Not compacted: {reason}',
  'toast.compact.done': 'Context compacted.',
  'toast.compact.busy': "Can't compact while Claude works: wait for the turn to end.",
  'toast.copy.done': 'Report copied.',
  'toast.copy.failed': "Couldn't copy the report.",
  'end.aborted': 'interrupted',
  'end.error': 'an API error cut it short',
  'end.listed': "closed according to the engine's agent list",
  'end.quiet': 'no news for {time}',
  'agent.unseen': '(started before the pane was watching, so its brief is unknown)',

  // the /agent-team command
  'command.description': "Shows or hides the agent team's pane",
  'command.hidden': 'Pane {title} hidden, in later sessions too. /agent-team shows it again.',
  'command.shown': 'Pane {title} open.',
  'command.failed': "Couldn't show or hide the agent team's pane.",

  // API failures
  'api.rate_limit': 'the API cut the turn: usage limit reached',
  'api.overloaded': 'the API cut the turn: servers overloaded, try again in a while',
  'api.server_error': 'the API cut the turn: server error',
  'api.authentication_failed': 'the API cut the turn: sign in again',
  'api.oauth_org_not_allowed': 'the API cut the turn: your organization does not allow this account',
  'api.billing_error': 'the API cut the turn: billing problem',
  'api.invalid_request': 'the API cut the turn: invalid request',
  'api.model_not_found': 'the API cut the turn: model unavailable',
  'api.max_output_tokens': 'the response was cut off for being too long',
  'api.cut': 'the API cut the turn ({kind})',

  // waste warnings
  'warn.brief': 'brief without {missing}: the agent will have to guess or explore',
  'warn.brief.and': ' or ',
  'warn.repeat': 'similar to the brief from {minutes} min ago: continuing that agent with SendMessage would have cost less',
  'warn.review.one': 'Opus review of a {n}-line change: not needed for something this small',
  'warn.review.other': 'Opus review of a {n}-line change: not needed for something this small',
  'warn.rounds': '{n} rounds: Claude should stop and ask you',

  // the session log
  'runs.heading': '{date} · {folder}',
  'runs.branch': 'branch {branch}',
  'runs.agent': '{role} ({model}): {task}',
  'runs.status': 'status: {status}',
  'runs.time': 'time: {time}',
  'runs.rounds': 'rounds: {n}',
  'runs.tokens': 'tokens: {input} in / {output} out',
  'runs.warn': 'warning: {warn}',

  // git and GitHub
  'git.detached': 'detached HEAD',
  'git.missing': 'git is not installed or did not respond',
  'git.failed': 'git failed',
  'git.looking': 'Looking at the repository…',
  'git.none': 'This folder is not a git repository.',
  'git.error': 'git: {error}',
  'git.noAnswer': 'did not respond',
  'git.dirty': '{n} uncommitted',
  'git.reviewRequested.one': 'Your review is requested in {n} PR',
  'git.reviewRequested.other': 'Your review is requested in {n} PRs',
  'git.mine.one': 'you have {n} open PR',
  'git.mine.other': 'you have {n} open PRs',
  'gh.missing': 'gh is not installed or did not respond',
  'gh.noSession': 'gh is not signed in: run gh auth login',
  'gh.offline': 'GitHub is not responding (offline?)',
  'gh.noAnswer': 'gh did not respond',
  'ci.failed.one': 'CI ✗ on #{number}: 1 check fails',
  'ci.failed.other': 'CI ✗ on #{number}: {n} checks fail',
  'ci.passed.one': 'CI ✓ on #{number}: {n} check passing',
  'ci.passed.other': 'CI ✓ on #{number}: {n} checks passing',
  'ci.run': 'CI {mark} {name} on {branch}',
  'ci.branch': 'the branch',
  'op.commit': '{verb} {sha}',
  'op.commitOn': '{verb} {sha} on {branch}',
  'op.push': 'push to {branch}',
  'op.merge': 'merge of {ref}',
  'op.rebase': 'rebase of {ref}',
  'op.pr': 'PR #{number} {action}',
  'pr.created': 'created',
  'pr.edited': 'edited',
  'pr.merged': 'merged',
  'pr.commented': 'commented',
  'pr.closed': 'closed',
  'pr.reopened': 'reopened',
  'pr.ready': 'ready for review',
  'pr.draft': 'moved to draft',
  'pr.autoMergeEnabled': 'auto-merge on',
  'pr.autoMergeDisabled': 'auto-merge off',
  'review.approved': 'approved',
  'review.changes': 'changes requested',
  'review.required': 'review required',
  'run.running': 'running',
  'run.passed': 'passed',
  'run.cancelled': 'cancelled',
  'run.skipped': 'skipped',
  'run.failed': 'failed',
  'link.branch': 'Branch',
  'link.newPr': 'Create PR',
  'link.whatFailed': 'see what failed',
  'link.view': 'view',
  'link.open': 'open',

  // jobs
  'job.install': 'install',
  'job.build': 'build',
  'job.download': 'download',
  'job.more': '{shown} and {n} more',
  'job.target.project': 'project dependencies',
  'job.target.packages': 'packages',
  'job.target.crates': 'crates',
  'job.target.modules': 'modules',
  'job.target.nuget': 'NuGet packages',
  'job.target.image': 'image',
  'job.target.repository': 'repository',
  'job.target.download': 'download',
  'job.target.file': 'file',
  'jobs.empty': 'Nothing running.',
  'chip.jobs': '{n} running',
  'chip.eta': '5h to 100% at {time}',
  'chip.noFigures': 'No figures yet',
  'compact.button': 'Compact context ({percent})',

  // tabs and cards
  'tab.team': 'Team',
  'tab.skills': 'Skills',
  'tab.jobs': 'Jobs',
  'tab.github': 'GitHub',
  'card.team': 'Team',
  'card.skills': 'Skills',
  'card.jobs': 'Installs and processes',
  'card.github': 'GitHub',
  'plate.team': 'TEAM',
  'plate.skills': 'SKILLS',
  'plate.jobs': 'JOBS',
  'plate.github': 'GITHUB',
  'tab.usage': 'Usage',
  'card.usage': 'Usage',
  'plate.usage': 'USAGE',
  'usage.none': 'Nothing counted yet: the figures arrive with the first turn.',
  'usage.tokens': 'Tokens',
  'usage.tokens.line': '{input} in · {output} out',
  'usage.cache': '{percent} read from cache',
  'usage.compactions.one': '{n} compaction',
  'usage.compactions.other': '{n} compactions',
  'usage.context': 'Context now',
  'usage.context.size': 'breakdown: {used} of {window}',
  'usage.context.waiting': 'The context breakdown arrives when a turn ends.',
  'usage.free': 'Free space',
  'usage.buffer': 'Compaction buffer',
  'usage.skills': 'Skills by plugin',
  'usage.mcp': 'MCP tools by server',
  'usage.mcp.deferred': '{n} more not loaded yet',
  'usage.memory': 'Memory files',
  'usage.agents': 'Custom agents',
  'usage.more': '+{n} more',
  'usage.spend': 'Where it goes',
  'usage.tools': 'Tool results (estimate)',
  'usage.turns': 'Biggest turns',
  'usage.turn': 'Turn {n}',

  // the team card
  'main.thinking': 'thinking',
  'main.idle': 'idle',
  'main.working.one': '{n} tool · now {doing}',
  'main.working.other': '{n} tools · now {doing}',
  'main.waiting': 'waiting for you',
  'main.lastTurn': 'last turn: {tokens}',
  'main.sessionTokens': 'new tokens this session: {tokens}',
  'main.notice': 'notice · {notice}',
  'agent.tools.one': '{n} tool',
  'agent.tools.other': '{n} tools',
  'agent.tokens': 'tokens: {line}',
  'agent.end': 'end: {note}',
  'agent.report': 'its report',
  'agent.view': 'View its conversation',
  'agent.copy': 'Copy report',
  'delegate.on': 'Delegate: yes',
  'delegate.off': 'Delegate: no',
  'delegate.hintOn': 'per your rules; a change applies from the next conversation',
  'delegate.hintOff': 'only when you ask; a change applies from the next conversation',
  'models.title': 'Models',
  'models.hint': 'a change applies from the next agent; a model Claude names for one task wins',
  'models.default': 'default',
  'models.modelOf': '{role} model: {value}',
  'models.effortOf': '{role} effort: {value}',
  'models.reset': 'Reset',
  'models.costly': 'Opus, xhigh and max use more of the 5-hour and weekly limits',

  // the skills card
  'back': '← Back',
  'edit': '✎ Edit',
  'skills.noPlugin': 'no plugin',
  'skill.missing': 'Not installed in this session: it is not sent.',
  'pick.none': "I can't find skills or commands in this session.",
  'pick.plugin': 'Choose which plugin the skill is from.',
  'pick.pluginNow': 'Now: {current}. Choose which plugin the new one is from.',
  'pick.clear': 'Empty slot',
  'pick.page': '{page} of {pages}',
  'pick.slot': 'Slot {n}',
  'pick.packSlot': '{name} · slot {n}',
  'loose.head': 'Loose skills: they go whole with every prompt.',
  'loose.hintEdit': 'Press a slot to change its skill.',
  'loose.hintPicked': 'They go with every prompt until you unpick them.',
  'loose.hintEmpty': 'Press ＋ to put a skill in a slot.',
  'loose.hintPick': 'Press one to send it with your prompts.',
  'packs.back': '← Packs',
  'packs.loose': 'Loose skills',
  'packs.hintEdit': 'Press a pack to rename it or change its skills.',
  'packs.hintPicked': 'Claude loads only the skills each prompt needs.',
  'packs.hintEmpty': 'Press ＋ to create a pack.',
  'packs.hintPick': 'Press a pack to send it with your prompts.',
  'pack.unnamed': 'Unnamed pack',
  'pack.short': 'pack',
  'pack.skills.one': '{n} skill',
  'pack.skills.other': '{n} skills',
  'pack.emptyTip': 'Empty: press ✎ Edit and open it to fill it.',
  'pack.missing.one': '{n} not installed',
  'pack.missing.other': '{n} not installed',
  'pack.nameLabel': 'Name',
  'pack.namePlaceholder': 'Pack name (up to {max})',
  'pack.save': 'save',
  'pack.picked': '● Picked',
  'pack.pick': 'Pick pack',
  'pack.confirmDelete': 'Sure? Press again',
  'pack.delete': 'Delete pack',

  // the team rules in CLAUDE.md and the update notice
  'command.usage': '/agent-team shows or hides the pane; /agent-team rules adds or updates the team rules in your CLAUDE.md; /agent-team rules off removes them.',
  'rules.created': 'Team rules written to {path} (the file did not exist).',
  'rules.appended': 'Team rules added at the end of {path}. A copy of the old file is next to it: {backup}.',
  'rules.replaced': 'Team rules in {path} updated. A copy of the old file is next to it: {backup}.',
  'rules.current': 'The team rules in {path} are already up to date.',
  'rules.removed': 'Team rules removed from {path}; the rest of the file is as it was. A copy of the old file is next to it: {backup}.',
  'rules.none': 'There are no team rules in {path}: nothing to remove.',
  'rules.malformed': 'The team rules markers in {path} are malformed ({why}): I changed nothing. Fix or delete them by hand and run the command again.',
  'rules.why.noEnd': 'the start marker has no end marker',
  'rules.why.noStart': 'the end marker has no start marker',
  'rules.why.duplicated': 'a marker appears more than once',
  'rules.why.reversed': 'the end marker comes before the start marker',
  'rules.failed': "Couldn't read or write {path}: {reason}. Nothing was changed.",
  'rules.failedAfterBackup': "Couldn't write {path}: {reason}. It may still be as it was; a copy of it is at {backup}.",
  'rules.replacedEdited': 'Team rules in {path} replaced. The block there differed from the ones the plugin ships (edited by you, or from an older version): a copy of the old file is next to it: {backup}.',
  'rules.legacy': 'There are already team rules in {path} without the markers (line {line}: {heading}), probably from an older version. If I added the new ones you would have both, so I changed nothing: remove it first, then run the command again.',
  'rules.marker': "{path} mentions the team rules start marker, but I can't find a block I could replace: I changed nothing. Fix or delete that line and run the command again.",
  'rules.notUtf8': '{path} is not saved as UTF-8: I changed nothing, so as not to damage its characters.',
  'rules.typed': 'The team rules in your CLAUDE.md are only changed by a command you type yourself at the prompt.',
  'rules.noPlace': "I can't tell where your CLAUDE.md is: none of CLAUDE_CONFIG_DIR, HOME or USERPROFILE is set.",
  'update.available': 'agent-team {version} available',
  'update.hint': 'claude plugin marketplace update agent-team-kit · claude plugin update agent-team@agent-team-kit · /reload-plugins',
  'update.toast': 'agent-team {version} is available: run `claude plugin marketplace update agent-team-kit` and `claude plugin update agent-team@agent-team-kit`, then /reload-plugins',
} as const satisfies Record<string, string>

export type Key = keyof typeof en

const es: Record<Key, string> = {
  'role.other': 'agente',
  'status.running': 'trabajando',
  'status.done': 'hecho',
  'status.failed': 'falló',
  'status.stopped': 'parado',
  'tokens.line': '{input} entrada · {output} salida · {cacheWrite} caché escrita · {cacheRead} caché leída',
  'tokens.count': '{n} tokens',
  'tokens.turns.one': '{n} turno',
  'tokens.turns.other': '{n} turnos',
  'spend.label': 'Sesión',
  'spend.line': 'Sesión: {all}',
  'spend.share': 'equipo {percent}',

  'day.0': 'dom',
  'day.1': 'lun',
  'day.2': 'mar',
  'day.3': 'mié',
  'day.4': 'jue',
  'day.5': 'vie',
  'day.6': 'sáb',
  'reset.now': 'se reinicia ya',
  'reset.inMin': 'se reinicia en {n} min',
  'reset.inHours': 'se reinicia en {h} h',
  'reset.inHoursMin': 'se reinicia en {h} h {m} min',
  'reset.on': 'se reinicia el {day} a las {time}',
  'window.fiveHour': 'Ventana 5 h',
  'window.sevenDay': 'Semana',
  'window.spend': 'Gasto',
  'window.warning': '{window} al {percent}',
  'gauge.spend': 'GASTO',
  'gauge.waiting': 'esperando',
  'gauge.waitingTip': 'Las cifras llegan con la primera respuesta del modelo.',
  'gauge.noReset': 'sin hora de reinicio',
  'gauge.resets': 'reinicia {when}',
  'gauge.used': '{window}: {percent} usado.',
  'gauge.resetsTip': 'Se reinicia: {when}.',
  'gauge.reaches': 'A este ritmo llega al 100% a las {time}.',
  'gauge.projection': '↗ 100% a las {time}',
  'ctx.note': 'contexto de la sesión',
  'ctx.tip': 'Contexto: {used} de {window} ({percent}).',
  'ctx.unmeasured': 'sin medir todavía',
  'alt.usage.waiting': 'el uso, que llega con la primera respuesta.',
  'alt.usage.projection': 'a este ritmo la ventana de 5 h se llena a las {time}',
  'alt.usage.context': 'contexto {used} de {window}',
  'alt.drawing': '{title}: Claude arriba y sus agentes debajo; cada uno se despierta mientras trabaja. Al pie, {usage}',
  'slot.idle': '{name}: sin encargos todavía',
  'warn.overread.title': 'Claude ha leído {n} ficheros este turno sin mandar al explorer',
  'warn.overread.line': '{n} ficheros leídos sin el explorer',

  'status.agents.one': '{n} agente trabajando',
  'status.agents.other': '{n} agentes trabajando',
  'status.shells.one': '{n} shell en segundo plano',
  'status.shells.other': '{n} shells en segundo plano',
  'notify.done': '{what} terminó tras {time}',
  'notify.failed': '{what} falló tras {time}',
  'toast.view.denied': 'No se puede abrir su conversación: {reason}',
  'toast.view.failed': 'No se puede abrir su conversación ahora.',
  'toast.compact.working': 'Compactando el contexto…',
  'toast.compact.skipped': 'No se compactó: {reason}',
  'toast.compact.done': 'Contexto compactado.',
  'toast.compact.busy': 'No se puede compactar mientras Claude trabaja: espera a que acabe el turno.',
  'toast.copy.done': 'Informe copiado.',
  'toast.copy.failed': 'No se pudo copiar el informe.',
  'end.aborted': 'interrumpido',
  'end.error': 'un error de la API lo cortó',
  'end.listed': 'cerrado según la lista de agentes del motor',
  'end.quiet': 'sin noticias desde hace {time}',
  'agent.unseen': '(empezó antes de que el panel mirase, así que no se sabe su encargo)',

  'command.description': 'Muestra u oculta el panel del equipo de agentes',
  'command.hidden': 'Panel {title} oculto, también en las próximas sesiones. /agent-team lo vuelve a mostrar.',
  'command.shown': 'Panel {title} abierto.',
  'command.failed': 'No se pudo mostrar u ocultar el panel del equipo de agentes.',

  'api.rate_limit': 'la API cortó el turno: límite de uso alcanzado',
  'api.overloaded': 'la API cortó el turno: servidores saturados, prueba en un rato',
  'api.server_error': 'la API cortó el turno: error del servidor',
  'api.authentication_failed': 'la API cortó el turno: vuelve a iniciar sesión',
  'api.oauth_org_not_allowed': 'la API cortó el turno: tu organización no permite esta cuenta',
  'api.billing_error': 'la API cortó el turno: problema de facturación',
  'api.invalid_request': 'la API cortó el turno: petición no válida',
  'api.model_not_found': 'la API cortó el turno: modelo no disponible',
  'api.max_output_tokens': 'la respuesta se cortó por larga',
  'api.cut': 'la API cortó el turno ({kind})',

  'warn.brief': 'encargo sin {missing}: el agente tendrá que adivinar o explorar',
  'warn.brief.and': ' ni ',
  'warn.repeat': 'parecido al encargo de hace {minutes} min: continuar ese agente con SendMessage costaba menos',
  'warn.review.one': 'revisión con Opus de un cambio de {n} línea: para algo así no hacía falta',
  'warn.review.other': 'revisión con Opus de un cambio de {n} líneas: para algo así no hacía falta',
  'warn.rounds': '{n} rondas: Claude debería parar y preguntarte',

  // el registro de sesión
  'runs.heading': '{date} · {folder}',
  'runs.branch': 'rama {branch}',
  'runs.agent': '{role} ({model}): {task}',
  'runs.status': 'estado: {status}',
  'runs.time': 'tiempo: {time}',
  'runs.rounds': 'rondas: {n}',
  'runs.tokens': 'tokens: {input} entrada / {output} salida',
  'runs.warn': 'aviso: {warn}',

  'git.detached': 'HEAD suelto',
  'git.missing': 'git no está instalado o no respondió',
  'git.failed': 'git falló',
  'git.looking': 'Mirando el repositorio…',
  'git.none': 'Esta carpeta no es un repositorio git.',
  'git.error': 'git: {error}',
  'git.noAnswer': 'no respondió',
  'git.dirty': '{n} sin commit',
  'git.reviewRequested.one': 'Te piden revisión en {n} PR',
  'git.reviewRequested.other': 'Te piden revisión en {n} PR',
  'git.mine.one': 'tienes {n} PR abierta',
  'git.mine.other': 'tienes {n} PR abiertas',
  'gh.missing': 'gh no está instalado o no respondió',
  'gh.noSession': 'gh no tiene sesión: ejecuta gh auth login',
  'gh.offline': 'GitHub no responde (¿sin conexión?)',
  'gh.noAnswer': 'gh no respondió',
  'ci.failed.one': 'CI ✗ en #{number}: 1 check falla',
  'ci.failed.other': 'CI ✗ en #{number}: {n} checks fallan',
  'ci.passed.one': 'CI ✓ en #{number}: {n} check en verde',
  'ci.passed.other': 'CI ✓ en #{number}: {n} checks en verde',
  'ci.run': 'CI {mark} {name} en {branch}',
  'ci.branch': 'la rama',
  'op.commit': '{verb} {sha}',
  'op.commitOn': '{verb} {sha} en {branch}',
  'op.push': 'push a {branch}',
  'op.merge': 'merge de {ref}',
  'op.rebase': 'rebase de {ref}',
  'op.pr': 'PR #{number} {action}',
  'pr.created': 'creada',
  'pr.edited': 'editada',
  'pr.merged': 'fusionada',
  'pr.commented': 'comentada',
  'pr.closed': 'cerrada',
  'pr.reopened': 'reabierta',
  'pr.ready': 'lista para revisar',
  'pr.draft': 'pasada a borrador',
  'pr.autoMergeEnabled': 'con auto-merge',
  'pr.autoMergeDisabled': 'sin auto-merge',
  'review.approved': 'aprobada',
  'review.changes': 'piden cambios',
  'review.required': 'falta revisión',
  'run.running': 'en curso',
  'run.passed': 'pasó',
  'run.cancelled': 'cancelada',
  'run.skipped': 'omitida',
  'run.failed': 'falló',
  'link.branch': 'Rama',
  'link.newPr': 'Crear PR',
  'link.whatFailed': 'ver qué falló',
  'link.view': 'ver',
  'link.open': 'abrir',

  'job.install': 'instalación',
  'job.build': 'build',
  'job.download': 'descarga',
  'job.more': '{shown} y {n} más',
  'job.target.project': 'dependencias del proyecto',
  'job.target.packages': 'paquetes',
  'job.target.crates': 'crates',
  'job.target.modules': 'módulos',
  'job.target.nuget': 'paquetes NuGet',
  'job.target.image': 'imagen',
  'job.target.repository': 'repositorio',
  'job.target.download': 'descarga',
  'job.target.file': 'fichero',
  'jobs.empty': 'Nada en marcha.',
  'chip.jobs': '{n} en marcha',
  'chip.eta': '5h al 100% a las {time}',
  'chip.noFigures': 'Sin cifras todavía',
  'compact.button': 'Compactar contexto ({percent})',

  'tab.team': 'Equipo',
  'tab.skills': 'Skills',
  'tab.jobs': 'Procesos',
  'tab.github': 'GitHub',
  'card.team': 'Equipo',
  'card.skills': 'Skills',
  'card.jobs': 'Instalaciones y procesos',
  'card.github': 'GitHub',
  'plate.team': 'EQUIPO',
  'plate.skills': 'SKILLS',
  'plate.jobs': 'PROCESOS',
  'plate.github': 'GITHUB',
  'tab.usage': 'Uso',
  'card.usage': 'Uso',
  'plate.usage': 'USO',
  'usage.none': 'Aún no hay nada contado: las cifras llegan con el primer turno.',
  'usage.tokens': 'Tokens',
  'usage.tokens.line': '{input} entrada · {output} salida',
  'usage.cache': '{percent} leído de la caché',
  'usage.compactions.one': '{n} compactación',
  'usage.compactions.other': '{n} compactaciones',
  'usage.context': 'Contexto ahora',
  'usage.context.size': 'desglose: {used} de {window}',
  'usage.context.waiting': 'El desglose del contexto llega al terminar un turno.',
  'usage.free': 'Espacio libre',
  'usage.buffer': 'Reserva de compactación',
  'usage.skills': 'Skills por plugin',
  'usage.mcp': 'Herramientas MCP por servidor',
  'usage.mcp.deferred': '{n} más sin cargar aún',
  'usage.memory': 'Archivos de memoria',
  'usage.agents': 'Agentes propios',
  'usage.more': '+{n} más',
  'usage.spend': 'Dónde se gasta',
  'usage.tools': 'Resultados de herramientas (estimado)',
  'usage.turns': 'Turnos con más tokens',
  'usage.turn': 'Turno {n}',

  'main.thinking': 'pensando',
  'main.idle': 'en reposo',
  'main.working.one': '{n} herramienta · ahora {doing}',
  'main.working.other': '{n} herramientas · ahora {doing}',
  'main.waiting': 'esperándote',
  'main.lastTurn': 'último turno: {tokens}',
  'main.sessionTokens': 'tokens nuevos de la sesión: {tokens}',
  'main.notice': 'aviso · {notice}',
  'agent.tools.one': '{n} herramienta',
  'agent.tools.other': '{n} herramientas',
  'agent.tokens': 'tokens: {line}',
  'agent.end': 'final: {note}',
  'agent.report': 'su informe',
  'agent.view': 'Ver su conversación',
  'agent.copy': 'Copiar informe',
  'delegate.on': 'Delegar: sí',
  'delegate.off': 'Delegar: no',
  'delegate.hintOn': 'según tus reglas; un cambio vale en la próxima conversación',
  'delegate.hintOff': 'solo si se lo pides; un cambio vale en la próxima conversación',
  'models.title': 'Modelos',
  'models.hint': 'un cambio vale desde el próximo agente; el modelo que Claude pida para una tarea manda',
  'models.default': 'por defecto',
  'models.modelOf': 'modelo de {role}: {value}',
  'models.effortOf': 'esfuerzo de {role}: {value}',
  'models.reset': 'Restablecer',
  'models.costly': 'Opus, xhigh y max gastan más del límite de 5 horas y del semanal',

  'back': '← Volver',
  'edit': '✎ Editar',
  'skills.noPlugin': 'sin plugin',
  'skill.missing': 'No está instalada en esta sesión: no se envía.',
  'pick.none': 'No encuentro skills ni comandos en esta sesión.',
  'pick.plugin': 'Elige de qué plugin es la skill.',
  'pick.pluginNow': 'Ahora: {current}. Elige de qué plugin es la nueva.',
  'pick.clear': 'Vaciar hueco',
  'pick.page': '{page} de {pages}',
  'pick.slot': 'Hueco {n}',
  'pick.packSlot': '{name} · hueco {n}',
  'loose.head': 'Skills sueltas: van enteras en cada consulta.',
  'loose.hintEdit': 'Pulsa un hueco para cambiar su skill.',
  'loose.hintPicked': 'Van en cada consulta hasta que las desmarques.',
  'loose.hintEmpty': 'Pulsa ＋ para poner una skill en un hueco.',
  'loose.hintPick': 'Pulsa una para que vaya en tus consultas.',
  'packs.back': '← Packs',
  'packs.loose': 'Skills sueltas',
  'packs.hintEdit': 'Pulsa un pack para renombrarlo o cambiar sus skills.',
  'packs.hintPicked': 'Claude carga solo las skills que pida cada consulta.',
  'packs.hintEmpty': 'Pulsa ＋ para crear un pack.',
  'packs.hintPick': 'Pulsa un pack para que vaya en tus consultas.',
  'pack.unnamed': 'Pack sin nombre',
  'pack.short': 'pack',
  'pack.skills.one': '{n} skill',
  'pack.skills.other': '{n} skills',
  'pack.emptyTip': 'Vacío: pulsa ✎ Editar y ábrelo para llenarlo.',
  'pack.missing.one': '{n} no instalada',
  'pack.missing.other': '{n} no instaladas',
  'pack.nameLabel': 'Nombre',
  'pack.namePlaceholder': 'Nombre del pack (hasta {max})',
  'pack.save': 'guardar',
  'pack.picked': '● Marcado',
  'pack.pick': 'Marcar pack',
  'pack.confirmDelete': '¿Seguro? Pulsa otra vez',
  'pack.delete': 'Borrar pack',

  'command.usage': '/agent-team muestra u oculta el panel; /agent-team rules añade o actualiza las reglas del equipo en tu CLAUDE.md; /agent-team rules off las quita.',
  'rules.created': 'Reglas del equipo escritas en {path} (el fichero no existía).',
  'rules.appended': 'Reglas del equipo añadidas al final de {path}. Queda una copia del fichero anterior a su lado: {backup}.',
  'rules.replaced': 'Reglas del equipo de {path} actualizadas. Queda una copia del fichero anterior a su lado: {backup}.',
  'rules.current': 'Las reglas del equipo de {path} ya están al día.',
  'rules.removed': 'Reglas del equipo quitadas de {path}; el resto del fichero queda como estaba. Queda una copia del fichero anterior a su lado: {backup}.',
  'rules.none': 'No hay reglas del equipo en {path}: nada que quitar.',
  'rules.malformed': 'Las marcas de las reglas del equipo en {path} están mal ({why}): no he cambiado nada. Arréglalas o bórralas a mano y vuelve a ejecutar el comando.',
  'rules.why.noEnd': 'la marca de inicio no tiene marca de fin',
  'rules.why.noStart': 'la marca de fin no tiene marca de inicio',
  'rules.why.duplicated': 'una marca aparece más de una vez',
  'rules.why.reversed': 'la marca de fin va antes que la de inicio',
  'rules.failed': 'No se pudo leer o escribir {path}: {reason}. No se cambió nada.',
  'rules.failedAfterBackup': 'No se pudo escribir {path}: {reason}. Puede que siga como estaba; queda una copia en {backup}.',
  'rules.replacedEdited': 'Reglas del equipo de {path} sustituidas. El bloque que había era distinto de los que trae el plugin (editado por ti o de una versión anterior): queda una copia del fichero anterior a su lado: {backup}.',
  'rules.legacy': 'Ya hay unas reglas del equipo en {path} sin las marcas (línea {line}: {heading}), seguramente de una versión anterior. Si añadiera las nuevas tendrías las dos, así que no he cambiado nada: quítala primero y vuelve a ejecutar el comando.',
  'rules.marker': 'Hay una marca de inicio de las reglas del equipo en {path}, pero no encuentro un bloque que pueda sustituir: no he cambiado nada. Arregla o borra esa línea y vuelve a ejecutar el comando.',
  'rules.notUtf8': '{path} no está guardado en UTF-8: no he cambiado nada, para no estropear sus caracteres.',
  'rules.typed': 'Las reglas del equipo de tu CLAUDE.md solo se cambian con un comando que escribas tú mismo en el prompt.',
  'rules.noPlace': 'No sé dónde está tu CLAUDE.md: no hay CLAUDE_CONFIG_DIR, HOME ni USERPROFILE.',
  'update.available': 'agent-team {version} disponible',
  'update.hint': 'claude plugin marketplace update agent-team-kit · claude plugin update agent-team@agent-team-kit · /reload-plugins',
  'update.toast': 'agent-team {version} está disponible: ejecuta `claude plugin marketplace update agent-team-kit` y `claude plugin update agent-team@agent-team-kit`, y luego /reload-plugins',
}

/** Both tables, for the tests that hold them to each other. */
export const CATALOG: Readonly<Record<Lang, Readonly<Record<Key, string>>>> = { en, es }
const TABLES = CATALOG

/** How many texts the catalog holds, per language: the two tables share their keys. */
export const CATALOG_SIZE = Object.keys(en).length

/**
 * The language the pane speaks. Set once per load, from the options (and, with
 * `auto`, from the environment at session start): never changes under a draw.
 */
export let lang: Lang = 'en'

/** Whether the language is settled: the option named one, or the system's was looked up. */
let isSettled = false

/** Sets the language the pane's texts use. */
export function setLanguage(next: Lang): void {
  lang = next
}

/**
 * Starts a load of the module from the `language` option: an `en` or `es` is
 * settled at once; with `auto` English stands until `settleLanguage` has the
 * engine to ask the system with.
 */
export function beginLanguage(option: unknown): void {
  const chosen = explicitLanguage(option)
  lang = chosen ?? 'en'
  isSettled = chosen !== undefined
}

/** A text of the catalog in the current language, its `{name}` slots filled from `params`. */
export const t = (key: Key, params?: Readonly<Record<string, string | number>>): string => {
  const text = TABLES[lang][key]

  return params === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

/** A text by count: `one` for 1, `other` for the rest; `{n}` is the count. */
export const tn = (n: number, one: Key, other: Key, params?: Readonly<Record<string, string | number>>): string =>
  t(n === 1 ? one : other, { ...params, n })

// ------------------------------------------------------------ choosing the language

/** The `language` option when it names a language: `en` or `es`; `auto` and anything else leave it to the system. */
export const explicitLanguage = (option: unknown): Lang | undefined => (option === 'en' || option === 'es' ? option : undefined)

/** A locale name (`es_ES.UTF-8`, `es-MX`, `es:en`) as a language: `es...` is Spanish, anything else English. */
export const languageOf = (locale: string): Lang => (/^es($|[^a-z])/i.test(locale.trim()) ? 'es' : 'en')

/**
 * The language the system speaks: the first of the environment variables that
 * is set (in the order given), else the runtime's own locale when it has one,
 * else English. A list such as LANGUAGE=es:en counts by its first entry.
 */
export const systemLanguage = (variables: readonly (string | undefined)[], runtimeLocale: string | undefined): Lang => {
  const set = variables.find(v => v !== undefined && v.trim() !== '')
  if (set !== undefined) return languageOf(set)

  return runtimeLocale === undefined || runtimeLocale.trim() === '' ? 'en' : languageOf(runtimeLocale)
}

/** The locale the runtime reports through Intl, or undefined where Intl is missing or fails. */
export const runtimeLocale = (): string | undefined => {
  try {
    return typeof Intl === 'undefined' ? undefined : Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}

/**
 * The language to speak: the option when it is `en` or `es`; with `auto` the
 * system's, read from LC_ALL, LC_MESSAGES, LANG and LANGUAGE through `$.env`
 * and, when none is set, from Intl.
 */
// A function declaration, not an arrow: the engine follows `$` across an
// import only into a declaration.
export async function resolveLanguage($: EngineInterface, option: unknown): Promise<Lang> {
  const chosen = explicitLanguage(option)
  if (chosen !== undefined) return chosen
  const variables = [
    await $.env.get('LC_ALL').catch(() => undefined),
    await $.env.get('LC_MESSAGES').catch(() => undefined),
    await $.env.get('LANG').catch(() => undefined),
    await $.env.get('LANGUAGE').catch(() => undefined),
  ]

  return systemLanguage(variables, runtimeLocale())
}

/**
 * Settles the language from the option and, with `auto`, the system, unless it
 * already is. Called by the first hook that has the engine: a hot reload runs
 * `register` again but not `session.start`, so the start cannot be the only
 * place that looks. A session start passes `isAgain` to look afresh.
 */
// A function declaration, not an arrow: the engine follows `$` across an
// import only into a declaration.
export async function settleLanguage($: EngineInterface, option: unknown, isAgain = false): Promise<void> {
  if (isSettled && !isAgain) return
  lang = await resolveLanguage($, option)
  isSettled = true
}
