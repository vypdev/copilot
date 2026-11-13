# #895 verdict contract and coverage-chain audit

This iteration made zero model calls. The successor verdict contract passed
100 simulated calls across the pinned trees with zero runner write attempts.
The two historical rejections keep their original generic code and remain
indeterminate. The coverage audit reproduced the actual command on both
trees and distinguished the executed-source route from the untested-file
route.

**Source establishes the configured route and its conditions. Execution
evidence is needed to establish the actual CSF key after transformation,
remapping and report generation.** The current evaluator observations remain
outside model packets.

[Contract controls](contract-controls.json) · [Execution and source audit](audit.json) ·
[Baseline and observed artifacts](execution/) · [Contract implementation](verdict.cjs) ·
[Successor runner](runner.cjs)

## Verdict contract

The fixed limits in `verdict.cjs` supply both the instructions and the
application validator. The transport schema describes the four allowed
fields and their types, enumerates the verdict and delivered citation aliases,
and rejects extra fields. UTF-8 byte counts and verdict-dependent semantics
are checked by the application. These limits have no configuration override.

| Field | Application contract |
| --- | --- |
| `reason` | Nonempty string, one line, at most 1,400 UTF-8 bytes. |
| `missing` for `inconclusive` | Nonempty string, one line, at most 800 UTF-8 bytes. |
| `missing` for `confirmed` or `refuted` | `null`. |
| `citations` | Array of unique delivered aliases. A conclusive verdict requires at least one. The application revalidates every cited receipt. |

The prototype uses the frozen lifecycle packet and its receipt validator.
It preserves the candidate, operation, head, tree, anchor, version, lockfile
and source-membership checks. The source packet and aliases have the same
hashes as the lifecycle replay. Only the successor's prompt, schema generation
and response diagnostics change. All frozen pilot files remain intact.

| Rejected check | Safe code and field |
| --- | --- |
| Absent required field | `missing-field`, required field name |
| Extra field | `additional-field`, `$` |
| Invalid top-level or field type | `invalid-type`, field |
| Unknown string verdict | `invalid-verdict`, `verdict` |
| Empty or whitespace-only text | `empty-text`, `reason` or `missing` |
| Line separator in text | `line-break`, text field |
| UTF-8 byte overflow | `byte-limit`, field, measured `bytes` and `limit` |
| String `missing` on a conclusive verdict | `missing-must-be-null`, `missing` |
| Missing, foreign or repeated citation | `citation-required`, `citation-foreign` or `citation-duplicate` |
| Receipt bound to another candidate, operation or revision | Existing receipt-specific code and generated citation index |

A rejected response leaves `answer` null. The journal retains the code,
field and numeric size metadata, plus transport facts and prompt hashes.
It never retains the rejected body or an untrusted extra-field name.
For example, a boundary failure renders in the technical record as

```json
{"stage":"verdict","code":"byte-limit","field":"reason","bytes":1401,"limit":1400}
```

The controls include required and additional fields, types, verdicts, empty
text, eight newline forms, missing/null semantics, citations and identity.
They test the exact boundary and one byte above for ASCII, two-byte and
four-byte Unicode characters in both text fields. Rejection journal tests
assert that the marker and oversized rejected strings do not appear.
The diagnostic tests use the actual successor runner and a simulated
transport. The write-port canary is separate from the zero-write calls.

## Bound execution

| Item | Value |
| --- | --- |
| Original | `fc143a7fce3e6d50647804f29b0ed0af27fa0e32` |
| Mutant | `06145cbe19f52fa5b9c61fecd381bcbe36421241` |
| Shared lockfile | `pnpm-lock.yaml`, blob `afb6382151504e0b51896d61477f967263ec6f48` |
| Vitest and V8 provider | `vitest@5.1.0`, `@vitest/coverage-v8@5.1.0` |
| Storybook adapter | `@storybook/addon-vitest@10.6.5` |
| JSON reporter | `@vitest/istanbul-lib-report@2.1.0` |
| Command | `vitest run --coverage && node --test tests/coverage-evidence.test.mjs` |
| Runtime | Node 24.20.0, V8 13.6.233.17-node.53, pnpm 10.34.0, macOS arm64 |
| Browser | Playwright 1.64.1, Chromium headless shell 156.0.8078.4 |

