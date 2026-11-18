"""Installs or removes the agent-team pane for Claude Code on macOS and Linux.

The same steps as instalar.ps1 and desinstalar.ps1. Run it through
instalar-linux.sh and desinstalar-linux.sh (they also work on macOS), or directly:

    python3 scripts/kit.py instalar [--nombre Ana] [--reglas] [--sin-preguntas] [--claude-dir DIR]
    python3 scripts/kit.py desinstalar [--sin-preguntas] [--claude-dir DIR]
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

MARKETPLACE = 'agent-team-kit'
PLUGIN_KEY = 'agent-team@agent-team-kit'
KIT = Path(__file__).resolve().parent.parent
RULES_START = '<!-- agent-team:reglas:inicio -->'
RULES_END = '<!-- agent-team:reglas:fin -->'
# A marker counts only when it is alone on its line.
_RULES_START_RE = re.compile(r'^[ \t]*' + re.escape(RULES_START) + r'[ \t]*(?=\r?$)', re.M)
_RULES_END_RE = re.compile(r'^[ \t]*' + re.escape(RULES_END) + r'[ \t]*(?=\r?$)', re.M)
_FENCE_OPEN_RE = re.compile(r'^ {0,3}(`{3,}|~{3,})')
_FENCE_CLOSE_RE = re.compile(r'^ {0,3}(`{3,}|~{3,})[ \t]*$')
_LEGACY_HEADING_RE = re.compile(r'^## (Delegation to agents|Agent team)[ \t]*$')
_LEGACY_PHRASE = 'I have a team of agents in `~/.claude/agents/`'
# The pane's own memory; exact, so another marketplace's files
# (agent-team_agent-team-kit-dev-<hash>.json) are not matched.
STORE_FILE_RE = re.compile(r'^agent-team_agent-team-kit-[0-9a-f]{12}\.json$')
CLI_TIMEOUT = 120


class KitError(Exception):
    """Something in the kit itself is unusable."""


def claude_dir(arg):
    if arg:
        return Path(arg).expanduser().resolve()
    if os.environ.get('CLAUDE_CONFIG_DIR'):
        return Path(os.environ['CLAUDE_CONFIG_DIR']).expanduser().resolve()
    return Path.home() / '.claude'


def read_json(path):
    """A missing or empty file is an empty object; a broken one stops the script."""
    if not path.exists():
        return {}
    text = path.read_text(encoding='utf-8-sig')
    if not text.strip():
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError as error:
        sys.exit(f'No se puede leer {path} porque no es JSON válido ({error}). '
                 'Arréglalo (o renómbralo) y vuelve a ejecutar el script.')
    if not isinstance(value, dict):
        sys.exit(f'{path} no contiene un objeto JSON. No lo toco.')
    return value


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def same_file(a, b):
    return a.is_file() and b.is_file() and a.read_bytes() == b.read_bytes()


def read_kit_version():
    """The plugin's version; read only when installing, so a broken manifest never blocks uninstalling."""
    manifest = read_json(KIT / 'plugin' / 'agent-team' / '.claude-plugin' / 'plugin.json')
    return str(manifest.get('version') or '?')


def new_backup_dir(claude):
    """A new, empty folder for this run's copies; two runs in the same second get different ones."""
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    root = claude / 'agent-team-kit-copias'
    folder = root / stamp
    n = 1
    while folder.exists():
        n += 1
        folder = root / f'{stamp}-{n}'
    folder.mkdir(parents=True)
    return folder


# ---------------------------------------------------------------- team rules in CLAUDE.md

def rules_lines():
    """The rules the kit ships: the lines of the fenced block in extras/reglas-claude-md.md."""
    path = KIT / 'extras' / 'reglas-claude-md.md'
    if not path.is_file():
        raise KitError(f'No encuentro {path}.')
    lines = re.split(r'\r?\n', path.read_text(encoding='utf-8-sig'))
    first = last = None
    for index, line in enumerate(lines):
        if first is None:
            if line.rstrip() == '```markdown':
                first = index + 1
        elif line.rstrip() == '```':
            last = index
            break
    if first is None or last is None or last <= first:
        raise KitError(f'No encuentro el bloque de reglas en {path}.')
    return lines[first:last]


def _lines_with_offsets(text):
    """(offset, end offset, line without its terminator) for each line."""
    pos = 0
    while pos < len(text):
        newline = text.find('\n', pos)
        end = len(text) if newline < 0 else newline + 1
        yield pos, end, text[pos:end].rstrip('\r\n')
        pos = end


def fenced_ranges(text):
    """The spans of the text inside fenced code blocks (``` or ~~~), fence lines included.

    A fence that never closes is not a fence (otherwise everything written after
    it would count as inside it).
    """
    ranges = []
    opened = None
    opened_at = 0
    for pos, end, line in _lines_with_offsets(text):
        if opened is None:
            found = _FENCE_OPEN_RE.match(line)
            if found:
                opened, opened_at = found.group(1), pos
        else:
            found = _FENCE_CLOSE_RE.match(line)
            if found and found.group(1)[0] == opened[0] and len(found.group(1)) >= len(opened):
                ranges.append((opened_at, end))
                opened = None
    return ranges


