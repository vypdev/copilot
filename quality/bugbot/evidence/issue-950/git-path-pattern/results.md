# #895 deterministic Git path pattern controls

Both new search modes located and delivered the effective configuration on
both pinned trees. The four controls used a simulated verifier with zero model
calls and zero GitHub write attempts. The original and mutant receipts covered
the Storybook project and the effective coverage configuration. On the mutant
the fragment also covered the override of the coverage exclusion. The second
turn accepted those receipts alongside all ten lock-authenticated dependency
receipts.

## Search contract

The application matches the pattern against regular blob paths from the
pinned Git tree. Each pattern is case-sensitive and matches the entire path
relative to the target's authorized directory scope. Use the empty string for
an authorized root. The existing single-dot alias still applies only to
searches whose binding already authorizes the root.

| Mode | Example query | Interpretation |
| --- | --- | --- |
| `name` | `"settings.ts"` | Exact basename including its extension when present. A wildcard character is literal. |
| `pathPattern` | `"config/*-local?.json"` | Filter paths by pattern. A unique matching text blob can provide a receipt. |
| `literal` | `"loadSettings("` | Search file content within the authorized scope. |
| `literal` with filter | `{"text":"loadSettings(","pathPattern":"src/*.ts"}` | Filter paths before opening blobs, then search the selected blobs for exact text. |

Within one segment, `*` matches zero or more characters and `?` matches
one Unicode code point. The slash separates segments. Other characters
are literal. The grammar rejects consecutive stars, absolute paths,
backslashes, drive prefixes, empty segments, `.`, `..` and `.git` segments.
A wildcard cannot leave the scope, cross a slash or admit protected paths
excluded by the Git listing rules. For both pattern forms, set `workspace`
to null and specify the directory via `scope`. The request schema and the
verifier instructions include generic examples. The request can have up to
three search targets. Each pattern is capped at 120 UTF-8 bytes.

The filter runs after the existing bounded tree listing and before reading
any candidate blob. It cannot reduce the tree listing charge. The common
caps remain 4,096 tree entries, 512 KiB of listing output, 80 opened files,
16 matches, 96 KiB per blob, 512 KiB scanned, five receipts, and 9,000 bytes
of serialized evidence. The source deadline is four seconds, with up to
1.5 seconds per Git call. Each fragment is limited to 80 inclusive lines
and 4,400 UTF-8 bytes. The final package and prompt remain capped at 15,500
and 21,500 bytes.

A completed filter with no matching paths returns `absent`. Too many
filtered paths returns `search-file-budget` before any matching files
are opened. An ambiguous match returns the matching paths without claiming
that any one file is decisive. A truncated listing or scan yields a
budget result. A later target that exceeds a limit can leave a previously
valid receipt in a `partial` result. The pinned path, blob and line range
must still validate before a receipt can enter the second turn.

## Pinned control results

These four authored requests are separate from the 17 measured-pilot
requests. All four used the authorized root and the pattern `*vitest*`.
The filtered literal uses the exact text `storybookTest(` from the
historical pilot. The candidate and its anchor at `tooling/coverage.mjs:14`,
the operation, the tree and the initial evidence were preserved.
The initial package withheld the configuration.

| Tree | Mode | Filtered paths | Files opened | Delivered and cited | Fragment bytes | Final package bytes | Final prompt bytes |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| Original `fc143a7f` | `pathPattern` | 1 | 1 | `vitest.config.ts:1–15` | 2,063 | 13,766 | 14,595 |
| Original `fc143a7f` | Filtered `literal` | 1 | 1 | `vitest.config.ts:1–15` | 2,063 | 13,766 | 14,595 |
| Mutant `06145cbe` | `pathPattern` | 1 | 1 | `vitest.config.ts:1–24` | 2,563 | 14,275 | 15,104 |
| Mutant `06145cbe` | Filtered `literal` | 1 | 1 | `vitest.config.ts:1–24` | 2,563 | 14,275 | 15,104 |

The simulation uses the runner's actual final package and citation schema.
The application validates the Git receipt against the candidate, operation,
head and tree, and validates the dependency receipts against the lockfile
and resolved package versions. The control independently checks the Git blob,
range and text digest. It then checks that the second turn received and
could cite all 14 aliases.

On each tree, a missing pattern yielded zero matching paths and zero opened
files. The broad `*/*/*` pattern filtered to 123 paths and returned the
file-budget result with zero opened files in both modes. The controls also
cover an ambiguous pattern, truncated tree and match budgets, unsafe paths,
the root alias under a subdirectory-only binding, and preservation of a
valid receipt when another target hits a budget.

The 17 historical inputs produced exactly the same per-request admission,
Git outcome, receipt and final delivery record as
[`98654c7f8`](../git-request-replay/results.md). They still have zero decisive
deliveries. An exact `name` lookup still returns the same receipt for
`vitest.config.ts`, while `name` with `*vitest*` still has no match.
The versioned common adapter preserves the engine used by the frozen pilots.

## Reproduction

Prepare the [pinned trees and archives](../coverage-895-reserved/results.md#reproduce).
Use Node 24 and the locked Copilot development dependencies.

```sh
BASE=quality/bugbot/evidence/issue-950
node "$BASE/git-request-replay/replay.cjs" "$LAB" "$LAB/archives" > "$LAB/legacy-replay.json"
cmp "$LAB/legacy-replay.json" "$BASE/git-request-replay/replay.json"
node "$BASE/git-path-pattern/replay.cjs" "$LAB" "$LAB/archives" > "$LAB/path-pattern-replay.json"
cmp "$LAB/path-pattern-replay.json" "$BASE/git-path-pattern/replay.json"
```

The [control record](replay.json) includes the exact requests, filtered
path counts, Git usage, validated receipts and the packet and prompt hashes.
The controls demonstrate deterministic delivery. A future pilot can measure
which requests the models formulate with the new contract.
