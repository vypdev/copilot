# Reviewed installation proposal — #977

**Prepared only; not installed, authorized or natively verified.** The authenticated
destination is vypdev/copilot (891781467), master at
ace49e4a7ce0f6a007fef5d11479eb9b7a5846e3. A readable workflow-directory listing
at that exact SHA proves the writer filename absent (`observed-default.json`).
A 404 alone is not absence proof. No default file, Variable, Secret, protection,
runner policy, release, consumer template or production mode was changed.

## Exact proposed artifact

`proposed-workflow.yml` is the #976 source workflow with exactly one substitution:
`uses: ./` becomes `uses: vypdev/copilot@1b024481d9d86cb4d4b10eb7f8569f9c8e2f0981`.
Copying the local-action workflow onto the older default revision would load the
older executable. The explicit reviewed SHA avoids that dependency. Preserve the
existing self-hosted/codex/Linux route, default-ref admission, per repository/PR
serialized queue, operation correlation, native evidence revalidation, private-PR
read permissions, publication PAT and last verified comment behavior. No new
credential scope is requested.

`manifest.json` binds the destination, before-state, exact Action manifest/bundle,
source workflow and proposed workflow hashes. Its SHA-256 is
3738d8b9c823739c745ad30e4bf438afdd7d8d3361f2abcd6e71430d0dad13b8. #976 / PR #989 is still unmerged; maintainer review/approval
of this source revision is pending. This is not a producer code attestation.
Do not install a different source or update a moved default from this receipt.

Coordinate the installation with #814's shared inspection/review/diff/receipt and
drift fences. This proposal does not implement a parallel updater, provision
resources or create a setup branch. The maintainer must authorize the exact
manifest/source/target and use the existing supported reviewed installation PR
route. If that route cannot preserve this exact reviewed pin, stop for its
supported migration rather than substituting a floating tag or a blanket update.
A future installation needs its own prepared-commit receipt and fresh authenticated
destination read; a develop merge or this artifact alone cannot close #977.

## Executed controls

Nine deterministic artifact controls pass: authenticated absence, exact installed
bytes, foreign workflow, foreign repository, moved default SHA, renamed default,
inaccessible parent, contradictory listing and the real YAML's source pin /
admission / runner / queue / credentials. `exact-installed-bytes` is only a
synthetic byte comparison, not evidence that a workflow is enabled or installed.
The first test attempt failed before running because it used an uninstalled YAML
package; it now uses the project's existing js-yaml dependency. Both logs remain.

The exact #976 Action bundle (SHA in manifest) also passes **14 packaged localhost
scenarios**, recorded in `packaged-results.json` and the per-scenario byte-exact
compressed logs. They cover progress update, duplicate no-write, independent
refresh, terminal update, delayed progress, replaced attempt, replacement retry,
push during preflight, denied private PR read, refused comment write, verified
empty conversation, missing conversation and legacy card progress/upgrade.
The copied historical canary was adapted only for the new operation correlation,
fixed source-bundle digest, new-empty-output requirement and denied private read;
the original #950 driver/history are unchanged. Fake comment PATCH/POST attempts,
including a refused write and an explicitly rejected GraphQL mutation audit,
are recorded as fake. Real GitHub writes and model calls are zero.

| Required distinction | Actual evidence |
| --- | --- |
| Absent | Authenticated exact-default parent listing and classifier control |
| Exact installed | Synthetic exact-byte classifier; actual installation pending |
| Incompatible/foreign | Foreign source pin and repository controls |
| Stale source | Moved default / renamed default controls; packaged push-preflight |
| Denied private read | Actual packaged worker gets local fake 403, nonzero exit, zero writes, prior card retained |
| Duplicate/replaced wakeup | Actual packaged identical-progress no write; prior attempt refused; new attempt updates |

Run the classifier with `node --test quality/bugbot/evidence/issue-977/installation-state.test.cjs`.
For the packaged audit, create a new empty directory and run
`node quality/bugbot/evidence/issue-977/packaged-canary.cjs /absolute/reviewed/build/github_action/index.js /absolute/new-empty-directory`.
The bundle digest must match the manifest before any case; never point it at an
unreviewed runtime and reinterpret its output as native installation evidence.

## Remaining acceptance

1. Maintainer review and integration of #976 at the exact approved revision.
2. Specific installation authorization for the exact manifest and fresh default.
3. Reviewed installation PR/default merge by the maintainer/Action, with its actual
   prepared commit, matching receipt and resulting destination SHA.
4. An explicitly authorized test PR, then a genuinely run native dispatch/canary,
   recorded run/job/result and current-source comment readback. No PR has been
   chosen or mutated automatically; no native canary is claimed.
5. Read back the installed exact workflow/code and inspect native readiness.

Production verification remains disabled. EV-07 and qualification remain separate.

All 149 shadow controls pass, including the nine artifact cases; specification/catalog/documentation validators and Graphify pass. These local results do not change the pending installation/native acceptance.
