#!/usr/bin/env bash
# scripts/signing/restore-ios.sh
# Decode iOS signing artifacts from base64 env vars into signing/ios/.
# Intended for CI (GitHub Actions, Bitrise, Codemagic) and local rebuilds.
#
# Required env vars:
#   IOS_P12_BASE64                      base64 of the distribution .p12
#   IOS_PROVISIONING_PROFILE_BASE64     base64 of the .mobileprovision
#
# Optional:
#   IOS_P12_PASSWORD                    imports the .p12 into the macOS keychain
#   KEYCHAIN_NAME                       target keychain (default: build.keychain)
#   KEYCHAIN_PASSWORD                   password for the temporary keychain

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_DIR="${REPO_ROOT}/signing/ios"

log()  { printf "\033[1;34m[ios-signing]\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m[ios-signing] ERROR:\033[0m %s\n" "$*" >&2; exit 1; }

: "${IOS_P12_BASE64:?IOS_P12_BASE64 is required}"
: "${IOS_PROVISIONING_PROFILE_BASE64:?IOS_PROVISIONING_PROFILE_BASE64 is required}"

mkdir -p "${OUT_DIR}"
chmod 700 "${OUT_DIR}"

P12_PATH="${OUT_DIR}/AqariDistribution.p12"
PROFILE_PATH="${OUT_DIR}/Aqari_AppStore.mobileprovision"

log "Decoding .p12 → ${P12_PATH}"
printf '%s' "${IOS_P12_BASE64}" | base64 --decode > "${P12_PATH}"
chmod 600 "${P12_PATH}"

log "Decoding .mobileprovision → ${PROFILE_PATH}"
printf '%s' "${IOS_PROVISIONING_PROFILE_BASE64}" | base64 --decode > "${PROFILE_PATH}"
chmod 600 "${PROFILE_PATH}"

# Sanity check magic bytes
file "${P12_PATH}" | grep -qiE 'data|pkcs' || fail "P12 file looks invalid after decode"

# Optional: install into a macOS keychain when running on macOS CI
if [[ "$(uname -s)" == "Darwin" && -n "${IOS_P12_PASSWORD:-}" ]]; then
  KC_NAME="${KEYCHAIN_NAME:-build.keychain}"
  KC_PASS="${KEYCHAIN_PASSWORD:-tmp-ci-password}"

  log "Creating temp keychain ${KC_NAME}"
  security create-keychain -p "${KC_PASS}" "${KC_NAME}" 2>/dev/null || true
  security set-keychain-settings -lut 21600 "${KC_NAME}"
  security unlock-keychain -p "${KC_PASS}" "${KC_NAME}"
  security list-keychains -d user -s "${KC_NAME}" $(security list-keychains -d user | tr -d '"')

  log "Importing certificate into keychain"
  security import "${P12_PATH}" -k "${KC_NAME}" -P "${IOS_P12_PASSWORD}" \
    -T /usr/bin/codesign -T /usr/bin/security
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "${KC_PASS}" "${KC_NAME}" >/dev/null

  # Install the provisioning profile
  PROFILES_DIR="${HOME}/Library/MobileDevice/Provisioning Profiles"
  mkdir -p "${PROFILES_DIR}"
  UUID=$(security cms -D -i "${PROFILE_PATH}" | plutil -extract UUID xml1 -o - - | \
    sed -n 's/.*<string>\(.*\)<\/string>.*/\1/p')
  [[ -n "${UUID}" ]] || fail "Could not extract UUID from provisioning profile"
  cp "${PROFILE_PATH}" "${PROFILES_DIR}/${UUID}.mobileprovision"
  log "Provisioning profile installed as ${UUID}.mobileprovision"
fi

log "iOS signing artifacts ready in ${OUT_DIR}"
