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

The complete local run passes **540 suites, 6,380 tests, 26 skipped**, all
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