The [audit](audit.json) binds each step to source receipts with lock integrity,
package version, exact member hash, Git blob and range, candidate and reviewed
tree. It records the raw report, normalized report, log, status and trace
hashes. Both baseline commands ran on clean pinned trees. Both produced 54
passing test files and 1,155 passing tests. The original command exited zero.
The mutant reached the unchanged inventory through `&&` and exited one.

The raw command logs are stored as deterministic `.log.gz` artifacts. Their
recorded hashes refer to the original decompressed bytes. The audit accepts
both fresh raw logs and the published compressed form.

The observer applies unique in-memory patches only after checking the exact
three dependency member hashes. It records the original and observed module
hashes. It leaves the checkout and installed package files unchanged.
The observed commands had the same outcomes and identical normalized report
contents as the uninstrumented commands. These are local evaluator probes.

## Chain by link

Each dependency range below has an authenticated receipt in `audit.json`.
The same record contains each Git blob and all artifact hashes.

| Link | Authenticated source establishes | Observed original / mutant | Remaining limitation |
| --- | --- | --- | --- |
| Concrete CSF | `stories/button.stories.ts:1–13` supplies metadata, default export and named stories. `.storybook/main.ts:2–5` selects the CSF glob. | The target is a collected `storybook (chromium)` specification in both trees. | Source existence alone does not prove a transformed coverage entry. |
| Story glob to test include | Addon `dist/vitest-plugin/index.js:2631–2636,2685–2689` normalizes story paths and includes them. | Browser V8 coverage supplies the target as a collected-script input in both trees. | The execution observation establishes this run's input. |
| Resolve initial exclusion | Vitest `index.Di8au7q4.js:9349–9350,7358,8802–8805,8993–9004` resolves projects, shares coverage and appends test includes. | Before hooks, both contain `stories/**/*.stories.ts`. | This observation does not assert that every project has the same options in all runs. |
| Await the hook | Vitest `cli-api.COfZo8lK.js:12946–12970` waits for the plugin hooks. The tracked mutant hook rewrites the story exclusion. | Original retains the story glob. Mutant changes it to `stories/**/!(button).stories.ts`. | Hook effects must be established for the particular reviewed configuration. |
| V8 reads effective options | `cli-api.COfZo8lK.js:13130–13137,6957–6983` initializes the provider and reads the effective options. The previous lifecycle receipts bind normal CLI startup order. | Provider options occur after the hooks and contain the original / rewritten exclusion. | The observer verifies the particular initialized option state. |
| Executed-source filtering | V8 `provider.js:267–315` normalizes the browser URL, checks inclusion, retrieves sources and remaps. Vitest `cli-api.COfZo8lK.js:6991–7029` applies exclusion before inclusion. | Original input is excluded. Mutant input is admitted in the client environment. | Admission alone is insufficient if transform or remap drops the path. |
| Remap and merge executed coverage | V8 `provider.js:305–306,65–70` remaps executed scripts and merges the converted map. | Mutant remap output contains the story and the merged map retains it. Original has neither target remap nor target merge. | The generic source allows parse/transform failure and different mapped paths. This run supplies the positive observation. |
| Untested-file alternative | Vitest `cli-api.COfZo8lK.js:7031–7046` excludes tested files. V8 `provider.js:122–167,76–79` converts uncovered files with an empty function list and merges them. | Original is excluded from uncovered candidates. Mutant is already in the tested map and is absent from uncovered candidates. Neither uncovered map adds the target. | An untested-only story route is possible under those guards but was not exercised for this target. |
| Final map and writer | V8 `provider.js:81–112` checks existence and optionally filters after remap, then executes reporters. JSON summary `index.mjs:3–19` writes the file path as a key. | `excludeAfterRemap` is false. Original has no story key. Mutant final map and writer retain it. | The actual key and summary bytes are execution facts. |
| Inventory rejection | `package.json:11` chains the stages. `tests/coverage-evidence.test.mjs:7–11` omits CSF from expected runtime files and calls `coverageProblems`. `tooling/coverage.mjs:33–41` rejects unexpected report keys. | Original passes. Mutant reports the unexpected story key and incomplete aggregate branch coverage. | The CSF omission applies to the expected inventory. The comparison consumes every supplied report key. |