def _in_ranges(ranges, index):
    return any(start <= index < end for start, end in ranges)


def read_claude_md(path):
    """Reads CLAUDE.md and finds the managed block (marker lines inside code fences do not count).

    state is 'none' (no markers or no file), 'block' (one start marker followed
    by one end marker; start/end are the span, markers included, and inner is
    the text between the marker lines, with LF line ends) or 'malformed'
    (anything else; reason says why). With no markers, legacy is the first
    heading (heading, line) of old unmarked team rules, if there is one.
    """
    info = {'exists': False, 'bom': False, 'text': '', 'state': 'none', 'reason': '',
            'start': 0, 'end': 0, 'inner': '', 'legacy': None}
    if not path.is_file():
        return info
    info['exists'] = True
    data = path.read_bytes()
    if data.startswith(b'\xef\xbb\xbf'):
        info['bom'] = True
        data = data[3:]
    try:
        info['text'] = data.decode('utf-8')
    except UnicodeDecodeError:
        info['state'] = 'malformed'
        info['reason'] = 'no está guardado en UTF-8'
        return info
    text = info['text']
    ranges = fenced_ranges(text)
    starts = [m for m in _RULES_START_RE.finditer(text) if not _in_ranges(ranges, m.start())]
    ends = [m for m in _RULES_END_RE.finditer(text) if not _in_ranges(ranges, m.start())]
    if not starts and not ends:
        for number, (pos, _end, line) in enumerate(_lines_with_offsets(text), 1):
            if _in_ranges(ranges, pos):
                continue
            found = _LEGACY_HEADING_RE.match(line)
            if found:
                info['legacy'] = {'heading': f'## {found.group(1)}', 'line': number}
            elif _LEGACY_PHRASE in line:
                info['legacy'] = {'heading': _LEGACY_PHRASE, 'line': number}
            if info['legacy']:
                break
        return info
    info['state'] = 'malformed'
    if len(starts) == 1 and len(ends) == 1:
        if starts[0].end() <= ends[0].start():
            info['state'] = 'block'
            info['start'] = starts[0].start()
            info['end'] = ends[0].end()
            inner_start = starts[0].end()
            if text.startswith('\r\n', inner_start):
                inner_start += 2
            elif text.startswith('\n', inner_start):
                inner_start += 1
            inner = text[inner_start:ends[0].start()] if ends[0].start() > inner_start else ''
            inner = inner.replace('\r\n', '\n')
            if inner.endswith('\n'):
                inner = inner[:-1]
            info['inner'] = inner
        else:
            info['reason'] = 'la marca de fin está antes que la de inicio'
    elif len(starts) == 1 and not ends:
        info['reason'] = 'tiene la marca de inicio pero no la de fin'
    elif not starts and len(ends) == 1:
        info['reason'] = 'tiene la marca de fin pero no la de inicio'
    else:
        info['reason'] = f'tiene marcas repetidas ({len(starts)} de inicio y {len(ends)} de fin)'
    return info


def rules_ownership(inner, current_text, recorded_hash):
    """'current' (the text of this kit version), 'older' (what the kit wrote last time, by its recorded hash) or 'changed'."""
    if inner == current_text:
        return 'current'
    if recorded_hash and text_sha256(inner).lower() == str(recorded_hash).lower():
        return 'older'
    return 'changed'


def write_claude_md(path, text, bom):
    path.write_bytes((b'\xef\xbb\xbf' if bom else b'') + text.encode('utf-8'))


def set_rules_block(lines, claude, get_backup_dir, recorded_hash, override):
    """Puts the kit's rules block into CLAUDE.md: creates the file, replaces the kit's own block or appends one.

    Rules that are the person's (a block they changed, or old unmarked rules)
    are only touched with override. get_backup_dir gives the folder for the copy
    of the original. Answers (status, message) with status 'creado', 'añadido',
    'actualizado', 'al-dia', 'intacto', 'cambiado' or 'legado'.
    """
    path = claude / 'CLAUDE.md'
    info = read_claude_md(path)
    if info['state'] == 'malformed':
        return 'intacto', f'No he tocado tu CLAUDE.md: {info["reason"]}.'
    text = info['text']
    eol = '\r\n' if '\r\n' in text else '\n'
    block = eol.join([RULES_START] + lines + [RULES_END])
    if not info['exists']:
        new, status, message = block + eol, 'creado', 'CLAUDE.md creado con las reglas del equipo.'
    elif info['state'] == 'block':
        if rules_ownership(info['inner'], '\n'.join(lines), recorded_hash) == 'changed' and not override:
            return 'cambiado', ('No he tocado las reglas de tu CLAUDE.md porque las has cambiado desde que se instalaron. '
                                'Contesta s cuando el instalador te lo pregunte, o borra ese bloque y vuelve a ejecutarlo.')
        new = text[:info['start']] + block + text[info['end']:]
        status, message = 'actualizado', 'Reglas del equipo de tu CLAUDE.md puestas al día.'
    else:
        if info['legacy'] and not override:
            legacy = info['legacy']
            return 'legado', (f'No he tocado tu CLAUDE.md: ya tiene unas reglas del equipo sin las marcas del kit '
                              f'(«{legacy["heading"]}», línea {legacy["line"]}), seguramente de una versión anterior. '
                              'Si añado las nuevas tendrás las dos. Quita esa sección y vuelve a ejecutar el instalador.')
        new = text
        if text:
            if not text.endswith('\n'):
                new += eol
            new += eol
        new += block + eol
        if text:
            status, message = 'añadido', 'Reglas del equipo añadidas al final de tu CLAUDE.md.'
        else:
            status, message = 'creado', 'Reglas del equipo escritas en tu CLAUDE.md.'
    if info['exists'] and new == text:
        return 'al-dia', 'Las reglas ya estaban al día.'
    if info['exists']:
        shutil.copyfile(path, get_backup_dir() / 'CLAUDE.md')
    write_claude_md(path, new, info['bom'])
    return status, message


