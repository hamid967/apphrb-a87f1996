#!/usr/bin/env bash
# scripts/signing/restore-android.sh
# Decode Android keystore from base64 env vars into signing/android/
# and generate keystore.properties consumed by android/app/build.gradle.
#
# Required env vars:
#   ANDROID_KEYSTORE_BASE64     base64 of the .keystore/.jks file
#   ANDROID_KEYSTORE_PASSWORD   store password
#   ANDROID_KEY_ALIAS           key alias (e.g. "aqari")
#   ANDROID_KEY_PASSWORD        key password
#
# Optional:
#   GOOGLE_PLAY_JSON_KEY_BASE64  base64 of the Play service account JSON
#                                (written to signing/android/play-service-account.json)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_DIR="${REPO_ROOT}/signing/android"

log()  { printf "\033[1;34m[android-signing]\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m[android-signing] ERROR:\033[0m %s\n" "$*" >&2; exit 1; }

: "${ANDROID_KEYSTORE_BASE64:?ANDROID_KEYSTORE_BASE64 is required}"
: "${ANDROID_KEYSTORE_PASSWORD:?ANDROID_KEYSTORE_PASSWORD is required}"
: "${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS is required}"
: "${ANDROID_KEY_PASSWORD:?ANDROID_KEY_PASSWORD is required}"

mkdir -p "${OUT_DIR}"
chmod 700 "${OUT_DIR}"

KEYSTORE_PATH="${OUT_DIR}/aqari-release.keystore"
PROPS_PATH="${OUT_DIR}/keystore.properties"

log "Decoding keystore → ${KEYSTORE_PATH}"
printf '%s' "${ANDROID_KEYSTORE_BASE64}" | base64 --decode > "${KEYSTORE_PATH}"
chmod 600 "${KEYSTORE_PATH}"

# Verify with keytool if available
if command -v keytool >/dev/null 2>&1; then
  keytool -list -keystore "${KEYSTORE_PATH}" \
    -storepass "${ANDROID_KEYSTORE_PASSWORD}" \
    -alias "${ANDROID_KEY_ALIAS}" >/dev/null \
    || fail "Keystore verification failed (bad password or alias)"
  log "Keystore verified (alias=${ANDROID_KEY_ALIAS})"
else
  log "keytool not found — skipping verification"
fi

log "Writing ${PROPS_PATH}"
cat > "${PROPS_PATH}" <<EOF
storeFile=../../signing/android/aqari-release.keystore
storePassword=${ANDROID_KEYSTORE_PASSWORD}
keyAlias=${ANDROID_KEY_ALIAS}
keyPassword=${ANDROID_KEY_PASSWORD}
EOF
chmod 600 "${PROPS_PATH}"

# Optional: Google Play service account for automated upload (fastlane / gradle-play-publisher)
if [[ -n "${GOOGLE_PLAY_JSON_KEY_BASE64:-}" ]]; then
  SA_PATH="${OUT_DIR}/play-service-account.json"
  log "Decoding Google Play service account → ${SA_PATH}"
  printf '%s' "${GOOGLE_PLAY_JSON_KEY_BASE64}" | base64 --decode > "${SA_PATH}"
  chmod 600 "${SA_PATH}"
  python3 -c "import json,sys; json.load(open('${SA_PATH}'))" \
    || fail "play-service-account.json is not valid JSON"
fi

log "Android signing artifacts ready in ${OUT_DIR}"
