# Isolated PAT capability provider evidence — 2026-10-06

Explicit operator authorization allowed temporary create/read/delete tests on
`vypdev/copilot` and its confirmed organization owner. The credential was read
from hidden stdin, held only in process memory and discarded when the runner
exited. No credential, ciphertext, provider response body or test value is
included in this evidence. No installation plan was applied.

The runner invoked the production bootstrap, permission-audit, credential,
query, transaction and recovery adapters from the current source. It confirmed
identity and read access before confirming the account and starting writes.

| Capability | Observed result |
|---|---|
| Repository Contents Write | Temporary branch created, exact SHA read, deleted and absence confirmed |
| Repository Secrets Write | Encrypted temporary Secret created with HTTP 201, exact metadata read, deleted and absence confirmed |
| Repository Variables Write | Random value created, exact value read, deleted and absence confirmed |
| Repository Issues Write | Temporary Issue created, exact identity read, deleted by node ID and absence confirmed |
| Organization Secrets Write | Repository-restricted temporary Secret created, exact metadata read, deleted and absence confirmed |
| Organization Variables Write | Repository-restricted temporary Variable created, exact value read, deleted and absence confirmed |
| Organization Issue Types Write | Disabled temporary type created, exact identity read, deleted and absence confirmed |
| Repository Administration Read | Protected Actions-permissions read verified |
| Organization Projects Read | Non-public Project read verified |
| Public repository Metadata, Contents, Actions and Checks Read | Exact read succeeded; public availability does not independently prove the PAT grant |

The first attempt exposed HTTP 422 for both Secret writes. The shared custom
encryption incorrectly truncated a BLAKE2b-512 digest to form the nonce; that
is incompatible with libsodium sealed boxes. Replacing it with
`libsodium-wrappers.crypto_box_seal` fixed both real writes. The final rerun
verified all seven Write families above. Both runs ended with empty recovery
journals; no temporary resources remained unresolved.

GitHub's [encryption guide](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api)
documents libsodium sealed boxes. Regression tests independently decrypt with
the recipient key, reject another key, cover Unicode/empty plaintext and
validate the public-key length. This evidence supplements fixtures; it does
not establish absent-grant behavior, Windows ACLs, PAT-form UX, Actions Write,
Workflows Write, Pull requests Write or Projects Write. Those retain their
existing fixture and human/provider acceptance requirements.

## SDK and web regression review

A later operator run completed the permission transactions but stopped during
Plan because Secrets and Variables inventories were unavailable. The separate
Octokit adapter used a nonexistent `rest.secrets` namespace, supplied repository
IDs to organization inventory routes that require `owner`/`repo`, and expected
an organization Variable upsert method absent from the installed SDK. The
permission-probe transport itself used correct HTTP routes, which explains
why its success did not establish inventory interoperability.

The corrected adapter is split into inventory, commands, and collection
decoding. A child-process fixture loads the installed SDK with an intercepted
transport and validates both effective organization inventory routes, sealed-box
Secret writes, separate organization Variable create/update methods, and
preservation of visibility and selected repository grants. This later review
used no live PAT or setup mutation.

The complete local run passes **541 suites, 6,390 tests, 26 skipped**, all
coverage budgets, and the retained **308/350** acceptance ledger with **42**
explicit human/provider cases open. The local diff has no missing executable
statements or partial changed branches. Overall coverage is 95.66% statements,
91.27% branches, 96.61% functions, and 96.88% lines. All three extracted Actions
resource modules join the per-module PAT coverage budget. Fresh Codecov and
platform jobs are checked on the pushed PR head separately.

A credential-free local browser fixture verifies CI cards/manual fields,
Project titles/manual input, and release strategy. Desktop 1280×900 and narrow
390×844 layouts were inspected in light/dark themes. Names and metadata render
on separate lines; controls retain their labels and spacing; the narrow page
width matches the 390-pixel viewport after header wrapping. The packaged CLI,
typed API, and isolated local web-session smoke tests pass. These observations
leave independent accessibility and native platform acceptance gates open.

The first pushed SDK/layout head stopped before tests at the production
dependency audit: [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)
affected the locked `shell-quote` 1.10.0. Updating the direct dependency and
lockfile to 1.12.0 restores a clean production audit; its existing command-parser
regressions and regenerated bundles remain part of the required checks.

The subsequent review also exposed a silent selected-repository grant skip.
Both organization resource commands now require repository identity and the
grant endpoint before writing a selected resource, including preserved
visibility. Ten regressions cover absent endpoints/identity, new resources,
denied grants, and private visibility; the command module has 100% coverage in
the focused four-suite run. A denied grant after writing remains a resource
error rather than a configured credential.

## Setup layout and Actions prerequisite follow-up

A later authorized, isolated run invoked the production Workflows and Actions
probes with another temporary PAT. Repository identity and temporary branch
creation succeeded. GitHub rejected both workflow-file writes with permission-bound
HTTP 403. Workflows therefore remained Missing; Actions was not dispatched and
remained Unverifiable because its disabled-job override could not be prepared.
Both attempts removed their exact temporary branches and ended with zero
pending journal entries. No setup plan was applied. The observed denial cannot
be replaced by the operator's assumption that all permissions were selected;
the accepted-permissions header describes endpoint requirements, not token
grants. A successful live Workflows write or Actions dispatch with this PAT is
not claimed. See the [Contents API permission contract](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).

