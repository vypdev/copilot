#!/bin/sh
set -eu
evidence="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
lab="$(CDPATH='' cd -- "$1" && pwd)"
mkdir "$2"
out="$(CDPATH='' cd -- "$2" && pwd)"
unset NODE_OPTIONS
export STORYBOOK_DISABLE_TELEMETRY=1
export PLAYWRIGHT_BROWSERS_PATH="$lab/browsers"
node "$evidence/prepare-observation.cjs" "$lab" "$out"
node -p 'JSON.stringify({node:process.version,v8:process.versions.v8,platform:process.platform,arch:process.arch,kernel:require("node:os").release()})' > "$out/environment.json"
cd "$lab/original"
corepack pnpm@10.34.0 --version > "$out/pnpm.version"
corepack pnpm@10.34.0 exec playwright --version > "$out/playwright.version"
node --input-type=module -e 'import { chromium } from "playwright"; const browser = await chromium.launch({ headless: true }); try { console.log(browser.version()); } finally { await browser.close(); }' > "$out/chromium.version"

for subject in original mutant; do
    cd "$lab/$subject"
    test -z "$(git status --porcelain)"
    for mode in baseline observed; do
        rm -f coverage/coverage-summary.json
        code=0
        if test "$mode" = observed; then
            BUGBOT_895_TRACE_BINDING="$out/$subject-binding.json" NODE_OPTIONS="--require=$evidence/observe.cjs" \
                corepack pnpm@10.34.0 test > "$out/$subject-$mode.log" 2>&1 || code=$?
        else
            corepack pnpm@10.34.0 test > "$out/$subject-$mode.log" 2>&1 || code=$?
        fi
        printf '%s\n' "$code" > "$out/$subject-$mode.status"
        cp coverage/coverage-summary.json "$out/$subject-$mode-summary.json"
        printf '%s %s exit %s\n' "$subject" "$mode" "$code"
    done
    test -z "$(git status --porcelain)"
done
