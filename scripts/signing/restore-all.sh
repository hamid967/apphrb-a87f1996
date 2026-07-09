#!/usr/bin/env bash
# scripts/signing/restore-all.sh
# One-shot restore of both iOS and Android signing artifacts before a mobile build.
# Skips iOS on non-macOS hosts (unless FORCE_IOS=1) since .p12 keychain import needs macOS.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { printf "\033[1;32m[signing]\033[0m %s\n" "$*"; }

if [[ "$(uname -s)" == "Darwin" || "${FORCE_IOS:-0}" == "1" ]]; then
  log "Restoring iOS signing…"
  bash "${SCRIPT_DIR}/restore-ios.sh"
else
  log "Skipping iOS restore (not macOS; set FORCE_IOS=1 to override)"
fi

log "Restoring Android signing…"
bash "${SCRIPT_DIR}/restore-android.sh"

log "All signing artifacts restored."
