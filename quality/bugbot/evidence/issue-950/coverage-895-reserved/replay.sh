#!/bin/sh
set -eu
evidence="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
lab="$(CDPATH='' cd -- "$1" && pwd)"
export STORYBOOK_DISABLE_TELEMETRY=1
export PLAYWRIGHT_BROWSERS_PATH="$lab/browsers"

for subject in original mutant; do
    cd "$lab/$subject"
    test -z "$(git status --porcelain)"
    corepack pnpm@10.34.0 install --frozen-lockfile --ignore-scripts > "$lab/$subject-install.log" 2>&1
done
cd "$lab/original"
corepack pnpm@10.34.0 exec playwright install chromium --only-shell > "$lab/browser-install.log" 2>&1
for subject in original mutant; do
    cd "$lab/$subject"
    corepack pnpm@10.34.0 check > "$lab/$subject-check.log" 2>&1
    test_rc=0
    corepack pnpm@10.34.0 test > "$lab/$subject-test.log" 2>&1 || test_rc=$?
    printf '%s\n' "$test_rc" > "$lab/$subject-status"
done
node "$evidence/evaluate.mjs" "$lab"
