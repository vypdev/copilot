# SDD ownership qualification

## Managed publication qualification (#763)

Generate the fixture with `node quality/sdd/qualification-763.cjs <new-directory> <candidate-commit>`.
The `repo` directory contains the standard Feature Request form, issue and
issue-comment workflows pinned to the candidate, and a synthetic immutable owner
above 70,000 characters. The `requests` directory contains the exact issue
bodies and digests and stays outside the consumer checkout. Use a private
disposable consumer with `PRE_BRANCH_SDD=true`, the normal development base,
and the normal authorized Action identity and provider credentials.

1. Start the autonomous and large issues using the standard `feature` and
   `in-progress` labels. Start the seed issue after submitting the exact review
   command in the manifest. Only the seed issue needs the receipt reply shown
   on the gate's card. Confirm there is no linked branch before that approval.
2. On each issue, retain the candidate SHA, issue and run URLs, exact base SHA,
   linked branch, first commit and staged path list. Check the published owner
   starts with every byte of the base owner and independently check every case
   row and both reciprocal links for each case against the issue input.
3. Rerun the original issue workflow for each route and verify the same first
   commit and the same bytes. An ordinary issue-triggered run that skips the
   SDD gate or fails before publication does not qualify.

The fixture captures the scale and shape of Domus #30 without copying its
private repository content. Use the exact incident inputs for a separate
private regression. Local bare Git publication and provider probes do not
substitute for GitHub Actions publication evidence.

## Historical ownership qualification (#856)

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


An absent or invalid provider response is recorded as an invalid plan before
question access or response hashing. The module exports its actual assessor for
side-effect-free regression tests; importing it never starts a campaign. The
source-bound tests exercise missing/null/primitive/malformed responses and valid
object/string controls separately from the historical model observations.


The separate working-branch supplement is documented in
`evidence/issue-856-working-branch.json`, including all fifteen frozen scenarios,
all baseline and candidate cohorts, exact source/request identities, explicit
question assessments and limits. Its exact campaign coordinator is preserved as
`evidence/issue-856-working-branch-driver.cjs.txt` for audit. It used the previously
prepared fictional Git fixture plus a same-commit local branch alias and its own
artifact namespace; it did not invoke the inherited historical preparation path.
The twelve-case CLI above remains the original campaign, not a claim that its
unmodified setup reproduces this additional SCM/state history. The executable
public regression suite for that state flow is
`src/application/usecases/steps/issue/__tests__/pre_branch_sdd_gate_use_case.test.ts`.

## Selected-source grounding and case fidelity (#858)

This separate campaign exercises the actual SDD gate, draft workflow, query
composition, immutable source view and native workspace validation. Ownership
analysis and issue/SCM ports are controlled; it never creates a remote branch or
publishes. It is optional contributor evidence, not a consumer command or a live
provider dependency added to CI.

### Recorded results and review bundle

| Cohort | Native acceptances | Explicit scoped semantic passes |
|---|---|---|
| Three unchanged-SDK baselines | 5/8, 7/8, 5/8 | 5/8, 7/8, 4/8 |
| Three whole V15 trials | 8/8, 8/8, 8/8 | 8/8, 8/8, 8/8 |

V15 used 30 SDK queries, including six ordinary repairs. The original descriptor,
all eight source worlds and the complete pinned runtime are unchanged. The 24
accepted Markdown documents are retained verbatim and reconstruct exactly from
their raw responses through derived tables, legacy links and inventory navigation.
All three material C02 availability audits pass. Each C08 review reads all 18
assertions and checks each of 95 exact operative create declarations; counts
alone do not establish either result. V13 and V14 were rejected in full for the
recorded visibility and repair-grammar failures; their results are not pooled.

The scope matters: C01 certifies genuine command retention without invented
execution, not every toy-script semantic detail. Its three outputs add a printed
message absent from the toy validator. One C04 sentence attributes uv to package
metadata instead of the command guide. These limitations remain visible in the
accepted outputs and assessments. The campaign does not certify universal prose
accuracy, full command semantics, consumer execution or human approval.

