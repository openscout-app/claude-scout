#!/bin/bash
set -euo pipefail

if [[ -z "${OPENSCOUT_SETUP_CWD:-}" && -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
  export OPENSCOUT_SETUP_CWD="${CLAUDE_PROJECT_DIR}"
elif [[ -z "${OPENSCOUT_SETUP_CWD:-}" && -n "${PWD:-}" ]]; then
  export OPENSCOUT_SETUP_CWD="${PWD}"
elif [[ -z "${OPENSCOUT_SETUP_CWD:-}" && -n "${HOME:-}" ]]; then
  export OPENSCOUT_SETUP_CWD="${HOME}"
fi

if command -v scout >/dev/null 2>&1; then
  exec scout channel "$@"
fi

if command -v bunx >/dev/null 2>&1; then
  exec bunx @openscout/scout@0.5.3 channel "$@"
fi

if command -v bun >/dev/null 2>&1; then
  exec bun x @openscout/scout@0.5.3 channel "$@"
fi

cat >&2 <<'EOF'
Scout Claude channel could not start because neither `scout` nor Bun was found on PATH.

Recommended setup:
  bun add -g @openscout/scout
  scout setup
  scout up

Fallback:
  install Bun from https://bun.sh and rerun Claude Code so this plugin can
  launch `bunx @openscout/scout channel` automatically.
EOF

exit 1
