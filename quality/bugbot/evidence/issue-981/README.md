# Eight real human setup observations — #981

This is a review packet, not acceptance evidence. All eight cases remain open.
Source: ccefb27627cd627ccdb7d5666fd174c2ac1da07b. Exact package, CLI, compiled UI
and fixture script hashes are in manifest.json. The package is a local npm pack,
not a release or installation into a real repository. Historical ledger entries
are unchanged. Production verification remains disabled.

In an isolated checkout of the exact source revision, prepare dependencies from
the frozen pnpm lockfile, inspect the compiled artifact hashes in manifest.json,
then run the existing fixture (do not run setup against a real checkout):

    node scripts/serve-web-setup-journey.cjs

Use only the printed loopback URL and pairing code. The fixture has no provider
or filesystem mutation adapters. Never enter a real PAT. Both masked credential
fields accept only the literal fixture-value. Restart for every complete journey.

| Locale | Actual screen reader | Actual 200% browser zoom |
| --- | --- | --- |
| English | U076 | U077 |
| Spanish | U081 | U082 |
| French | U086 | U087 |
| Portuguese | U091 | U092 |

For every journey record a human reviewer/name, date, exact manifest/package,
OS/browser versions, locale, assistive technology/version or the browser's actual
200% indicator, and progress/error/recovery observations at all six stages:
repository confirmation, setup choices, setup PAT, plan, bot credentials, Apply
preview and final receipt. Include keyboard focus, labels and progress changes.
Try an incorrect fixture pairing code and an incorrect synthetic credential to
observe and recover from errors; then use the correct printed code/fixture-value.
Inspect the PAT link without navigating to create credentials. Apply is a fixture
preview with skipped resources. Close the local session and observe the retained
result and the closed-session indicator.

Use observation-template.json as the field guide, or reply with those facts in
chat. Do not treat DOM/ARIA assertions, screenshots alone, responsive resizing,
a partially completed journey or an agent's statement as speech/zoom evidence.
If speech or full-journey visibility is unavailable, retain that case as open
with the exact capability gap. No human result has been supplied yet.


## Acceptance and test budget

This packet reserves the eight existing manual cases, with **zero new automated
acceptance cases**. A named human and actual complete observation remain required
for each row; no row is passed by preparing this packet or validating its JSON.
The canonical ledger remains 336/350, with these eight and six platform cases open.
Existing validation: `pnpm run validate:setup-acceptance`, documentation and
applicable specification validators. Keep prior failed/unavailable observations
unchanged. Put new actual observations beside this packet first, then reconcile
only the corresponding existing ledger rows with their real provenance.

A fresh local npm pack of the frozen source was produced with ignored lifecycle
scripts; the exact tarball/CLI/UI hashes are recorded, not a published release.
The interactive fixture uses that source's compiled UI and bridge, with no real
provider ports. This packet makes no new claim about speech, zoom, another OS,
linguistic review, qualification or production readiness. BUGBOT verification
remains disabled and these manual Setup cases do not gate Linux Bugbot.

Validation retains the first documentation attempt, which began before dependency installation completed and failed to load js-yaml. The sequential retry after installation passes. Acceptance validation confirms the unchanged 336/350 ledger and 14 open cases; specification validation passes. These checks supply no speech or zoom observation.