def text_without_rules(text, info):
    """The text without the managed block (its lines) and the one blank line that separated it from what came before."""
    end = info['end']
    if text.startswith('\r\n', end):
        end += 2
    elif text.startswith('\n', end):
        end += 1
    before = text[:info['start']]
    if before.endswith('\n'):
        cut = len(before) - 1
        if cut > 0 and before[cut - 1] == '\r':
            cut -= 1
        line_start = before.rfind('\n', 0, cut) + 1
        if re.fullmatch(r'[ \t]*', before[line_start:cut]):
            before = before[:line_start]
    return before + text[end:]


def remove_rules_block(claude, current_text, recorded_hash):
    """Takes the kit's own block out of CLAUDE.md (already copied by the caller); one the person changed stays.

    Deletes the file only when nothing at all is left. current_text is the rules
    text of this kit version (or None). Answers (status, message) with status
    'quitado', 'borrado', 'sin-reglas', 'cambiado' or 'intacto'.
    """
    path = claude / 'CLAUDE.md'
    info = read_claude_md(path)
    if info['state'] == 'malformed':
        return 'intacto', f'No he tocado tu CLAUDE.md: {info["reason"]}.'
    if info['state'] != 'block':
        return 'sin-reglas', ''
    if current_text is not None:
        owner = rules_ownership(info['inner'], current_text, recorded_hash)
    else:
        owner = 'older' if recorded_hash and text_sha256(info['inner']).lower() == str(recorded_hash).lower() else 'changed'
    if owner == 'changed':
        return 'cambiado', 'No he quitado las reglas de tu CLAUDE.md porque las has cambiado después de instalarlas.'
    new = text_without_rules(info['text'], info)
    if not new:
        path.unlink()
        return 'borrado', 'borrado CLAUDE.md (solo tenía las reglas del equipo)'
    write_claude_md(path, new, info['bom'])
    return 'quitado', 'quitadas las reglas del equipo de CLAUDE.md'


# ---------------------------------------------------------------- Claude Code's CLI

class ClaudeError(Exception):
    """The claude command could not be run, or did not answer in time."""


def _claude_env(claude):
    """The environment for the claude CLI: the kit's folder passed on only when it is not the default."""
    env = dict(os.environ)
    if Path(claude).resolve() != (Path.home() / '.claude').resolve():
        env['CLAUDE_CONFIG_DIR'] = str(claude)
    else:
        # With it set, Claude Code also looks for its global config inside that folder.
        env.pop('CLAUDE_CONFIG_DIR', None)
    return env


def _command(exe, args):
    """The command to run. A .cmd or .bat launcher (what npm installs) goes through cmd.exe with every
    argument quoted, so a path with an & or a ^ in it stays one argument."""
    if os.name == 'nt' and exe.lower().endswith(('.cmd', '.bat')):
        quoted = ' '.join('"' + part + '"' for part in [exe] + list(args))
        return f'"{os.environ.get("COMSPEC", "cmd.exe")}" /d /s /c "{quoted}"'
    return [exe] + list(args)


def _claude(exe, args, env, stdin_text=None):
    """Runs claude without letting it read the console. Answers (exit code, stdout)."""
    options = dict(env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                   encoding='utf-8', errors='replace', timeout=CLI_TIMEOUT)
    if stdin_text is None:
        options['stdin'] = subprocess.DEVNULL
    else:
        options['input'] = stdin_text
    try:
        done = subprocess.run(_command(exe, args), **options)
    except subprocess.TimeoutExpired:
        raise ClaudeError(f'el comando claude no ha respondido en {CLI_TIMEOUT} segundos')
    except OSError as error:
        raise ClaudeError(str(error))
    return done.returncode, done.stdout or ''


