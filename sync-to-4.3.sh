#!/usr/bin/env bash
# Copy widget source from this repo (dev / Angular 20) into the 4.3 fork
# (Angular 18, PRD-compatible). Leaves 4.3's pinned build configuration
# (package.json, patches/, angular.json, tsconfig*) untouched.
#
# Usage:
#   ./sync-to-4.3.sh           # sync only
#   ./sync-to-4.3.sh --build   # sync, then run yarn build in the 4.3 repo

set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DST="$(cd "$SRC/../thingsboard-extensions-4.3" 2>/dev/null && pwd || true)"

if [ -z "$DST" ] || [ ! -d "$DST" ]; then
  echo "ERROR: 4.3 fork not found at ../thingsboard-extensions-4.3" >&2
  exit 1
fi

echo "==> SRC: $SRC"
echo "==> DST: $DST"
echo

# Widget subtrees — replace wholesale (any new files in dev land in 4.3 too)
for dir in alarm-threshold-editor haccp; do
  echo "  syncing components/$dir"
  rm -rf "$DST/src/app/components/$dir"
  cp -R "$SRC/src/app/components/$dir" "$DST/src/app/components/"
done

# Registration files — overwrite
for f in src/app/public-api.ts src/app/thingsboard-extension-widgets.module.ts; do
  echo "  syncing $f"
  cp "$SRC/$f" "$DST/$f"
done

echo
diff -rq \
  "$SRC/src/app/components/alarm-threshold-editor/" \
  "$DST/src/app/components/alarm-threshold-editor/" \
  && echo "alarm-threshold-editor: in sync"
diff -rq \
  "$SRC/src/app/components/haccp/" \
  "$DST/src/app/components/haccp/" \
  && echo "haccp: in sync"

if [ "${1:-}" = "--build" ]; then
  echo
  echo "==> Running yarn build in 4.3 fork"
  cd "$DST"
  yarn build
fi