The follow-up preserves the bounded prerequisite in the report and live
progress, explains it in all four web locales, and preserves non-403 override
failures instead of mislabelling them as a permission requirement. Fixtures
still establish successful dispatch/readback/cleanup and enforce rejected or
contradictory evidence. The disabled-job override now uses a string `run` value.

The complete local run passes **541 suites, 6,416 tests, 26 skipped**, every
coverage budget and the unchanged **308/350** acceptance ledger; **42** human
or provider gates remain explicitly open. Overall coverage is 95.67%
statements, 91.28% branches, 96.61% functions and 96.88% lines. TypeScript,
Svelte, lint, specification, documentation and workflow contracts pass. The
rebuilt package passes its CLI, typed API and isolated web-session smoke test.

Credential-free browser fixtures were inspected at 1280×900 and 390×844 in
light/dark themes. The expanded Variables inventory includes all 68 entries;
its list, the permissions context and selectable CI cards have no internal
scroller. The 12 CI cards occupy their full content height. Continue's right
edge matches its navigation row with and without Previous; Previous remains
on the left. Both viewports have document width equal to viewport width.
Inventory disclosure, aligned decision rows and additional panel spacing
replace clipped, crowded lists. These observations are layout evidence, not
independent screen-reader, linguistic or native-platform acceptance.

## Guided PAT recovery follow-up — 2026-10-07

A fresh temporary PAT created from the assistant's initial link reproduced the
same permission-bound HTTP 403 on Workflows and on the Actions disabled-job
override. Identity and temporary Contents branch creation succeeded; each probe
deleted its temporary branch and finished with zero pending recovery entries.
Actions was never dispatched and no setup plan was applied. This establishes
denial and cleanup for that PAT, not successful Workflows or Actions access.

The initial guided link is provisional. Inspection of existing managed Secrets
and a missing health workflow adds Workflows WRITE to the final requirements.
The application already generated that corrected link, but the web bridge's
cleanup/final messages replaced it and the terminal result hid it. A separate
`setupPatCorrection` view field now preserves the final required-permissions
link and delta. The blocked result offers it only before setup mutations and
after cleanup is confirmed; partial outcomes and Secret collisions keep their
inspection instructions. The correction includes repository selection and a
fresh-run instruction in all four web locales.

Twenty additional regressions cover final grant expansion, retained recovery,
official URL validation, ended sessions, four locales, bootstrap wording and
seven conditions that suppress the new action. The existing adapter regression
also follows cleanup through the final result. Credential-free browser review
at 1280×900 and 390×844 in both themes shows the additional recovery panel in
page flow, with no internal scroller or horizontal page overflow. Independent
human and provider gates retain their existing status.

The complete follow-up suite passes **541 suites, 6,436 tests, 26 skipped**.
Coverage is 95.67% statements, 91.29% branches, 96.61% functions and 96.89%
lines. TypeScript, Svelte, lint, specification, documentation, workflow,
generated-bundle and package contracts pass; the extracted package also passes
the isolated CLI, typed API and local web-session smoke test.

## Initial-link prefill follow-up — 2026-10-07

The operator observed Actions Read-only on the first guided setup link despite
selected Secret management. The initial intent now discloses and prefills
conditional repository Actions, Contents and Workflows WRITE for possible
credential-health checks. Guided bootstrap inspects local required grants;
those conditional write transactions wait for the approved final plan. Manual
and supplied-token audits retain their existing conditional checks. Final
audits independently derive required grants and disclose unused prefilled
grants as possible excess access. The workflow/bot link keeps required-only
projection. Twelve additional regressions cover these boundaries.

Credential-free form observation used the URL emitted by
`PrepareSetupPatIntentUseCase` for an organization setup with managed Secrets
and Variables, Projects and recommendation-mode approval. GitHub displayed
Actions, Contents and Workflows as **Read and write**. No token was generated,
no provider write probe was run and no setup plan was applied in this follow-up.
This proves form prefill for the observed account/session, without claiming
that a generated PAT would pass all capability checks.

## Queued Actions cleanup observation — 2026-10-07

A later operator setup stopped at Plan with Actions `Unverifiable` and a
pending recovery record. Read-only inspection of its exact recorded
workflow-dispatch run `37662029697` and branch confirmed workflow ID
`136515388`, matching recorded commit
`468e9f22c3aaf5398eba11a2474077faf96733dd`, and an unchanged private random
probe branch. GitHub reported creation at `17:49:20Z`, completion at
`17:49:31Z`, and conclusion `skipped`; its only job was the disabled `noop`.
The previous cleanup loop allowed approximately four seconds of polling delay.

This observation supports a provider completion race. It does not reveal the
earlier cancellation HTTP response, establish a missing Actions grant, or
prove that the full audit succeeded. No PAT was reused and no new dispatch or
setup Apply was performed for this inspection. The fix allows bounded
completion polling and conflict-only cancellation retries, retaining exact
ownership checks and the pending journal on failure. Automated delayed-run and
recovery fixtures are separate evidence; the next authorized setup audit still
has to confirm remote cleanup before continuing.

The provider contract documents asynchronous `202` cancellation acceptance,
`409` conflict and `204` deletion in
[GitHub's workflow-run API](https://docs.github.com/en/rest/actions/workflow-runs).