def check_claude_cli():
    """Is there a usable Claude Code CLI (version 2 or newer)? Answers (exe, kind): kind is 'missing', 'old' or None."""
    exe = shutil.which('claude')
    if not exe:
        return None, 'missing'
    major = 0
    try:
        code, out = _claude(exe, ['--version'], dict(os.environ))
        found = re.search(r'(\d+)\.\d+', out)
        if code == 0 and found:
            major = int(found.group(1))
    except ClaudeError:
        pass
    if major < 2:
        return None, 'old'
    return exe, None


def plugin_entry(exe, env):
    """The plugin's entry in `claude plugin list --json`. Answers (read ok, entry or None)."""
    code, out = _claude(exe, ['plugin', 'list', '--json'], env)
    if code != 0:
        return False, None
    if not out.strip():
        return True, None
    try:
        items = json.loads(out)
    except ValueError:
        return False, None
    if isinstance(items, dict):
        items = [items]
    return True, next((i for i in items if isinstance(i, dict) and i.get('id') == PLUGIN_KEY), None)


def _same_path(a, b):
    try:
        return os.path.normcase(os.path.normpath(str(a))) == os.path.normcase(os.path.normpath(str(b)))
    except (TypeError, ValueError):
        return False


def marketplace_source(known, dest):
    """Whose is the marketplace agent-team-kit in Claude Code's known_marketplaces.json?

    Answers (state, description): 'none' (not there), 'ours' (a directory source
    that is dest, or one this cannot tell from it) or 'other' (another source,
    for example GitHub; the description says which).
    """
    entry = known.get(MARKETPLACE)
    if not isinstance(entry, dict):
        return 'none', ''
    source = entry.get('source')
    kind = str(source.get('source') or '') if isinstance(source, dict) else ''
    if kind and kind != 'directory':
        where = ''.join(str(source.get(key) or '') for key in ('repo', 'url', 'path'))
        return 'other', f'{kind} {where}'.strip()
    if kind == 'directory':
        path = str(source.get('path') or '')
        if path and not _same_path(path, dest):
            return 'other', f'directory {path}'
    return 'ours', ''


def sync_claude_plugin(claude, team_name, kit_version):
    """Registers or updates the plugin through Claude Code's CLI when it is there.

    Answers (result, message). The result is 'ok', 'sin-cli' (no usable claude
    command), 'fallo' (not registered), 'version' (registered in another
    version, or off) or 'configure' (the team name was refused). The CLI reports some failures
    with exit code 0, so the outcome is read back from `plugin list`.
    """
    exe, kind = check_claude_cli()
    if kind == 'missing':
        return 'sin-cli', 'No encuentro el comando claude: Claude Code lo registrará al abrir una sesión nueva.'
    if kind:
        return 'sin-cli', ('El comando claude es demasiado antiguo o no funciona (hace falta Claude Code 2 o más nuevo): '
                           'Claude Code lo registrará al abrir una sesión nueva.')
    print('Registrando el plugin en Claude Code…')
    dest = Path(claude) / MARKETPLACE
    env = _claude_env(claude)
    try:
        # The CLI knows a marketplace only once it is added (settings.json alone is
        # read by a session, not by the CLI); adding one it knows is a no-op.
        _claude(exe, ['plugin', 'marketplace', 'add', str(dest)], env)
        _claude(exe, ['plugin', 'marketplace', 'update', MARKETPLACE], env)
        _ok, before = plugin_entry(exe, env)
        _claude(exe, ['plugin', 'update' if before else 'install', PLUGIN_KEY], env)
        configure_code, _out = _claude(exe, ['plugin', 'configure', PLUGIN_KEY, '--values-stdin'], env,
                                       stdin_text=json.dumps({'teamName': team_name}, ensure_ascii=False))
        _ok, entry = plugin_entry(exe, env)
    except ClaudeError as error:
        return 'fallo', (f'No he podido registrarlo con el comando claude ({error}); '
                         'Claude Code lo hará al abrir una sesión nueva.')
    if not entry:
        return 'fallo', 'No he podido registrarlo con el comando claude; Claude Code lo hará al abrir una sesión nueva.'
    if str(entry.get('version')) != kit_version:
        return 'version', (f'Claude Code lo tiene registrado en la versión {entry.get("version")}. '
                           f'Ejecuta `claude plugin update {PLUGIN_KEY}` y abre una sesión nueva.')
    if entry.get('enabled') is not True:
        return 'version', (f'Claude Code lo tiene registrado pero desactivado. '
                           f'Ejecuta `claude plugin enable {PLUGIN_KEY}` y abre una sesión nueva.')
    if configure_code != 0:
        return 'configure', ('El comando claude no ha aceptado el nombre del equipo. '
                             f'Para ponerlo, ejecuta `claude plugin configure {PLUGIN_KEY}` y abre una sesión nueva.')
    return 'ok', ''


