# #950 pilot report

The [measured v2 report](results-v2.md) supersedes this preparation record.

**Status: unqualified.** The six repository subjects and seven replay hypotheses
are frozen. All three local paired controls reproduced the intended contrast.
The planned model comparison remains unexecuted. No production setting is
qualified.

## Baseline and native evidence

- On 2026-11-09 the GitHub connector resolved `develop` to
  `b3952f686a55a9b4207e1a23c64be8344e8df5d5`. Comparing it with
  `ace49e4a7ce0f6a007fef5d11479eb9b7a5846e3` returned zero changed paths.
  The local test used the audit tree. GitHub reports the cached development
  tip differs from the live one only in the package version.
  [GitHub comparison](https://github.com/vypdev/copilot/compare/ace49e4a7ce0f6a007fef5d11479eb9b7a5846e3...b3952f686a55a9b4207e1a23c64be8344e8df5d5)
- At #914 the historical Copilot job logged complete context, 14 planned
  partitions and two of two candidates retained by generated-source verification.
  Telemetry identified Luna and the analyzed head `878a73b5`. This predates
  the selected SDK comparison and belongs to historical evidence.
  [Native review job](https://github.com/vypdev/domus/actions/runs/42294011038/job/128154445982)
- At #914 the ARM64 product job executed `uv run pytest tests/containers --no-cov`
  and reported **42 passed**. It used frozen dependency sync and checked out
  synthetic merge `a76a8629c65499e5eb601abd83cdb3503179142e`. GitHub reports zero
  changed paths between the reviewed source and that checkout. The local
  signature and collection oracle used the exact reviewed source directly.
  [ARM64 job](https://github.com/vypdev/domus/actions/runs/42294011539/job/128154446414) ·
  [Source comparison](https://github.com/vypdev/domus/compare/878a73b5f06629fa028a2daed87268b717765e45...a76a8629c65499e5eb601abd83cdb3503179142e)
- At #898 the original ha-ui review telemetry identified `e3f49b5c` and
  reported partial context coverage. The local semantic reproduction uses that
  exact source independently of historical coverage.
  [Native review job](https://github.com/vypdev/ha-ui/actions/runs/41982640540/job/127096027436)
- At #919 the later probe fixture came from `e222212c`. The entire `backend`
  subtree was byte-identical to reviewed head `3d890522`. This is a later
  reproduction with the original runtime source. The roadmap correction in the
  same commit addresses a separate real finding.
  [Later evidence commit](https://github.com/vypdev/domus/commit/e222212cda04890fb60831c9c3fad22ff04f8a2b)

## Deterministic paired controls

| Case | Reviewed behavior observed locally | Positive control observed locally |
|---|---|---|
| #898 | Node 24.20.0 accepted four supplementary values and rejected lone high/low surrogates and U+0085. | Removing `u` rejected all four valid supplementary values. |
| #914 | pytest 9.2.0 excluded the default in both actual signatures. The original suite collected 42 tests. | The mutated listener signature includes a required unresolved fixture. An isolated pytest setup probe reported the expected missing fixture. |
| #919 | Both date-only and timed SQLite snapshot/restore tests passed on reviewed backend bytes. Both rejected preview before planning, including after storage reopened. | Removing the earlier guard made both tests fail with the expected “DID NOT RAISE Conflict”, proving that the preview passes the expected rejection. |

The first local #919 attempt failed before reaching the claim because the
Python environment lacked pinned `tzdata`. An alternate environment lacked
pytest. The final run used Python 3.14.6, pytest 9.2.0, SQLite 3.53.3 and
`tzdata` 2026.6 with its 2026f data. The [control log](controls.txt) records the measured run.
No Docker image was launched locally.

## Model comparison

Each row has 36 planned trials across both phases. A blank measurement is shown
as “unmeasured”. The model access probes are separate from these trials.

| Model | Variant | Completed / planned | Unsupported findings | Real defects retained or missed | Inconclusive | Latency and usage |
|---|---|---:|---|---|---|---|
| GPT-6 Luna | Current | 0 / 36 | Unmeasured | Unmeasured | Unmeasured | Unmeasured |
| GPT-6 Luna | Original context | 0 / 36 | Unmeasured | Unmeasured | Unmeasured | Unmeasured |
| GPT-6 Luna | Application evidence | 0 / 36 | Unmeasured | Unmeasured | Unmeasured | Unmeasured |
| GPT-6.1 Sol | Current | 0 / 36 | Unmeasured | Unmeasured | Unmeasured | Unmeasured |
| GPT-6.1 Sol | Original context | 0 / 36 | Unmeasured | Unmeasured | Unmeasured | Unmeasured |
| GPT-6.1 Sol | Application evidence | 0 / 36 | Unmeasured | Unmeasured | Unmeasured | Unmeasured |

The initial local Codex CLI 0.167.0-alpha.3.2 probes could not initialize under
the session sandbox. The approved retry used an empty temporary directory, a
fixed non-project string, read-only mode and disabled tools. Both configured
models returned READY and token usage. These probes establish access only.
See the [successful access probes](provider-canaries.json) and [216-slot ledger](trial-ledger.jsonl). There were
no pilot GitHub writes. The controlled write-port assertion still needs the
real repository-shaped runner. The historical false positives do not count as
baseline pilot trials, and the cohort-expansion rule awaits baseline results.

## Verification and handoff

The seed passed the pinned Action's local Markdown and consistency validators against all 11 owning specifications and the immutable tree. Five existing suites covering generated-source verification, framed review, reconciliation and benchmark behavior passed **250 tests** on the audit tree. These cover the baseline. The SDD defines 30 additional acceptance scenarios, which remain planned.

On the managed branch the revised appendix passed immutable owner, path and
case mapping validation. Specification generation and validation, documentation
validation, and all 134 cases in `pnpm run eval:bugbot` passed. The frozen Git
subject identities reproduced exactly and all three paired controls passed
again. These checks do not substitute for the 216 model trials.

1. The Action published and verified the SDD in [80407b7](https://github.com/vypdev/copilot/commit/80407b7e1abe665dbd57af436ae42a825e97e9fd) on the exact managed branch. The initial automatic draft failed the requirement mapping validator. The authorized seed passed the same publication gate.
2. On the managed branch, build the dry-run runner with frozen replay injection
   and fail-on-call SCM write ports. Use an approved provider environment,
   verify both exact model routes, then run replay followed by full review.
3. Score the paired and unchanged quality corpora. Record failures and expansion
   when applicable. Only then fix production verifier defaults, hard limits and
   rollout in the SDD. Ship the implementation, 30 deterministic acceptance
   cases and final-head verification in the linked PR.

### Reproduce the controls

Run from this pilot directory with local Git object stores for the two product
repositories and a prepared Python runtime with the frozen pytest dependencies.

```sh
python3 freeze-subjects.py /path/to/ha-ui /path/to/domus | diff -u subjects.lock.json -
bash reproduce-controls.sh /path/to/ha-ui /path/to/domus /path/to/python /path/to/unpacked-tzdata-2026.6
```

The final argument is an unpacked package root containing `tzdata/` and
`tzdata-2026.6.dist-info/`. Provision it from the locked wheel in the manifest.
Run the read-only probes with the pinned tools in an approved isolated shell.
The reproduction scripts write only temporary snapshots and scratch Git
objects, then discard them. See the [preregistration](preregistration.md) and
[traceability matrix](traceability.md).
