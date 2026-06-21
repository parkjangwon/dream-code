#!/usr/bin/env sh
set -eu

INSTALL_DIR="${DREAM_CODE_INSTALL_DIR:-$HOME/.dream/dream-code}"

if command -v npm >/dev/null 2>&1; then
  npm uninstall -g dream-code >/dev/null 2>&1 || true
fi

if [ "${DREAM_CODE_REMOVE_SOURCE:-0}" = "1" ]; then
  rm -rf "$INSTALL_DIR"
fi

printf '%s\n' "Dream Code uninstalled."
printf '%s\n' "User settings remain in ~/.dream."
printf '%s\n' "To remove the cloned source too: DREAM_CODE_REMOVE_SOURCE=1 sh uninstall.sh"
