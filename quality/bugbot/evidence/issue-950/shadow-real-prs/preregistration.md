# #950 shadow review of real pull requests

Replay the deployed detector's published snapshots with a live, independent
verifier. Select one complete snapshot from each of four distinct consumer PRs
traced to #950. Cover a cross-file schema premise, a dependency API, a backend
branch and native browser behavior. Include all comments in the selected
review, including two documentary defects. Add a fifth distinct PR with an
exact-head, successful no-findings check. This is a purposive historical
sample and cannot estimate production recall or false-positive rate.

| PR | Reviewed head | Comparison base | Historical detector output |
| --- | --- | --- | --- |
| [Domus #24](https://github.com/vypdev/domus/pull/24) | `e129e76e2` | `4b71969d3` | 2 in review 5737841763 |
| [Domus #28](https://github.com/vypdev/domus/pull/28) | `b9a2dfc81` | `8b1cbc110` | 1 in review 5749670508 |
| [Domus #29](https://github.com/vypdev/domus/pull/29) | `3d8905220` | `5b7bdcdee` | 2 in review 5810052916 |
| [HA UI #10](https://github.com/vypdev/ha-ui/pull/10) | `55174696e` | `d885bccf2` | 2 in review 5776481669 |
| [Domus #31](https://github.com/vypdev/domus/pull/31) | `82b7e0f72` | `0170085f2` | 0 in check 128108103928 |

[The cohort manifest](cohort.json) binds full commits, both trees, producer,
review and inline comment IDs. The GitHub review's `analyzed_head`, review
commit, original inline commit and check or workflow head agree. The fifth
check reports `no-findings` for PR #31 and has no verifier session. The handoff
contains the neutral hypothesis, anchor and SHA. It excludes the detector's
reasoning, suggested fix, confidence and historical resolution. The exact
detector location in the body stays fixed. GitHub's inline placement is kept
separately. The pinned PR comparison is verified to be the merge base. Only
the hypothesis explicitly referring to a base source receives base access.

## Sessions and limits

GPT-6.1 Sol uses low effort and one fresh closed Codex session per finding,
resumed for successive broker observations. Run the seven findings in manifest
order in batches of up to three, with no retries. Per finding, allow eight
turns, 36 tool actions, 260 seconds, 200,000 gross input tokens and 10,000
output tokens. Each turn gets at most 46 seconds. Brokered evidence is capped
at 75,000 bytes total and 18,000 bytes per fragment. Each Git operation has a
four-second limit. Record technical failures, budget exhaustion, unknown usage
and integrity failures. Historical detector calls are reused, so new detector
cost is zero and historic detector token usage is unavailable.

The application exposes exact Git reads over remote-free bare copies, including
unchanged files, and a small read-only official source catalog. A dependency
lookup requires evidence of the version from a lockfile or runtime. The
verifier chooses the query and records the doubt that prompted it. Playwright
docs and source are pinned to v1.64.1. SQLite source matches the locally
measured Python/SQLite combination. That measurement does not identify the
SQLite linked into the historical hosted runner. The provider has no shell or
write tools. The app's GitHub write ports throw. [Official sources](official.json)

## Scoring

Validate citations against delivered source, the candidate, authorized SHA and
exact inclusive range. Re-read Git blobs to confirm cited lines. Confirm only
with the actual route and effect. Refute only with concrete counterevidence.
An inconclusive verdict must name a material unknown. Separate technical
failures and unsupported conclusions from accepted judgments. Credit off-diff
investigation when unchanged source proves a material premise. Credit official
source when it is cited and tied to the effective version. Keep the independent
[scoring key](evaluation-key.json) outside the verifier. Historical thread
resolution alone is insufficient. This pilot does not qualify activation.

## Reproduction

Create remote-free bare copies `domus.git` and `ha-ui.git` under `$LAB` with
every head and base in the manifest and Domus correction
`e222212cda04890fb60831c9c3fad22ff04f8a2b`. Download the three immutable
release files from the raw URLs in `official.json` to the listed filenames.
The local probe uses Python 3.14.6 and SQLite 3.53.3.

```sh
pilot=quality/bugbot/evidence/issue-950/shadow-real-prs
(cd "$pilot" && shasum -a 256 -c frozen.sha256)
node "$pilot/control.cjs" "$LAB" > /tmp/shadow-real-prs-controls.json
cmp "$pilot/controls.json" /tmp/shadow-real-prs-controls.json
node "$pilot/run.cjs" "$LAB" --run "$OUT" "$(git rev-parse HEAD)"
```

The first three commands use zero model calls. The last command runs the
measured sessions from a clean preregistration checkout. The write trap canary
runs locally with a throwing mock port. No evaluated PR receives a write.