| Artifact | Review purpose |
|---|---|
| [Manifest](./evidence/issue-858.json) | Pins, whole-trial results, limitations, history index, source binding and assembly audit |
| [Frozen cases](./evidence/issue-858-cases.json) | Original inputs and target criteria; descriptor SHA-256 remains unchanged |
| [Source objects](./evidence/issue-858-source-objects.json) | All 46 exact authored Git objects, including selected and bootstrap identities |
| [Assessments](./evidence/issue-858-assessments.json) | Explicit baseline/final decisions and detailed availability/assertion/path audits |
| [Baseline observations](./evidence/issue-858-baseline-observations.jsonl) | All 24 baseline observations, raw responses and accepted Markdown |
| [Final observations](./evidence/issue-858-final-observations.jsonl) | All 24 V15 observations and every ordinary repair, with exact accepted Markdown |
| [Rejected observations](./evidence/issue-858-rejected-observations.jsonl) | 30 representative native/semantic failures; the manifest indexes the complete local history |
| [Coordinator audit](./evidence/issue-858-driver.cjs.txt) | Exact historical driver, requiring explicit local reconstruction/configuration |

### Method and reconstruction

The eight authored worlds and their exact Git objects are preserved separately
from real consumer incident evidence. They cover genuine and absent scripts,
package-manager mismatch, selected Python versus bootstrap Node source, unknown
tooling, a valid command-free SDK outcome, exact provenance, and retention of
eighteen supplied assertions and ninety-five prospective file operations. Those
assertions/files are input data, not 113 distinct SDK tests. Thirteen pure
identity-policy cases and six application repair/authorization/boundary cases
complement the two portable native CLI regressions. Twelve pure link-assembly cases and five workflow/boundary cases cover host-derived navigation, literal filename identity, native existence checks, closed failures and the unchanged final size/repair limits. One derived-table representation case checks single code wrappers while preserving hidden/duplicate-slot rejection. Two inventory-navigation projection cases derive exact links from the sole literal path table and reject malformed/hidden slots. See the 49-case inventory
and traceability in [the grounding SDD](../../specs/sdd-draft-source-grounding.md).

Assessment is explicit contributor review against each frozen case's intent,
not keyword scoring or human approval. A native rejection fails the case. For
the final candidate, all eight cases in each of three whole trials must be both
native-valid and semantically accepted; incomplete or blocked results cannot
pass. Retain every ordinary repair and failed cohort. Never combine favorable
cases from different candidate revisions or add generation attempts. Inspect
every supplied assertion and actual Path/Change operation for the fidelity case.
A hash or count alone cannot establish semantic fidelity. Scoped acceptance does
not certify every generated sentence, full command semantics, universal model
accuracy or executed product acceptance. A supplemental C02 audit also checks material
script-availability claims against direct immutable Git facts for baseline and
final outputs: the catalog is not a complete file inventory, and a known false
absence assertion rejects the cohort even if native tables pass.

The recorded official platform runtime includes its external code-mode helper;
its registry integrity, executable/helper signatures and all vendor hashes were
verified. Earlier app-only pins omitted that helper and are retained as rejected
runtime-limitation evidence. A single separately authorized diagnostic identified
that omission. An offline complete-source payload proof later confirmed that the
qualification queries contain only authored fictional source and the public SDK
standard/template, with no consumer data or private account files. Neither proof
claims capture of the full provider stdin.

The historical coordinator is an audit artifact, not a turnkey command with
portable local paths. To reproduce, use the recorded baseline SDK commit and
installed repository prerequisites, reconstruct each fictional source from the
retained object archive, and supply separate identical replicas for the three
trials. Preserve both the bootstrap anchor and selected commit in the Python
world. Keep expected verdicts outside the model source. Put the coordinator in
the candidate checkout, configure its output namespace, local baseline SDK root
and complete pinned provider executable explicitly, and run the declared whole
baseline/candidate trials. The coordinator refuses to overwrite attempted
trials and checks source/runtime hashes before and after each measured trial.
A different provider/runtime/source revision is a new cohort, never continuation
of the recorded one. Provider outputs may vary; no rerun guarantees a pass.

File navigation in raw final-candidate responses can use the internal explicit-target
assembly marker described in the SDD. To reconstruct accepted Markdown, derive
the budget/traceability tables, then apply the recorded host file-link renderer
with the selected publication path, and verify the accepted SHA-256. Ordinary
valid Markdown remains unchanged and fully validated. This representation never
authorizes a target or proves existence; the native immutable-source/proposed
path checks run after assembly. Earlier complete cohorts that failed link math
remain rejected, including the cohort with 8/8, 8/8 and 7/8 native acceptances.
The final three whole trials must pass independently; no successful case from
those earlier cohorts can be substituted into them.

Every file-marker target has a literal operative Path/Change declaration. UI examples can therefore render navigation without supplying existence authority; native source/declaration validation remains the acceptance boundary.

New authoring uses the inventory-navigation slot rather than a second list of file targets. Reconstruct its output after derived tables and legacy file-marker assembly using the recorded navigation projection. The same Path/Change rows remain authoritative and receive unchanged native validation; the projection cannot infer targets or operations.
