# Novedades

Todas las versiones del kit agent-team. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones,
[Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

## [0.8.4] - 2026-11-18

### Arreglado
- El panel hace scroll con la rueda también con el ratón encima del dibujo.
  El dibujo se pintaba en un marco interactivo que se quedaba la rueda; ahora
  es una imagen (las animaciones siguen) y lo que decían sus tooltips sale en
  una tarjeta al pasar el ratón por encima.

## [0.8.3] - 2026-11-18

### Arreglado
- Con el panel estrecho ya no se sale nada por la derecha:
  - Las filas del equipo van en dos líneas: quién, su tiempo y la flecha
    arriba, y la tarea debajo.
  - El gasto de la sesión va en piezas que bajan de línea enteras.
  - El botón «Delegar» va delante de su explicación, que ahora se parte en
    líneas en vez de cortarse.
  - Procesos: la barra y el porcentaje van debajo del nombre y el tiempo.
  - GitHub: la rama y el botón ↻ arriba, los contadores debajo; el número de
    la PR y sus checks arriba, el título debajo; el check que falla, la
    última ejecución y la última operación de git se parten en líneas.
  - Skills: el botón «✎ Editar» va delante de su texto y el nombre del pack
    tiene una línea para él solo.

## [0.8.2] - 2026-11-18

### Añadido
- La pestaña Equipo dice qué skills ha cargado cada uno: bajo la fila de
  Claude, las de su turno (las del último mientras espera), y bajo la de cada
  agente, las de su encargo (`✦ urbanpulse-dev · debug`). Sin gastar tokens.

## [0.8.1] - 2026-11-18

### Cambiado
- Cada pack tiene 24 huecos de skills en vez de 12; los packs que ya tenías
  conservan sus skills y ganan los huecos nuevos vacíos.
- El selector de un pack marca con ✓ las skills que ya están en otro de sus
  huecos y no deja meterlas dos veces.

## [0.8.0] - 2026-11-18

### Añadido
- Pestañas bajo el dibujo: Equipo, Skills, Procesos y GitHub. Se ve una tarjeta
  cada vez; el botón de una pestaña oculta avisa de lo que pasa en ella
  (agentes trabajando, skills marcadas, procesos en marcha, CI). La pestaña
  abierta se recuerda entre sesiones.
- Packs de skills: doce huecos de pack, cada uno con el nombre que le escribas
  y doce huecos de skills. Marcar un pack ofrece sus skills a Claude, que
  carga solo las que pida cada consulta; las skills sueltas de siempre siguen
  detrás del botón «Skills sueltas» y se cargan enteras.
- Las skills y los packs marcados se recuerdan entre sesiones, por proyecto.
- Los cuatro agentes vienen dentro del plugin (`agent-team:explorer`,
  `agent-team:implementer`, `agent-team:tester`, `agent-team:reviewer`), con
  la herramienta Skill, su esfuerzo y un protocolo de dudas (`PREGUNTAS:`).
- Cada encargo a un agente del equipo lleva al final la carpeta del proyecto,
  su rama y las skills marcadas en el panel.
- La pestaña Equipo dice cuántos tokens lleva cada papel en la sesión y qué
  parte es del equipo, y marca en la fila del agente un encargo sin Goal ni
  Why, un encargo repetido que podía continuarse con SendMessage y una
  revisión con Opus de un cambio de diez líneas o menos.
- Botón «Delegar» en la pestaña Equipo: quita o vuelve a poner el párrafo del
  equipo en la herramienta Agent (desde la próxima conversación).

### Cambiado
- La descripción de la herramienta Agent, que de serie pide no delegar si no
  se lo pides, lleva en su lugar un párrafo que presenta al equipo y remite a
  tus reglas.
- Reglas de reparto reescritas: plantilla de encargo (Goal, Why, Files, Done
  when, Limits), dudas que se resuelven continuando al mismo agente, el
  reviewer solo para cambios no triviales.
- Las listas usan el alto del panel: el equipo enseña sus 16 filas y los
  procesos, 12.
- Una skill que ya no está instalada sale con ⚠ y no se envía.
- El instalador ya no copia agentes en `agents/`: retira los que puso una
  versión anterior y siguen sin cambios (con copia). `-Agentes` y
  `--agentes` se aceptan y no hacen nada.

### Quitado
- Plegar tarjetas: con las pestañas no tiene sentido.
- La carpeta `agentes/` del kit.

## [0.7.1] - 2026-11-14

### Añadido
- El instalador puede añadir las reglas de reparto a tu `CLAUDE.md` (en un
  bloque marcado que actualiza al reinstalar y el desinstalador quita), para
  que Claude trabaje de verdad con el equipo.

### Cambiado
- Reglas de reparto reescritas: el explorer, el implementer, el tester y el
  reviewer se usan sin esperar a un OK para el reparto; las decisiones siguen
  siendo tuyas.
- Los lanzadores de la raíz del kit llevan la plataforma en el nombre:
  `instalar-windows.cmd`, `desinstalar-windows.cmd`, `instalar-linux.sh` y
  `desinstalar-linux.sh` (en macOS vale el de Linux). Los `.cmd` no esperan una
  tecla con `-SinPreguntas` y devuelven el código de salida del script.
- Las reglas de `CLAUDE.md` se tratan como los agentes: el kit solo pone al día
  o quita el bloque que escribió; uno que hayas cambiado se queda (o te
  pregunta). Si hay reglas antiguas sin las marcas del kit, no añade las nuevas
  encima.
- Si ya hay un marketplace `agent-team-kit` instalado desde otra fuente (GitHub),
  el instalador se detiene sin escribir nada y dice cómo quitarlo; el
  desinstalador solo quita lo del kit (su carpeta, los agentes y las reglas) y
  no toca `enabledPlugins`, `pluginConfigs`, la memoria del panel ni los
  registros de Claude Code.
- Los instaladores de Windows y de Python se comportan igual con rutas con `&`,
  con `~/…`, con JSON que no es un objeto y con respuestas que no son s ni n.
- El nombre del equipo por defecto queda vacío («AGENT TEAM»); el instalador
  lo pregunta.
- Al actualizar, el instalador conserva el nombre anterior (Enter lo deja
  igual, un guion lo quita).
- Si el comando `claude` está disponible, el instalador registra o actualiza
  el plugin en ese momento y el desinstalador se lo quita igual.
  Después comprueba que Claude Code lo tiene en la versión del kit y, si no, te
  dice qué ejecutar. El desinstalador guarda las copias antes de llamar al
  comando `claude`.
- El desinstalador también borra la memoria del panel (huecos de skills,
  tarjetas plegadas), guardando antes una copia.

## [0.7.0] - 2026-11-14

### Añadido
- Títulos de tarjeta con las letras de píxeles de neón del dibujo y bordes del
  color de cada tarjeta.
- Enlace «ver qué falló» al log del primer check en rojo.
- Aviso en la fila de Claude cuando la API corta un turno, con el motivo.
- Teclas 1 a 8 para los huecos de skills.

### Cambiado
- El código del panel se divide en módulos (`register`, `pane`, `drawing`,
  `actions`, `state`, `look`).

## [0.6.x] - 2026-11-14

### Añadido
- Tarjeta **Skills**: ocho huecos globales; las marcadas van en cada consulta
  hasta que se desmarcan.
- Selector de skills con botones (grupo, página, «← Volver», «Vaciar hueco»)
  y tooltip con el nombre completo y la descripción.
- Atajos de GitHub: repositorio, rama, issues, PR, Actions y «Crear PR».

## [0.5.x] - 2026-11-14

### Añadido
- La columna de límites, a la derecha del equipo, para que el dibujo ocupe
  todo el ancho.
- Proyección de la ventana de 5 horas («↗ 100% a las 17:20»).
- Botón «Compactar contexto» a partir del 80 %.
- Toast y sonido cuando termina el CI; notificación del sistema cuando algo
  de más de 30 segundos acaba.

### Quitado
- El coste estimado de la sesión.

## [0.4.x] - 2026-11-14

### Añadido
- Banda de uso dentro del dibujo, con medidores LED de neón.
- El contexto como tokens sobre la ventana (`30K/1M`).

### Cambiado
- Tarjetas compactas: una línea por agente («trabajando…» animado) y por
  proceso («maven · build»).

## [0.3.0] - 2026-11-13

### Añadido
- Límites de 5 horas y semanal, contexto y avisos al 80 % y al 95 %.
- Seguimiento de instalaciones, builds y descargas, con el porcentaje real en
  segundo plano.
- Tarjeta de GitHub con la rama, la PR y sus checks.
- Tarjetas plegables que se recuerdan entre sesiones.

## [0.2.0] - 2026-11-13

- Primera versión del kit: el panel con el equipo de píxeles, los cuatro
  agentes opcionales y los instaladores para Windows, macOS y Linux.
