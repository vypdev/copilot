# SDD ownership qualification

`ownership-qualification.cjs` preserves the optional, issue-specific #856 campaign.
It is not a product command or a replacement for CI, domain validation or consumer
acceptance. The versioned evidence contains every cohort, including failed ones.

Use the repository Node/pnpm prerequisites and installed dependencies, with the
recorded Codex CLI available. This historical campaign pins its CLI path and
model/effort explicitly; it does not read consumer credentials or clone consumers.

Keep this driver and its installed dependencies in the reviewed candidate
checkout. The driver did not exist in the historical baseline commit. For the
commands below, replace `quality/sdd/ownership-qualification.cjs` with its absolute
path in that candidate checkout while running from the measured SDK checkout.
The driver uses the current working directory as SDK source; its exact offline
scoring policy stays with the candidate driver, outside the model source view.

1. On the recorded baseline `c0e7a130e06f2105034b149c0b479dc4eebc70ac`, before
   changing the measured source, run
   `node quality/sdd/ownership-qualification.cjs prepare`, then
   `node quality/sdd/ownership-qualification.cjs capture baseline`.
2. Run `node quality/sdd/ownership-qualification.cjs run baseline-1`, then
   `baseline-2` and `baseline-3`. All three attempted outputs must remain.
3. Apply the candidate source to that same checkout without changing the owned
   fixture or case expectations. Capture `candidate`, then run `candidate-1`,
   `candidate-2` and `candidate-3`. The recorded revised cohort uses `revised`
   followed by `revised-1`, `revised-2` and `revised-3`.

Preparation requires unchanged baseline source; captures and trials refuse to
overwrite earlier attempts. Capture uses the actual application use case with
in-memory ports to obtain analysis requests. Scripted stop responses create
clarification history only; they are never scored as model predictions. Runs
execute those requests through the actual SDK query composition and a matching
read-only immutable fictional Git source. Reference verdicts remain outside that
source and the model request. The probe never drafts, publishes or creates an
issue branch. Its own fictional fixture has a local Git commit only.

Artifacts live under `.tmp/bug-fix-evidence/856`. Keep the source fixture until
queries and review finish, and retain its receipt, frozen cases, captures, raw
predictions, identities and scores when retiring it. Reproduction may vary with
the provider; the historical evidence records observations, not an accuracy
guarantee. The versioned driver adds baseline preparation guards and an explicit semantic
assessment gate. Capture, query, cases and expected decisions remain unchanged.

Ownership questions never pass by keywords. After each trial, inspect every
ownership question against that case's required decision. Write
`<trial>-sdd-assessments.json` as a map from case ID to the structured assessment
shown in `evidence/issue-856-ownership-assessments.json`, binding trial, case,
response SHA-256 (`JSON.stringify(response)`), exact question ID/text, expected
intent, assessor, rationale and verdict. Conflict cases also require
`conflictIdentified: true`. Name agent assessments as such; this is neither human
approval nor native PR approval. Dates or unrelated paths must be rejected even
if their wording includes ownership-related keywords.

Run `node quality/sdd/ownership-qualification.cjs score revised-1` (or the exact
other trial) to produce a separate immutable semantic score. Missing or invalid
assessments block qualification. A focused question cannot rescue a schema- or
ownership-invalid plan. Re-scoring uses the unchanged domain parser and retained
raw responses without model calls; it does not require the historical prompt
implementation to be checked out. Original scores remain historical evidence,
not proof that the old keyword scorer enforced the declared semantic criterion.
All eighteen historical questions and all nine re-scored trials are preserved.
