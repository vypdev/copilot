# SDD ownership qualification

`ownership-qualification.cjs` preserves the optional, issue-specific #856 campaign.
It is not a product command or a replacement for CI, domain validation or consumer
acceptance. The versioned evidence contains every cohort, including failed ones.

Use the repository Node/pnpm prerequisites and installed dependencies, with the
recorded Codex CLI available. This historical campaign pins its CLI path and
model/effort explicitly; it does not read consumer credentials or clone consumers.

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
guarantee. The versioned driver adds baseline preparation guards to the measured
local driver; capture, query, cases and scoring behavior are unchanged.