def other_source_message(description):
    """What to do when Claude Code already has an agent-team-kit marketplace from another source."""
    return (f'Ya tienes un marketplace agent-team-kit de otra fuente ({description}), '
            'así que no instalo encima para no pisarlo. '
            f'Quita esa instalación (`claude plugin uninstall {PLUGIN_KEY}` y '
            f'`claude plugin marketplace remove {MARKETPLACE}`) y vuelve a ejecutar el instalador. '
            'Mira LEEME.md, «Instalar desde GitHub».')


def is_directory_source(entry, dest):
    """Is this settings.json entry a directory marketplace that points to dest?"""
    source = entry.get('source') if isinstance(entry, dict) else None
    if not isinstance(source, dict):
        return False
    path = str(source.get('path') or '')
    return source.get('source') == 'directory' and bool(path) and _same_path(path, dest)


def _read_known(claude):
    """Claude Code's known_marketplaces.json; an unreadable one counts as empty."""
    try:
        value = json.loads((Path(claude) / 'plugins' / 'known_marketplaces.json').read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def remove_claude_plugin(claude):
    """Asks Claude Code's CLI to forget the plugin and its marketplace, when the CLI is there."""
    exe, kind = check_claude_cli()
    if kind == 'old':
        print('El comando claude es demasiado antiguo o no funciona: no le pido que lo quite y lo hago a mano.')
    if not exe:
        return
    print('Quitando el plugin de Claude Code…')
    env = _claude_env(claude)
    try:
        _claude(exe, ['plugin', 'uninstall', PLUGIN_KEY], env)
        _claude(exe, ['plugin', 'marketplace', 'remove', MARKETPLACE], env)
    except ClaudeError as error:
        print(f'El comando claude no ha terminado ({error}); sigo con la limpieza a mano.')


def ask_yes_no(question, default=False):
    """Asks yes or no until it gets an answer. Enter gives the default; so does the end of the input."""
    hint = 'S/n' if default else 's/N'
    while True:
        try:
            answer = input(f'{question} ({hint}) ').strip().lower()
        except EOFError:
            return default
        if not answer:
            return default
        if answer in ('s', 'si', 'sí', 'y', 'yes'):
            return True
        if answer in ('n', 'no'):
            return False
        print('Contesta s o n.')


def install(args):
    source = KIT / 'plugin'
    if not (source / '.claude-plugin' / 'marketplace.json').exists():
        sys.exit(f'No encuentro la carpeta plugin del kit en {KIT}. '
                 'Descomprime el zip entero y ejecuta el script desde ahí.')

    claude = claude_dir(args.claude_dir)
    dest = claude / MARKETPLACE
    settings_path = claude / 'settings.json'
    agents_dir = claude / 'agents'
    claude_md_path = claude / 'CLAUDE.md'

    print('\nInstalador de agent-team')
    print(f'Carpeta de Claude: {claude}\n')

    # Read settings.json first: if it is broken, stop before copying anything.
    settings = read_json(settings_path)

    # A marketplace agent-team-kit that Claude Code already has from another source
    # (GitHub) is not ours to overwrite: stop before anything is written.
    state, description = marketplace_source(_read_known(claude), dest)
    if state == 'other':
        sys.exit(other_source_message(description))

    # An update keeps the name given last time unless a new one is asked for.
    record_path = dest / 'instalacion.json'
    previous_record = read_json(record_path) if record_path.exists() else {}
    previous_name = str(previous_record.get('nombre') or '').strip()
    recorded_rules_hash = previous_record.get('reglasSha256')
    kit_version = read_kit_version()
    print(f'Versión del kit: {kit_version}\n')

    # The rules text is read now, with the other checks, so that a broken kit
    # stops the script before anything is written.
    rules = None
    if args.reglas or not args.sin_preguntas:
        try:
            rules = rules_lines()
        except KitError as error:
            sys.exit(str(error))
    override_rules = False

    name = args.nombre
    with_agents = args.agentes
    with_rules = args.reglas
    if not args.sin_preguntas:
        if name is None:
            print('El panel lleva un título en letras de píxeles. Con un nombre sale «<NOMBRE> TEAM»;')
            print('sin nombre, «AGENT TEAM».')
            try:
                if previous_name:
                    answer = input(f'Nombre del equipo (ahora «{previous_name}»; '
                                   'Enter lo deja igual, un guion - lo quita): ').strip()
                    name = previous_name if not answer else '' if answer == '-' else answer
                else:
                    name = input('Nombre del equipo (Enter para dejarlo sin nombre): ')
            except EOFError:
                name = previous_name
        if not with_rules:
            current = read_claude_md(claude_md_path)
            print()
            if current['state'] == 'malformed':
                # Nothing to ask: the step below says why CLAUDE.md is left alone.
                with_rules = True
            elif current['state'] == 'block':
                owner = rules_ownership(current['inner'], '\n'.join(rules), recorded_rules_hash)
                if owner == 'current':
                    with_rules = True
                elif owner == 'older':
                    with_rules = ask_yes_no('Tu CLAUDE.md ya tiene las reglas del equipo. '
                                            '¿Las pongo al día con las de esta versión?', default=True)
                else:
                    with_rules = override_rules = ask_yes_no('Has cambiado las reglas del equipo de tu CLAUDE.md. '
                                                             '¿Las sustituyo por las de esta versión?')
            elif current['legacy']:
                legacy = current['legacy']
                with_rules = override_rules = ask_yes_no(
                    f'Tu CLAUDE.md ya tiene unas reglas del equipo sin las marcas del kit («{legacy["heading"]}», '
                    f'línea {legacy["line"]}), seguramente de una versión anterior. Si añado las nuevas tendrás '
                    'las dos. Quita esa sección y vuelve a ejecutar el instalador, o contesta s para añadirlas igualmente.')
            else:
                with_rules = ask_yes_no('¿Añado las reglas de reparto a tu CLAUDE.md '
                                        'para que Claude trabaje con el equipo?', default=True)
    if args.sin_preguntas and name is None:
        name = previous_name
    name = (name or '').strip()

    # The folder for this run's copies, made the first time something needs one.
    run_backups = []

    def get_backups():
        if not run_backups:
            run_backups.append(new_backup_dir(claude))
        return run_backups[0]

    # 1. The plugin, as a local marketplace folder. A reinstall replaces the
    #    plugin but keeps the record of the agents installed earlier.
    installed_agents = []
    if record_path.exists():
        installed_agents = list(previous_record.get('agentes') or [])
        print('Ya estaba instalado: lo actualizo.')
    dest.mkdir(parents=True, exist_ok=True)
    for item in ('.claude-plugin', 'agent-team'):
        target = dest / item
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source / item, target)

    manifest_path = dest / 'agent-team' / '.claude-plugin' / 'plugin.json'
    manifest = read_json(manifest_path)
    manifest['userConfig']['teamName']['default'] = name
    write_json(manifest_path, manifest)

    # 2. The agents now come inside the plugin (agent-team:explorer...). The
    #    copies an earlier kit put in agents/ are retired when nobody changed
    #    them, a copy kept first; a changed one stays, and so does its record,
    #    so the uninstaller still knows it.
    if with_agents:
        print('  --agentes ya no hace falta: el panel trae sus cuatro agentes.')
    kept_agents = []
    team_files = ('explorer.md', 'implementer.md', 'tester.md', 'reviewer.md')
    for agent in installed_agents:
        # Only an entry the kit could have written: one of its four files with a hash. Anything else is dropped.
        if not isinstance(agent, dict) or agent.get('nombre') not in team_files or not isinstance(agent.get('sha256'), str):
            continue
        path = agents_dir / agent['nombre']
        base = Path(agent['nombre']).stem
        if not path.is_file():
            continue
        if sha256(path) == agent.get('sha256'):
            copies = get_backups() / 'agents'
            copies.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, copies / agent['nombre'])
            path.unlink()
            print(f'  agente {base}: retirado de agents/, ahora viene en el panel como agent-team:{base}')
        else:
            kept_agents.append(agent)
            print(f'  agente {base}: lo cambiaste, así que lo dejo; el panel trae agent-team:{base}, y Claude verá los dos')
    installed_agents = kept_agents
    # Agents of the same name the kit never installed are the person's own: left alone, but said.
    for base in ('explorer', 'implementer', 'tester', 'reviewer'):
        own = agents_dir / f'{base}.md'
        if own.exists() and not any(a.get('nombre') == f'{base}.md' for a in installed_agents):
            print(f'  agents/{base}.md es tuyo: no lo toco. Claude verá {base} y agent-team:{base}.')

    # 3. settings.json: the marketplace and the switch that turns the plugin on.
    if settings_path.exists():
        shutil.copyfile(settings_path, get_backups() / 'settings.json')
    markets = settings.get('extraKnownMarketplaces')
    if not isinstance(markets, dict):
        markets = settings['extraKnownMarketplaces'] = {}
    markets[MARKETPLACE] = {'source': {'source': 'directory', 'path': str(dest)}}
    enabled = settings.get('enabledPlugins')
    if not isinstance(enabled, dict):
        enabled = settings['enabledPlugins'] = {}
    enabled[PLUGIN_KEY] = True
    # The team name also lives here when `claude plugin configure` wrote it, and
    # there it wins over the plugin's default: keep it in step with the chosen name.
    configs = settings.get('pluginConfigs')
    plugin_config = configs.get(PLUGIN_KEY) if isinstance(configs, dict) else None
    if isinstance(plugin_config, dict):
        options = plugin_config.get('options')
        if name:
            if not isinstance(options, dict):
                options = plugin_config['options'] = {}
            options['teamName'] = name
        elif isinstance(options, dict):
            options.pop('teamName', None)
            if not options:
                del plugin_config['options']
        if not plugin_config:
            del configs[PLUGIN_KEY]
            if not configs:
                del settings['pluginConfigs']
    write_json(settings_path, settings)

    others = [key for key, on in enabled.items()
              if key.startswith('agent-team@') and key != PLUGIN_KEY and on is True]

    # 3b. The team rules in CLAUDE.md, only when asked for.
    rules_result = set_rules_block(rules, claude, get_backups, recorded_rules_hash, override_rules) if with_rules else None
    # What the record keeps: whether the block is there, and the hash of the text
    # the kit last wrote (the old one stays while the person's own block stays).
    rules_now = read_claude_md(claude_md_path)
    rules_present = rules_now['state'] == 'block'
    rules_hash = None
    if rules_present:
        rules_hash = text_sha256(rules_now['inner']) if rules and rules_now['inner'] == '\n'.join(rules) else recorded_rules_hash
    backups = run_backups[0] if run_backups else None

    write_json(record_path, {
        'kit': kit_version,
        'instaladoEl': datetime.datetime.now().isoformat(timespec='seconds'),
        'nombre': name,
        'agentes': installed_agents,
        'reglas': rules_present,
        'reglasSha256': rules_hash,
        'copias': str(backups) if backups else None,
    })

    # 4. Claude Code's own records, through its CLI when it is there.
    sync, sync_message = sync_claude_plugin(claude, name, kit_version)

    title = f'{name} team' if name else 'Agent team'
    print(f'\nListo. Instalado en {dest}')
    if rules_result:
        print(f'  {rules_result[1]}')
    if backups:
        print(f'Copias de tus ficheros anteriores: {backups}')
    if others:
        print(f'\nOjo: también tienes activo {others[0]}. Verás dos paneles; desactiva uno en settings.json.')
    if sync == 'ok':
        print(f'\nClaude Code ya lo tiene registrado (agent-team {kit_version}).')
    else:
        print(f'\n{sync_message}')
    print('Siguiente paso: abre una sesión nueva en Claude Code (o escribe /reload-plugins en una abierta).')
    print(f'Debería salir el panel «{title}» a un lado. /agent-team lo oculta o lo vuelve a mostrar.')


