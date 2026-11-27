# Completed c225 review: staging cleanup and evidence-token controls

The original [review](https://github.com/vypdev/copilot/actions/runs/46045517442) completed55/55partitions with one ordinary internal retry on c225a674. Its workflow succeeded; its Review check is neutral with five new findings, not a clean PASS. The original job log is retained privately in full.

## Confirmed correction and test gap

A scope-retention assertion can fail synchronously after the durable create-intent callback but before any Engine create POST. Marking a possible creation effect before that assertion retained owned private staging. The flag now follows successful scope retention. Two existing C27 scenarios cover create-intent record failure and scope-retention failure: no create/delete request, no fabricated stopped/removal proof, removed owned staging and preserved unrelated fixture root. Genuine unknown creation/lifetime effects remain retained.

The credential fixture now checks evidenceToken against independent literal expectations. Nine configurations cover corpus normal/preflight exclusion, each review token source, precedence and absence, while preserving the backend-credential/session assertions. Three production mutants are rejected: restoring the early effect flag, dropping the review token, or copying an ambient token into corpus mode. The earlier fixture accepted the dropped-token mutant; the new assertion rejects it.

These are eleven subscenarios of existing C27, not eleven new logical qualification IDs. The35case inventory, coverage floors, immutable scientific evidence,174/42cohorts and score thresholds remain unchanged. See [exact source hashes and before/after outcomes](./source-and-controls.json).

Run the existing model-free suite with `pnpm run test:bugbot-shadow-verification`; C27 invokes the actual Engine component helper. These Unix HTTP fixtures model Engine/admission facts, use only dummy credentials, and do not execute Docker, an actual qualification SDK scope or models. Two initial local sandbox listen failures are retained as environment failures, not semantic reproductions.

## Source and contract adjudication

The reported wait-before-start deadlock is refuted for the admitted Engine29.8.2/API1.56. [Moby registers a wait and flushes response headers before waiting for terminal state](https://github.com/moby/moby/blob/645f1c4c50c2d98934d5b099d65811f0f0e71129/daemon/server/router/container/container_routes.go); ready and terminal-body evidence are distinct. Removing the registration barrier would lose that guarantee.

The image-inspection cancellation change was already present at [c225line290](https://github.com/vypdev/copilot/blob/c225a67475b0c3cbda09aac7e3270862ccc8c056/quality/bugbot/evidence/issue974/operation-containment.cjs#L290): the image API receives the live signal. No runtime edit is made for that finding.

The IPC finding is refuted within the existing trust boundary. The existing contract admits fixed source/drivers/dependencies before imports and intentionally passes a private live scope to the ordinary worker. A correlation is not cryptographic authentication between modules in one Node process; model output and child stdio cannot acquire it. Actual Engine stop confirmation and independent complete attempt/output/scoring gates remain separate from a worker stop request. A malicious replacement of that trusted closure is not a model/serialized-input grant; the design does not claim isolation between modules inside one admitted Node process. C26 rejects changed driver/bootstrap input and C31 rejects malformed/truncated ledgers even with zero worker exit. All435 current AST-instrumented controls pass without failure, skip or cancellation. Containment coverage is96.16%statements/99.51%lines/90.60%branches/96.42%functions; the unchanged95/90floors pass.

No new campaign or technical SDK query was executed. The174result remains negative;42remain unstarted, no profile is qualified, pilot writes0and production disabled. Fresh source/package/native checks on the modified head remain separate.
