# #895 deterministic Git request replay

The unmodified runner at `10c9e80aa` reproduced all 17 recorded denials
on the pinned [original and mutant trees](../coverage-895-reserved/results.md).
All 16 Sol searches failed with `scope-denied`. Luna's single request
failed with `request-shape`.

The [versioned adapter](adapter.cjs) admitted all 16 Sol searches after
normalizing their search scopes from `"."` to `""`. Seven searches had no
exact basename match. Seven exceeded the file budget for literal search.
Two had both outcomes and returned `unresolved`. The Luna request still
failed because it supplied three files to `readBlob`.

**Historical requests with decisive evidence recovered and delivered: 0/17.**
The 16 admitted requests all reached the simulated second turn with their
Git status and the 13 initial receipts, including 10 authenticated dependency
fragments. They returned zero new Git receipts. The largest final packet was
11,597 bytes and its prompt was 12,426 bytes, within the 15,500/21,500 byte caps.
The runner recorded zero GitHub write attempts and made zero model calls.

## Historical requests

The rows follow the [frozen ledger](../coverage-895-pilot/trials.jsonl).
The [replay record](replay.json) includes each complete original and
normalized request, per-target results, budgets, and hashes of the packets
and prompts actually passed to the simulated verifier. Each Sol target
originally used the dot scope. `name` compares an exact basename and
`literal` compares text in file contents. The root has 660 entries in both
trees. The literal targets exceeded the 80-file cap before any blobs were
opened.

Requests from the fixed and repeat arms use a counterfactual Git replay.
Those arms did not run Git in the measured pilot. The replay leaves their
historical classification unchanged.

| Trial | Original targets in order | Before | After admission | Git outcome in order | Decisive delivery |
| --- | --- | --- | --- | --- | --- |
| `original/1/fixed/Sol` † | `name *vitest*` | `scope-denied` | Admitted | `absent` (`path-absent`) | No |
| `original/1/repeat/Sol` † | `name *vitest*` | `scope-denied` | Admitted | `absent` (`path-absent`) | No |
| `original/1/on-demand/Sol` | `literal completeCoverage`, `literal storybookTest(` | `scope-denied` | Admitted | `budget` (`search-file-budget`, `search-file-budget`) | No |
| `mutant/1/repeat/Luna` † | `tooling/coverage.mjs:1–56`, `vitest.config.mjs:1–80`, `tests/coverage-evidence.test.mjs:1–30` | `request-shape` | `request-shape` | — | No |
| `mutant/1/repeat/Sol` † | `name vitest` | `scope-denied` | Admitted | `absent` (`path-absent`) | No |
| `mutant/1/on-demand/Sol` | `literal completeCoverage`, `literal storybookTest` | `scope-denied` | Admitted | `budget` (`search-file-budget`, `search-file-budget`) | No |
| `original/2/repeat/Sol` † | `name *vitest*`, `literal completeCoverage(` | `scope-denied` | Admitted | `unresolved` (`path-absent`, `search-file-budget`) | No |
| `original/2/on-demand/Sol` | `name *vitest*` | `scope-denied` | Admitted | `absent` (`path-absent`) | No |
| `original/2/fixed/Sol` † | `name *vitest*` | `scope-denied` | Admitted | `absent` (`path-absent`) | No |
| `mutant/2/repeat/Sol` † | `literal completeCoverage`, `literal storybookTest(` | `scope-denied` | Admitted | `budget` (`search-file-budget`, `search-file-budget`) | No |
| `mutant/2/fixed/Sol` † | `literal completeCoverage`, `literal storybookTest` | `scope-denied` | Admitted | `budget` (`search-file-budget`, `search-file-budget`) | No |
| `original/3/on-demand/Sol` | `literal completeCoverage`, `literal storybookTest` | `scope-denied` | Admitted | `budget` (`search-file-budget`, `search-file-budget`) | No |
| `original/3/fixed/Sol` † | `name *vitest*` | `scope-denied` | Admitted | `absent` (`path-absent`) | No |
| `original/3/repeat/Sol` † | `name *vitest*`, `literal completeCoverage(` | `scope-denied` | Admitted | `unresolved` (`path-absent`, `search-file-budget`) | No |
| `mutant/3/on-demand/Sol` | `name *vitest*` | `scope-denied` | Admitted | `absent` (`path-absent`) | No |
| `mutant/3/fixed/Sol` † | `literal completeCoverage`, `literal storybookTest(` | `scope-denied` | Admitted | `budget` (`search-file-budget`, `search-file-budget`) | No |
| `mutant/3/repeat/Sol` † | `literal completeCoverage(`, `literal storybookTest(` | `scope-denied` | Admitted | `budget` (`search-file-budget`, `search-file-budget`) | No |

