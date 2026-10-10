#!/usr/bin/env bash
set -euo pipefail
ARCHIVE=${1:?Pass the trial archive path}
WORK=$(mktemp -d /tmp/home-display-trial.XXXXXX)
trap 'rm -rf -- "$WORK"' EXIT
case "$(uname -m)" in
  armv7l) ARCH=armv7l ;;
  aarch64) ARCH=arm64 ;;
  *) echo 'Unsupported Pi architecture' >&2; exit 1 ;;
esac
mkdir "$WORK/app" "$WORK/node"
tar -xzf "$ARCHIVE" -C "$WORK/app"
# Release archives omit tests; run the checkout's tests against the packaged app.
cp -r -- "$(dirname -- "${BASH_SOURCE[0]}")/../tests" "$WORK/app/tests"
BASE=https://nodejs.org/dist/latest-v22.x
curl -fsSL "$BASE/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
FILE=$(awk -v arch="$ARCH" '$2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2}' "$WORK/SHASUMS256.txt")
[[ -n "$FILE" && "$FILE" != *$'\n'* ]]
curl -fsSL "$BASE/$FILE" -o "$WORK/$FILE"
(cd "$WORK" && awk -v name="$FILE" '$2 == name' SHASUMS256.txt | sha256sum -c -)
tar -xJf "$WORK/$FILE" -C "$WORK/node" --strip-components=1
export NODE_BINARY="$WORK/node/bin/node"
"$NODE_BINARY" --version
bash "$WORK/app/tests/linux-smoke.sh"
free -m
