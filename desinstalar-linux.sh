#!/bin/sh
# Quita el panel agent-team y lo que instaló el kit (macOS y Linux).
# Uso: sh desinstalar-linux.sh [--sin-preguntas] [--claude-dir carpeta]
set -e
here=$(cd "$(dirname "$0")" && pwd)
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 7))' >/dev/null 2>&1; then
    exec "$candidate" -I -X utf8 "$here/scripts/kit.py" desinstalar "$@"
  fi
done
echo "Hace falta Python 3.7 o más nuevo y no lo encuentro."
echo "En macOS: xcode-select --install. En Linux: instala python3 con tu gestor de paquetes."
exit 1