† Counterfactual replay of a request from a historical control arm.

## Separate deterministic controls

These inputs were authored for validation and are excluded from the 17
historical requests. The exact-basename search from root and the one-file
read both deliver the decisive Git fragment on both trees. An exact match
paired with an absent name returns `partial` and keeps the valid receipt.
The verifier simulated a citation of every delivered alias. The runner
validated Git receipts against the pinned path, blob, range, candidate,
operation, head and tree. Each final packet retained the ten dependency
receipts validated against the lockfile and resolved package versions.

| Tree | Valid request | Git status | Decisive range | Final packet bytes | Final prompt bytes |
| --- | --- | --- | --- | ---: | ---: |
| Original | One-file read | `provided` | `vitest.config.ts:1–15` | 13,766 | 14,595 |
| Original | Root exact name | `provided` | `vitest.config.ts:1–15` | 13,766 | 14,595 |
| Original | Root exact name + absent name | `partial` | `vitest.config.ts:1–15` | 13,808 | 14,637 |
| Mutant | One-file read | `provided` | `vitest.config.ts:1–24` | 14,275 | 15,104 |
| Mutant | Root exact name | `provided` | `vitest.config.ts:1–24` | 14,275 | 15,104 |
| Mutant | Root exact name + absent name | `partial` | `vitest.config.ts:1–24` | 14,317 | 15,146 |

Other controls cover the model response schema and application validation,
including the one-target read shape, one-to-three search targets, null fields
for the other mode, and the distinction between basename and literal queries.
They verify that both models have the same prompt and schema within each tree,
that the package withholds the configuration, and that root normalization
never grants access under a subdirectory-only scope or applies to `readBlob`.
Absolute paths, parent traversal and `.git` paths are denied. An inclusive
80-line read is admitted, 81 lines exceeds the line cap, and a 74-line read
over 4,400 UTF-8 bytes returns `fragment-byte-budget`. A wildcard-like basename
returns `path-absent` and a broad literal query returns `search-file-budget`.
All simulated deliveries ran with fail-on-use GitHub write ports.

## Reproduction

Prepare `$LAB/original`, `$LAB/mutant` and `$LAB/archives` using the
[reserved fixture commands](../coverage-895-reserved/results.md#reproduce).
Run from the Copilot checkout with the locked development dependencies
installed and Node 24.

```sh
REPLAY=quality/bugbot/evidence/issue-950/git-request-replay
node "$REPLAY/replay.cjs" "$LAB" "$LAB/archives" > "$LAB/git-request-replay.json"
cmp "$LAB/git-request-replay.json" "$REPLAY/replay.json"
```

The replay verifies the previous pilot's freeze checksums and ledger bytes
against `10c9e80aa` before running the historical and corrected adapters.
The versioned prototype and the report preserve that pilot's files. These
controls show that correctly scoped requests can deliver the evidence.
The historical inputs still contain exact basenames that do not exist,
literal searches too broad for the file cap, or a read with too many targets.
The PR stays in draft with production activation disabled. A measured rerun
remains a separate decision.