The observed sequence is

```text
resolve project exclusions
  -> await configureVitest
  -> initialize V8 with resulting options
  -> collect browser coverage
  -> filter executed source
  -> remap and merge executed coverage
  -> skip target in untested-file candidates
  -> retain target in final map
  -> write JSON summary key
  -> reject unexpected key in inventory
```

The mutant summary has `total` plus 53 files, versus 52 files in the
original. The sole extra key is the absolute path ending in
`stories/button.stories.ts`. Its metrics are 2/2 lines, 13/13 statements,
7/7 functions and 2/4 branches. All 52 runtime entries are identical.
The original has no corresponding key. The mutant's unchanged inventory
also rejects the resulting aggregate branch percentage.

## Minimum execution artifact for a later diagnostic

A future diagnostic claiming that the actual summary contains the CSF key
needs a bounded execution receipt in addition to the source. The existing
`readExecution` concept can carry such an artifact only under the selected
profile's authorization. This iteration proposes an evaluator projection.

The minimum projection should bind repository, full head and Git tree,
lockfile blob and digest, resolved package versions, environment, the exact
command and working-directory identity, producer/run identity, completion,
coverage-stage and inventory-stage exits, and artifact hashes. It should
project the normalized target key, presence, metrics, aggregate delta and
bounded inventory diagnostics from the raw report and log. It should retain
the raw artifact digests and an authenticated producer link so the application
can recompute the projection and reject another SHA, command or lockfile.

For a claim about which route produced the entry, the receipt also needs
the executed-filter/remap/merge observations or the untested-candidate/remap
observations, plus the effective exclusion after hooks and before provider
initialization. The observer script and module hashes must identify how these
observations were acquired. The summary alone does not identify that route.

A completed, matching execution can support the concrete observed report
claim. A missing, canceled, stale or unavailable artifact leaves that claim
inconclusive. A raw log without verified origin is insufficient. This local
observer transcript has evaluator provenance and is not a native CI receipt.
Results and expected verdicts remain with the evaluator in this iteration.

## Reproduction

Use the [existing pinned installations and archives](../coverage-895-reserved/results.md#reproduce),
Node 24.20.0 and pnpm 10.34.0. Run from the repository root with absolute
`$LAB` and a fresh absolute `$OUT`. The fixture must be clean.

```sh
EVIDENCE=quality/bugbot/evidence/issue-950/coverage-895-contract-audit
node "$EVIDENCE/contract-control.cjs" "$LAB" "$LAB/archives" > "$OUT-contract.json"
cmp "$OUT-contract.json" "$EVIDENCE/contract-controls.json"
sh "$EVIDENCE/replay.sh" "$LAB" "$OUT"
node "$EVIDENCE/audit.cjs" "$LAB" "$OUT" > "$OUT-audit.json"
```

The audit fails on changed dependencies, unmatched observer sites, wrong
order, different observed/baseline report content, missing JSON keys,
incorrect inventory outcomes, or changed runtime entries. Fresh execution
logs and absolute report keys may differ by checkout and timing. Compare
the normalized content, keyed presence and stated invariants across runs.

The two historical `final-response-shape` failures remain indeterminate.
This iteration qualifies no model. The PR remains in draft and production
activation remains disabled.
