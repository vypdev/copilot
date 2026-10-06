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