def uninstall(args):
    claude = claude_dir(args.claude_dir)
    dest = claude / MARKETPLACE
    settings_path = claude / 'settings.json'
    installed_path = claude / 'plugins' / 'installed_plugins.json'
    known_path = claude / 'plugins' / 'known_marketplaces.json'
    claude_md_path = claude / 'CLAUDE.md'
    store_dir = claude / 'plugins' / 'store'

    print('\nDesinstalador de agent-team')
    print(f'Carpeta de Claude: {claude}')
    print('Mejor con Claude cerrado, para que no vuelva a escribir sus ficheros mientras tanto.\n')

    if not args.sin_preguntas and not ask_yes_no('¿Quitar el panel agent-team y lo que instaló el kit?'):
        print('No he tocado nada.')
        return

    # (a) Parse everything first: if a file is broken, stop before changing any.
    read_json(settings_path)
    read_json(installed_path)
    marketplace, marketplace_description = marketplace_source(read_json(known_path), dest)
    record = read_json(dest / 'instalacion.json')
    recorded_rules_hash = record.get('reglasSha256')
    rules = read_claude_md(claude_md_path)
    # The rules text of this kit version tells the kit's block from one the person
    # changed; if the kit's file is unreadable, only the recorded hash can.
    try:
        current_rules = '\n'.join(rules_lines())
    except KitError:
        current_rules = None

    # (b) Copies of the files before anything touches them (Claude Code's own
    #     uninstall included). The ones still unchanged at the end are dropped again.
    backups = new_backup_dir(claude)
    tracked = [(settings_path, 'settings.json'),
               (installed_path, 'installed_plugins.json'),
               (known_path, 'known_marketplaces.json')]
    if rules['state'] == 'block':
        tracked.append((claude_md_path, 'CLAUDE.md'))
    for path, name in tracked:
        if path.exists():
            shutil.copyfile(path, backups / name)
    store_files = []
    if marketplace != 'other' and store_dir.is_dir():
        store_files = sorted(f for f in store_dir.iterdir() if f.is_file() and STORE_FILE_RE.match(f.name))
        for file in store_files:
            shutil.copyfile(file, backups / file.name)
    done = []

    # (c) Claude Code's own way first, when its CLI is there; what it leaves
    #     behind is cleared by hand below.
    if marketplace == 'other':
        print(f'Tienes un marketplace agent-team-kit de otra fuente ({marketplace_description}): '
              'solo quito lo que puso el kit.')
    else:
        remove_claude_plugin(claude)

    # (d) Read the files again (the CLI may have changed them) and clear what is left.
    settings = read_json(settings_path)
    installed = read_json(installed_path)
    known = read_json(known_path)
    for path, name in tracked:
        copy = backups / name
        if name != 'CLAUDE.md' and copy.exists() and not same_file(copy, path):
            done.append(f'Claude Code ha quitado sus registros de {name} con su propio comando')

    # 1. settings.json. With a marketplace from another source, only the entry that
    #    points to the kit's own folder is ours: enabledPlugins and pluginConfigs
    #    belong to the other install.
    changed = False
    pairs = []
    markets_now = settings.get('extraKnownMarketplaces')
    if marketplace != 'other' or (isinstance(markets_now, dict)
                                  and is_directory_source(markets_now.get(MARKETPLACE), dest)):
        pairs.append(('extraKnownMarketplaces', MARKETPLACE))
    if marketplace != 'other':
        pairs.append(('enabledPlugins', PLUGIN_KEY))
        pairs.append(('pluginConfigs', PLUGIN_KEY))
    for section_name, key in pairs:
        section = settings.get(section_name)
        if isinstance(section, dict) and key in section:
            del section[key]
            changed = True
            if not section:
                del settings[section_name]
    # Claude Code's own uninstall may leave these sections empty: an empty one goes too.
    for section_name, _key in pairs:
        if section_name in settings and settings[section_name] == {}:
            del settings[section_name]
            changed = True
    if changed:
        write_json(settings_path, settings)
        done.append('quitadas sus entradas de settings.json')

    # 2. Claude Code's records of the install (not those of a marketplace from another source).
    if marketplace != 'other':
        plugins = installed.get('plugins')
        if isinstance(plugins, dict) and PLUGIN_KEY in plugins:
            del plugins[PLUGIN_KEY]
            write_json(installed_path, installed)
            done.append('quitado de plugins/installed_plugins.json')
        if MARKETPLACE in known:
            del known[MARKETPLACE]
            write_json(known_path, known)
            done.append('quitado de plugins/known_marketplaces.json')
        for leftover in ('plugins/cache/agent-team-kit', 'plugins/marketplaces/agent-team-kit'):
            path = claude / leftover
            if path.exists():
                shutil.rmtree(path)
                done.append(f'borrada {leftover}')

    # 3. The team rules in CLAUDE.md (already copied above).
    rules_status, rules_message = remove_rules_block(claude, current_rules, recorded_rules_hash)
    if rules_status in ('quitado', 'borrado'):
        done.append(rules_message)

    # (e) What the record knows about, from the copy kept in memory.
    # The pane's own memory: packs, skill slots, picks per project, the tab, usage readings. Kept
    # among the copies, so a reinstall can have it back.
    for file in store_files:
        if file.exists():
            file.unlink()
            done.append(f'borrada la memoria del panel (plugins/store/{file.name})')

    # 4. Agents the kit installed, only if nobody changed them since.
    kept = []
    for agent in record.get('agentes') or []:
        path = claude / 'agents' / agent.get('nombre', '')
        if not agent.get('nombre') or not path.is_file():
            continue
        if sha256(path) == agent.get('sha256'):
            path.unlink()
            done.append(f'borrado el agente {agent["nombre"]}')
        else:
            kept.append(agent['nombre'])

    # 5. The plugin folder itself.
    if dest.exists():
        shutil.rmtree(dest)
        done.append(f'borrada la carpeta {dest}')

    # Copies of files that ended up unchanged are of no use.
    for path, name in tracked:
        copy = backups / name
        if same_file(copy, path):
            copy.unlink()

    print()
    if not done:
        print('No había nada del kit instalado.')
    else:
        for line in done:
            print(f'  {line}')
        print('\nDesinstalado.')
    if marketplace == 'other':
        print('No he tocado enabledPlugins, pluginConfigs, la memoria del panel ni los registros de Claude Code: '
              'son de la otra instalación.')
    if rules_status in ('intacto', 'cambiado'):
        print(rules_message)
    if any(backups.iterdir()):
        print(f'Copias de los ficheros que he cambiado: {backups}')
    else:
        backups.rmdir()
        if not any(backups.parent.iterdir()):
            backups.parent.rmdir()
    for name in kept:
        print(f'No he borrado agents/{name} porque lo has cambiado después de instalarlo.')
    print('Abre una sesión nueva de Claude Code para que deje de cargar el panel.')


def main():
    parser = argparse.ArgumentParser(description='Instala o quita el panel agent-team de Claude Code.')
    commands = parser.add_subparsers(dest='command', required=True)
    add = commands.add_parser('instalar')
    add.add_argument('--nombre', help='nombre del equipo; vacío deja AGENT TEAM')
    add.add_argument('--agentes', action='store_true', help='ya no hace nada: el panel trae sus agentes (se acepta por compatibilidad)')
    add.add_argument('--reglas', action='store_true', help='añade (o actualiza) las reglas de reparto en CLAUDE.md')
    add.add_argument('--sin-preguntas', action='store_true')
    add.add_argument('--claude-dir', help='carpeta de Claude (por defecto ~/.claude)')
    remove = commands.add_parser('desinstalar')
    remove.add_argument('--sin-preguntas', action='store_true')
    remove.add_argument('--claude-dir', help='carpeta de Claude (por defecto ~/.claude)')
    args = parser.parse_args()
    if args.command == 'instalar':
        install(args)
    else:
        uninstall(args)


if __name__ == '__main__':
    main()
