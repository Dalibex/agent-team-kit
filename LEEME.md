# agent-team · el panel del equipo de agentes para Claude Code

**Versión 0.8.4** · [Novedades](CHANGELOG.md)

Un panel lateral para Claude Code que dibuja a Claude y a sus agentes como
muñecos de píxeles. Cuando Claude le manda un encargo a un agente, ese agente
se despierta y se pone a trabajar en el dibujo; al acabar suelta confeti y
suena un aviso, cada uno con su sonido.

El panel trae también el equipo en sí: cuatro agentes (explorer, implementer,
tester y reviewer) que reciben con cada encargo el proyecto, la rama y las
skills que tengas marcadas, y que preguntan cuando les falta algo. Y reúne en
un solo sitio, en pestañas, lo que normalmente tendrías que ir a buscar: tus
límites de uso, lo que gasta cada agente, lo que se está instalando o
compilando, el estado de tu repositorio en GitHub y tus packs de skills.

Está pensado para la app de escritorio de Claude Code (la pestaña Code).
También funciona en la terminal, con una versión en texto.

## Qué muestra

- **El equipo**: Claude arriba y sus agentes debajo (explorer, implementer,
  tester y reviewer), con letras de píxeles de neón y estrellas. Cada agente
  duerme hasta que recibe un encargo.
- **Tus límites**, a la derecha del equipo: la ventana de 5 horas y la
  semanal, con la hora a la que se reinician, y el contexto de la sesión
  (por ejemplo `62K/1M`). Se ponen ámbar al 80 % y rojo al 95 %, y te avisa
  una vez al cruzar cada umbral. Si al ritmo de la última hora y media vas a
  llenar la ventana de 5 horas antes de que se reinicie, te dice a qué hora.
- Debajo, una fila de **pestañas**. Se ve una cada vez, y el botón de una
  pestaña que no estás mirando avisa de lo que pasa en ella (`Equipo ●2`,
  `Skills ✦3`, `Procesos ⟳1`, `GitHub ✗`). La pestaña abierta se recuerda.
  - **Equipo**: la fila de Claude, lo que lleva gastado cada papel en la
    sesión y la parte del equipo, y una línea por agente (trabajando, o la tarea que hizo, con su
    tiempo y su modelo), y debajo, las skills que cargó con `✦`. Al
    desplegarla ves el encargo, los tokens y el informe, y puedes abrir su conversación o copiar el informe. La fila
    avisa cuando un encargo gasta de más (ver «Que el equipo trabaje»).
  - **Skills**: doce huecos de pack. Un pack lleva el nombre que le escribas
    y veinticuatro skills; al marcarlo, Claude carga de ellas solo las que pida cada
    consulta. El botón «Skills sueltas» lleva a los ocho huecos de siempre,
    que se cargan enteros en cada consulta. Lo marcado se recuerda entre
    sesiones, por proyecto.
  - **Procesos**: lo que instalas (npm, pip, winget…), compilas o pruebas
    (maven, gradle, npm test, docker…) y descargas, con su tiempo y, en
    segundo plano, su porcentaje real.
  - **GitHub**: la rama, los cambios sin commit, la PR de la rama con sus
    checks (y un enlace directo al que falla), las PR que esperan tu revisión
    y enlaces al repositorio, las issues, las PR y Actions.
- **Avisos**: cuando termina el CI que estaba en marcha, cuando algo largo
  acaba (notificación del sistema) y cuando la API corta un turno, con el
  motivo.

El panel no llama a ningún modelo, así que no gasta tokens.

## Qué trae

| | |
| --- | --- |
| `instalar-windows.cmd`, `desinstalar-windows.cmd` | Windows, con doble clic. |
| `instalar-linux.sh`, `desinstalar-linux.sh` | Linux. En macOS vale el mismo instalador de Linux. Necesitan Python 3.7 o más nuevo. |
| `plugin/` | El panel y sus cuatro agentes (un *marketplace* local con el plugin `agent-team`). |
| `extras/reglas-claude-md.md` | Reglas para que Claude reparta el trabajo entre los agentes. |
| `scripts/` | Lo que ejecutan los instaladores. |
| `CHANGELOG.md` | Qué cambia en cada versión. |

Los agentes, que Claude ve como `agent-team:<nombre>`:

- `explorer` (Haiku): busca y lee código, nunca edita.
- `implementer` (Sonnet): hace cambios ya decididos y los comprueba.
- `tester` (Sonnet): escribe y pasa tests, sin tocar el código de producción.
- `reviewer` (Opus): revisa los cambios y explica cada fallo que encuentra.

## Requisitos

- Claude Code con soporte de plugins (la app de escritorio, o la CLI). El kit
  se ha probado con Claude Code 2.1.32x.
- Windows 10 u 11 (usa Windows PowerShell, que ya viene instalado), o macOS o
  Linux con Python 3.7 o más nuevo.
- Opcional, para la pestaña de GitHub: [GitHub CLI](https://cli.github.com/)
  (`gh`) con la sesión iniciada (`gh auth login`). Sin él, la pestaña muestra
  igualmente el estado local de git.

## Instalación en Windows

1. Descomprime el zip entero en cualquier carpeta.
2. Haz doble clic en `instalar-windows.cmd`. Si Windows te pide confirmación porque
   el fichero viene de internet, dale a ejecutar.
3. Te pregunta dos cosas:
   - El nombre del equipo. Si escribes «Ana», el panel se titula «ANA TEAM».
     Pulsa Enter sin escribir nada y se queda en «AGENT TEAM».
   - Si quieres añadir las reglas de reparto a tu `CLAUDE.md`, para que Claude
     trabaje con el equipo (ver [Que el equipo trabaje](#que-el-equipo-trabaje)).
4. Abre una sesión nueva en Claude Code, o escribe `/reload-plugins` en una
   que ya tengas abierta. El panel sale a un lado con el equipo dormido.

Para probarlo, pídele a Claude algo como «usa el explorer para listarme los
ficheros de esta carpeta» y mira cómo se despierta.

Sin preguntas, desde una consola (el `.cmd` también acepta `-Sin`):

```
instalar-windows.cmd -Nombre Ana -Reglas -SinPreguntas
```

Con `-SinPreguntas`, las reglas de `CLAUDE.md` solo se tocan si das `-Reglas`, y
las que hayas cambiado tú o las que tengas sin las marcas del kit no se
sustituyen.

## Instalación en Linux o macOS

Abre una terminal en la carpeta del kit y ejecuta (en macOS vale el mismo
instalador de Linux):

```bash
sh instalar-linux.sh
```

Hace las mismas preguntas que en Windows. Sin preguntas:
`sh instalar-linux.sh --nombre Ana --reglas --sin-preguntas`.

## Actualizar desde una versión anterior

Ejecuta el instalador de la versión nueva igual que la primera vez. Si pegaste
a mano las reglas de la versión 0.2.0 en tu `CLAUDE.md` (la sección «Delegation
to agents»), quítalas antes: el instalador no las toca, y con las nuevas
tendrías dos secciones que se contradicen. Sustituye el panel y conserva lo
demás:

- El nombre del equipo: Enter lo deja como estaba; un guion (`-`) lo quita.
- Los agentes que puso una versión anterior en `agents/` se retiran, porque
  ahora vienen en el panel (se guarda una copia). Los que hayas cambiado tú no
  se tocan, y el instalador te avisa de que Claude verá los dos.
- Las reglas de `CLAUDE.md` se ponen al día si las puso el kit; si las
  cambiaste, te pregunta antes de sustituirlas.
- Tus ocho huecos de skills pasan a ser las «Skills sueltas», tal cual.

## Registro en Claude Code

En la primera instalación y en cada actualización, si el comando `claude` está
disponible (Claude Code 2 o más nuevo), el instalador avisa a Claude Code en
ese momento, para que la versión nueva se use sin esperar a su caché, y
comprueba que la versión registrada es la del kit. Si no está, Claude Code lo
registra al abrir una sesión nueva.

## Qué cambia en tu ordenador

Todo queda dentro de tu carpeta de Claude (`~/.claude`; en Windows,
`C:\Users\<tú>\.claude`):

| Dónde | Qué |
| --- | --- |
| `agent-team-kit/` | El panel con sus agentes y `instalacion.json`, el registro de lo que instaló el kit. |
| `settings.json` | La entrada del marketplace (dónde está el panel), la que lo activa y, si ya existía, el nombre del equipo en `pluginConfigs`. Antes de tocarlo se guarda una copia. |
| `agents/` | Nada nuevo. Al actualizar se retiran los agentes que puso una versión anterior del kit y siguen sin cambios. |
| `CLAUDE.md` | Las reglas de reparto, solo si dijiste que sí, entre las marcas `<!-- agent-team:reglas:inicio -->` y `<!-- agent-team:reglas:fin -->`. El resto del fichero no se toca, y antes se guarda una copia. |
| `agent-team-kit-copias/` | Las copias de tus ficheros, por fecha. |
| `plugins/` | Los registros que Claude Code guarda de sus plugins (`installed_plugins.json`, `known_marketplaces.json`), que el instalador actualiza con el comando `claude` cuando puede, y la memoria del panel (packs, huecos, lo marcado por proyecto, la pestaña abierta). |

## Uso

- `/agent-team` oculta el panel o lo vuelve a mostrar, y se acuerda de tu
  elección en las siguientes sesiones.
- **Packs**: en la pestaña Skills, pulsa un hueco vacío (＋) para crear un
  pack: se abre para que escribas su nombre (se guarda mientras escribes) y
  llenes sus huecos, cada uno con el selector de skills (primero el plugin,
  después la skill). «← Packs» vuelve. Pulsa un pack para marcarlo o
  desmarcarlo; con «✎ Editar», para abrirlo y cambiarlo o borrarlo (borrar
  pide pulsar dos veces). Con el panel enfocado, las teclas 1 a 9 pulsan los
  nueve primeros.
- **Skills sueltas**: el botón del mismo nombre lleva a los ocho huecos de
  siempre; un hueco vacío elige skill, uno lleno se marca o se desmarca,
  «✎ Editar» los cambia y las teclas 1 a 8 los pulsan.
- Lo marcado va en cada consulta tuya hasta que lo desmarques, y se recuerda
  en las próximas sesiones del mismo proyecto. Una skill que ya no está
  instalada sale con ⚠ y no se envía.
- **Delegar**: el botón al pie de la pestaña Equipo quita o vuelve a poner el
  párrafo del equipo en la herramienta Agent (ver abajo). El cambio vale
  desde la próxima conversación.
- **Compactar contexto**: cuando el contexto pasa del 80 %, aparece un botón
  bajo el dibujo que hace lo mismo que `/compact`.
- Pasa el ratón por los límites, por un pack o por un hueco de skill para ver
  el detalle.

## Que el equipo trabaje

Claude solo manda trabajo a los agentes si sus instrucciones se lo piden, y de
serie la herramienta Agent le dice que no delegue si no se lo pides tú. El
panel cambia ese párrafo por uno que presenta al equipo, y las reglas de
reparto (`extras/reglas-claude-md.md`) dicen cuándo usar a cada uno:

- el **explorer** lee y busca en vez de Claude cuando hay más de cinco
  ficheros que mirar, y Claude trabaja con su informe sin releerlos;
- el **implementer** hace los cambios ya acordados que no son un par de
  ediciones;
- el **tester** cubre y prueba los cambios que no son triviales;
- el **reviewer** revisa el diff antes de proponer un commit, solo si el
  cambio no es trivial (va con Opus, el modelo más caro);
- los que no dependen entre sí trabajan a la vez, y Claude revisa lo que
  devuelve cada uno antes de dártelo por bueno.

Cada encargo sigue una plantilla (Goal, Why, Files, Done when, Limits) y el
panel le añade al final la carpeta del proyecto, la rama y tus skills
marcadas, de las que el agente carga solo las que le sirvan. Si a un agente le
falta algo, para y devuelve sus `PREGUNTAS:`; Claude le contesta
continuándolo con SendMessage (conserva lo que ya leyó, que cuesta mucho
menos que lanzar otro) o te pregunta a ti si la decisión es tuya.

Para gastar lo justo, la fila de un agente avisa cuando su encargo no tiene
Goal ni Why, cuando repite uno reciente que podía haberse continuado, y cuando
el reviewer revisa un cambio de diez líneas o menos. La fila de Claude avisa
si lee más de cinco ficheros en un turno sin el explorer.

Las decisiones siguen siendo tuyas: los agentes no hacen commits ni deciden
el diseño. El instalador añade las reglas a tu `CLAUDE.md` si se lo dices, y
las actualiza o las quita contigo.

## Desinstalar

1. Cierra Claude Code.
2. Haz doble clic en `desinstalar-windows.cmd` (en Linux o macOS,
   `sh desinstalar-linux.sh`) y confirma.

Quita la carpeta del panel (con sus agentes), sus entradas de
`settings.json`, los registros que Claude Code guarda del plugin, la memoria
del panel y el bloque de reglas de tu `CLAUDE.md` (lo demás del fichero se
queda; si el fichero solo tenía las reglas, se borra). También borra los
agentes que una versión anterior dejó en `agents/`. Los agentes y el bloque de
reglas que hayas cambiado después de instalarlos se quedan y te avisa.
La carpeta `agent-team-kit-copias/` no se borra porque tiene las copias
de tus ficheros (incluida la memoria del panel); cuando veas que todo va bien,
puedes borrarla tú.

## Si algo falla

- **No sale el panel**: abre una sesión nueva. Si sigue sin salir, mira en
  `settings.json` que esté `"agent-team@agent-team-kit": true` dentro de
  `enabledPlugins`.
- **Sale la versión anterior**, o el instalador dice que Claude Code lo tiene
  registrado en otra versión: ejecuta `claude plugin update
  agent-team@agent-team-kit` y abre una sesión nueva.
- **Salen dos paneles**: ya tenías otra copia de agent-team activada. El
  instalador te avisa de cuál es; quítala de `enabledPlugins`.
- **El instalador dice que un `.json` de Claude (como `settings.json`) no es
  JSON válido o no contiene un objeto**: no ha cambiado nada. Arregla el
  fichero, o renómbralo para empezar con uno vacío, y vuelve a ejecutarlo.
- **El instalador dice que Windows PowerShell no sabe leer un `.json`** que es
  válido, por ejemplo con claves que solo se diferencian en mayúsculas
  (`HTTP_PROXY` y `http_proxy`): es un límite de Windows PowerShell. No ha
  cambiado nada. Usa el instalador de Python si lo tienes
  (`python scripts\kit.py instalar`), o cambia una de esas claves un momento
  y devuélvela a su sitio después.
- **El instalador dice que no ha tocado tu `CLAUDE.md`** porque no está
  guardado en UTF-8 (por ejemplo, un fichero creado con `>` u `Out-File` en
  Windows PowerShell, que lo guardan en UTF-16): ábrelo y guárdalo como UTF-8.
  También lo deja si tiene solo una de las dos marcas de las reglas, o están
  repetidas o al revés: déjalas como `<!-- agent-team:reglas:inicio -->` y
  `<!-- agent-team:reglas:fin -->`, una vez cada una y en ese orden, y vuelve a
  ejecutarlo. Las marcas dentro de un bloque de código no cuentan.
- **El instalador dice que tu `CLAUDE.md` ya tiene unas reglas del equipo sin
  las marcas del kit**: suelen ser las de la versión 0.2.0 (la sección
  «Delegation to agents»). Quita esa sección y vuelve a ejecutar el instalador;
  si las dejas, tendrás dos grupos de reglas que se contradicen.
- **El instalador dice que ya tienes un marketplace `agent-team-kit` de otra
  fuente**: lo instalaste desde GitHub. Se detiene sin escribir nada para no
  pisarlo; mira «Instalar desde GitHub» para quitar uno de los dos. Si
  desinstalas con el kit mientras tienes el de GitHub, solo quita lo del kit y
  no toca los registros del otro.
- **La pestaña GitHub dice que `gh` no responde**: instala GitHub CLI y
  ejecuta `gh auth login`.

## Instalar desde GitHub

Si este kit está publicado en un repositorio de GitHub, también se puede
instalar sin descargar el zip, desde Claude Code:

```
/plugin marketplace add <usuario>/<repositorio>
/plugin install agent-team@agent-team-kit
```

Así vienen el panel y sus agentes, pero no las reglas ni la pregunta del
nombre (se pone con `/plugin configure agent-team@agent-team-kit`). Las dos formas usan el mismo
nombre de marketplace, `agent-team-kit`, así que no las mezcles; quita una
antes de usar la otra:

- Si ya lo instalaste con el kit y quieres pasar a GitHub: ejecuta
  `desinstalar-windows.cmd` (o `sh desinstalar-linux.sh`) y después los dos
  comandos de arriba.
- Si ya lo instalaste desde GitHub y quieres usar el kit: ejecuta
  `claude plugin uninstall agent-team@agent-team-kit` y
  `claude plugin marketplace remove agent-team-kit`, y después el instalador.

## Desarrollo

El código del panel está en `plugin/agent-team/`; su `README.md` explica cómo
está organizado. Los tests se pasan con:

```
claude plugin test plugin/agent-team
```

## Licencia

MIT. Consulta [LICENSE](LICENSE).
