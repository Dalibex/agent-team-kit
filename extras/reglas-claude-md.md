# Reglas de reparto del equipo

Tener los agentes no basta: Claude solo los usa si sus instrucciones se lo
piden. Estas reglas le dicen cuándo mandar trabajo a cada uno, cómo escribir
el encargo para que el agente entienda qué se construye y por qué, cómo
resolver sus dudas sin perder lo que ya sabe y cómo gastar lo justo.

Desde la 0.8.0 los cuatro agentes vienen dentro del plugin
(`agent-team:explorer`, `agent-team:implementer`, `agent-team:tester` y
`agent-team:reviewer`), y el plugin hace dos cosas que estas reglas dan por
hechas:

- Añade al final de cada encargo un bloque `<team-context>` con la carpeta del
  proyecto, la rama y las skills que tienes marcadas en el panel, para que el
  agente cargue las que le sirvan.
- Cambia la descripción de la herramienta Agent, que de serie le dice a Claude
  que no delegue si no se lo pides, por un párrafo que remite a estas reglas.
  El botón «Delegar» de la pestaña Equipo lo desactiva (vale para las sesiones
  nuevas).

El instalador puede añadirlas por ti a tu `~/.claude/CLAUDE.md` (te lo
pregunta, o con `-Reglas` / `--reglas`). Las pone entre las marcas
`<!-- agent-team:reglas:inicio -->` y `<!-- agent-team:reglas:fin -->` para
poder sustituirlas al actualizar y quitarlas al desinstalar sin tocar el resto
del fichero. Si prefieres hacerlo a mano, copia el bloque de abajo al final de
tu `CLAUDE.md`, entre esas dos marcas si quieres que el instalador lo
reconozca, y cámbialo a tu gusto.

El aviso del panel que salta cuando Claude lee más de cinco ficheros sin el
explorer viene de la primera regla.

```markdown
## Agent team

I have a team of agents from the agent-team plugin: `agent-team:explorer`
(Haiku, read-only search), `agent-team:implementer` (Sonnet, makes agreed
changes and verifies them), `agent-team:tester` (Sonnet, writes and runs
tests, touches only test files) and `agent-team:reviewer` (Opus, reviews
without editing). You lead them: you plan, brief them, check their work and
decide with me. Delegate as these rules say without asking me first; the
decisions stay mine.

### When to delegate

- **explorer**: when an answer needs reading more than five files, or a
  search in code you have not read this session. Work from its report: do not
  reread the files it cited unless you are about to edit them.
- **implementer**: once a change is agreed (a plan step, a fix I approved)
  and it takes more than a couple of edits. Small edits you make yourself.
- **tester**: after a non-trivial change, to cover it and run the suite. A bug
  it finds in production code is reported to me, and the fix is decided with
  me.
- **reviewer**: before proposing a commit of a non-trivial change. Skip it for
  trivial or mechanical diffs (renames, formatting, typos in docs): it is the
  costliest member.
- Run independent agents in parallel, for example the tester and the reviewer
  on the same finished change. Never two agents editing the same files.
- Don't delegate when it costs more than doing it yourself, and never delegate
  a decision that is mine.

### Briefs

An agent does not see our conversation, so every brief carries what it needs,
under these headings:

- **Goal**: what to achieve, in one or two sentences.
- **Why**: what it is for, and the decision behind it (what we chose and what
  we ruled out).
- **Files**: paths with line ranges to start from, taken from what you or the
  explorer already read, so the agent does not explore again.
- **Done when**: the observable result and the check to run.
- **Limits**: what not to touch; never commit or push.

The plugin adds a `<team-context>` block with the project, its branch and the
skills I have picked in the pane. Name in the brief the ones that matter for
the task.

### Questions and follow-ups

- An agent that lacks something stops and answers with `PREGUNTAS:`. Answer
  what you can by continuing that same agent with SendMessage: it keeps its
  context, which costs far less than a new spawn. What is mine to decide, ask
  me, then continue the agent with my answer.
- To fix or extend an agent's own work, continue it with SendMessage instead
  of spawning a new one.

### Checking their work

- Check what each agent returns (its diff, its test output) before accepting
  it. A report without the command's output is not verified.
- Tell me in one line what each agent did.
```
