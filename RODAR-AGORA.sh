#!/usr/bin/env bash
# ============================================================================
# TRANSPORTADORA CASAGRANDE — roda o app na sua máquina em 3 comandos
# ============================================================================
# Uso:
#   1) Descompacte o ZIP numa pasta
#   2) Nesta pasta, rode:   bash RODAR-AGORA.sh
#   3) Abra no navegador o endereço que aparecer (http://localhost:8000)
#
# Funciona em macOS, Linux e Windows (Git Bash / WSL).
# Não precisa de Node, npm, build nem instalar nada: é HTML/CSS/JS puro.
# ============================================================================
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 não encontrado."
  echo "macOS:  brew install python3   (ou baixe em python.org)"
  echo "Windows: instale em python.org e rode com 'py -m http.server 8000'"
  exit 1
fi

echo ""
echo "  TRANSPORTADORA CASAGRANDE"
echo "  ─────────────────────────────────────────────"
echo "  Abra no navegador:  http://localhost:8000"
echo ""
echo "  Para parar: Ctrl+C"
echo ""

# abre o navegador automaticamente quando possível
( sleep 1.2
  if command -v open >/dev/null 2>&1; then open http://localhost:8000
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:8000
  fi ) >/dev/null 2>&1 &

python3 -m http.server 8000
