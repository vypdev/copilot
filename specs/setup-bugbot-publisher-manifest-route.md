# Reviewed Setup delivery for the Bugbot status publisher

- Status: Ready for official SDD review; no implementation approval or executed acceptance is claimed
- Date: 2026-11-20
- Owners: Copilot maintainers
- Catalog capability ID: setup-and-doctor
- Official companion publication path: specs/setup-bugbot-publisher-manifest-route.md
- Existing owning registered SDD: specs/organization-configuration-reuse-and-batch-setup.md
- Scope: One explicit publisher-purpose CLI route through shared Setup file delivery, with exact preview, purpose-bound recovery and no resource writers.
- Coordination: #977 owns operational installation/native acceptance; #976 supplies reviewed publisher code; #814 retains broader maintenance/release/web work. This source feature closes none of those acceptance requirements automatically.
- Review gates: official SDD, architecture, security, product/content, tests, packaging, documentation and final native checks.
- Open product decisions: none selected for implementation; the official SDD gate must review the decisions below before code starts. Exact installation source/default/canary pins are later operational evidence, not invented source-feature prerequisites.

## 1. Executive summary

Add `copilot setup --publisher-manifest <path>` to inspect one proposal, show the complete final workflow and manifest receipt, obtain fresh approval and deliver one installer PR. Share existing Setup commit/ref/PR phases and persistence primitives. The SDK feature ends at tested source and truthful delivery behavior. Actual default installation and native-canary acceptance remain #977, require their specific authorization, and are not inferred from a source merge or package test.

## 2. Problem, current behavior, and evidence

The #977 artifact is a review-only proposal, not a supported CLI selection. Current `setup_execution.ts` routes batch/resume into broad configuration/resource orchestration. `SetupBatchGithubApplyAdapter` owns Git delivery together with Variables/grants/labels/types and broad Secret metadata revalidation; supplying fake configuration or no-op resource writers does not establish a narrow path. `prepareCommit` creates Git objects, so it is not a preview. `assertPrepared` currently proves parent and nested receipt, but not the complete approved tree difference. The private batch journal is strict v1, metadata-only and exclusively locked.

These observations come from the actual CLI, application, adapter/journal and issue977 proposal sources. The seven inspected installer files are byte-identical at the prepared c7d6d6a2eb0db6d02376df8348707e5795a36999 packet and integrated26e9dd8ede0490774d59bae946156514c43f6d20 source. At the observed default ace49e4a7ce0f6a007fef5d11479eb9b7a5846e3, a compatible schema2/contract1 manifest exists; this snapshot is not a later freshness assertion. The old #976 source pin is not installation authority and must be refreshed after actual integration.

The existing #977 branch has preparation commits and no published SDD card. The first-SDD retained-branch ancestry guard cannot be retrofitted by rewriting that history. Use the new enabled feature's Action-owned branch and official first SDD. Keep #977's packet and #814's unstarted broader requirements intact. No failed first-SDD attempt or maintainer recovery is claimed.

GitHub tree, commit and ref creation are separate effects. A base tree retains unrelated files; separate reads are not an atomic CAS. Workflow edits need their relevant write authority. Primary references: https://docs.github.com/en/rest/git/trees#create-a-tree ; https://docs.github.com/en/rest/git/commits#create-a-commit ; https://docs.github.com/en/rest/git/refs#create-a-reference ; https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents . Existing fixtures and actual outcomes remain separate from these provider contracts.

## 3. Actors, surfaces, and terminology

Maintainer: selects and reviews exact bytes in the terminal. Installer: delivers approved files and retains effects. Reviewer: inspects source/default/base, diff, receipt and PR. Operator: separately authorizes merge/native canary and records actual #977 evidence. A proposal is untrusted data; a Boolean or prior receipt cannot grant approval. Prepared, PR-created, merged and native-verified are distinct facts.

## 4. Goals, non-goals, and fixed invariants

| Requirement | Behavior |
|---|---|
| PU977-G01 | Validate one closed publisher proposal and independently pin destination, source and exact allowed file scope. |
| PU977-G02 | Show the complete two-file preview and bind fresh approval to the immutable final bytes; dry-run/decline creates no effects. |
| PU977-G03 | Use shared existing installation delivery with complete approved-tree/parent/receipt proof and the established Setup namespace. |
| PU977-G04 | Bind durable metadata to purpose and operation; retain partial/unknown effects and never overwrite, force, delete or blindly replay. |
| PU977-G05 | Use only relevant source/destination authority reads and approved file effects; no resource writers or permission probes are implied. |
| PU977-G06 | Expose one explicit bounded CLI journey and truthful pending/partial/PR/native states with safe content and useful next actions. |
| PU977-G07 | Preserve compatible installed metadata, legacy batch behavior, private journals and fixed authority; unsupported state blocks. |
| PU977-G08 | Require separate specific default-installation and real-canary evidence before verified acceptance; keep production disabled and pilot writes zero. |

Only `.github/workflows/copilot_bugbot_status_card.yml` and `.copilot/setup-manifest.json` receipt may differ for this purpose. Preserve other manifest data, guidance, source-generator identity, workflows and runner selections. Require a supported existing Setup manifest and complete compatible guidance; missing/unknown/future state blocks rather than fabricating artifacts/profile defaults. An absent publisher is supported; a foreign/customized/equivalent renamed publisher blocks. Do not overwrite or delete it.

Non-goals: full #814 release/custom-YAML migration, new web controls, repository/organization resource changes, probes, model calls, auto-merge, releases, deployment or verification activation. Keep this rollout's production verification disabled and evaluated-pilot PR writes zero. Human/platform Setup observations remain separate.

## 5. Current versus proposed product journey

```text
Proposal -> relevant read-only inspection -> complete two-file preview
 -> fresh exact-snapshot approval -> shared Setup delivery -> PR awaiting merge
 -> separately authorized installation and native evidence owned by #977
```

Text equivalent: inspect, review, approve, deliver and hand off; no stage infers the next. Ordinary setup remains the default. The new explicit option bypasses broad questionnaire/resource orchestration before any effects. Dry-run/decline creates no objects, refs, PRs, probes or journal. The result links retained facts and the next action.

## 6. Functional behavior and state model

Validate the local proposal before transport, independently resolve source/destination identity, and inspect complete relevant workflow/manifest facts. Unknown/denied/incomplete inventory is not absence. An exact current installation has no empty PR and retains native-verification-pending status. Pin final intended workflow bytes before preview.

The purpose-separated plan digest binds operation, repository/default/base, source identities, proposed workflow hash, original manifest identity, receipt format and audited actor/relevant authority. Derive the final receipt after that noncircular digest is known; approval binds both complete rendered files. Private credential/session generation is also fenced, without storing credentials or credential hashes. Credential/actor/authority drift requires fresh review.

After approval, use the common file-delivery coordinator. Revalidate relevant default/base/identity/authority before every mutation. Preserve the fixed Setup namespace, exact prepared parent/tree/receipt and operation marker. Cancellation stops later effects and retains completed/uncertain facts. Detecting a race after an effect reports partial state, not rollback or atomic CAS.

| State | Meaning | Primary next action |
|---|---|---|
| Inspecting | Read-only facts pending; no effects | Wait |
| Review | Complete files and effects disclosed | Approve or cancel |
| Blocked/stale | Unknown, foreign, denied or changed snapshot | Correct cause and prepare again |
| Applying | Approved delivery active | Wait or stop pending work |
| Partial | Completed/uncertain effects retained | Inspect receipt; freshly reviewed recovery |
| Waiting for merge | Exact installer PR exists | Review PR |
| Unchanged / verification pending | No new file effects; native proof is separate | Inspect actual default/native evidence |

Only actual separately authorized #977 evidence can establish installed/native-verified acceptance; the new source route does not fabricate that terminal state.

## 7. User-facing configuration

The only new option is `--publisher-manifest <path>`. Allow existing `--token`, `--debug`, read-only `--dry-run`, and optional `--resume-operation`. Normal help/version remain. Reject explicitly supplied `--web`, `--batch`, `--yes`, `--non-interactive` and every generic feature/configuration/Variable/Secret/approval/update override, including false/empty/default-looking explicit values. Commander provenance stays in the CLI adapter; pure policy receives closed facts. Dispatch before generic terminal/web/configuration/probe setup.

The proposal is one regular nonsymlink strict-UTF8 JSON file, at most 128 KiB, schemaVersion1 and kind `review-only-publisher-installation-proposal`. Use the existing artifact's closed top-level/nested sets: destination(repository, repositoryId, defaultBranch, head); path; baseline; source(repository, commit, pullRequest, merged, maintainerApproval, workflowSha256, actionManifestSha256, actionBundleSha256); proposedWorkflowSha256; sourceChange; consumerTemplatesChanged; productionVerification; installationAuthorized; installedDestinationSha; nativeCanary(status, explicitlyAuthorizedPullRequest, runId); dependency; coordination. IDs are positive safe integers; Git IDs full 40-character hex; SHA-256 full 64-character hex. Use existing coordinate/ref validation. Descriptive fields are at most 512 characters and never select code/transport/authority. Reject extra keys, invalid types/kind/schema/hash, unsupported completed-result shapes and unreadable/oversized input before transport.

Proposal approval/merge/native fields are observations, not authority. Independently prove reviewed merged source and exact workflow/action/bundle bytes; declarations alone do not pass. Source-derived workflow transformation requires the canonical layout and exactly one root-local `uses: ./` step. Replace only that invocation with `vypdev/copilot@<full reviewed source SHA>`, retain every other byte and verify proposedWorkflowSha256. No arbitrary renderer/template/runner/path override is accepted.

Dry-run may read an existing publisher resume but writes no new journal/lock/object. Later Apply prepares/reviews its own snapshot. Bare resume retains legacy batch and never infers publisher purpose. Keep existing read/backoff and payload bounds and the 40,000-byte private journal bound. No user-selectable ref/base/template/runner/URL or new repository Variable is introduced. Absent the new option preserves ordinary behavior.

## 8. Clean Architecture design

```text
CLI adaptation -> publisher review/apply use case -> pure scope/approval/tree policy
   -> narrow read/freshness/journal/file-delivery ports
   -> shared application delivery coordinator -> existing extracted GitHub delivery
Ordinary batch keeps resource phases and invokes that same file coordinator.
```

Text equivalent: frontends adapt inputs, application owns decisions/states, ports expose semantic capabilities, adapters own provider/filesystem operations, and pure policy owns validation. No provider DTO or process/SDK/filesystem import enters pure policy; no raw HTTP/process orchestration enters the application. Enforce actual composition and existing dependency/cycle rules.

Extract common approved-final-files/receipt contracts and formatter, application prepare/ref/PR phases, GitHub delivery and private UUID/file/lock primitives. Ordinary batch retains its resource stages and broad freshness wrapper; publisher receives relevant read/authority, file delivery, journal and presentation only. No dummy SetupConfiguration, no-op resource writers, second installer or new renderer abstraction. Preserve existing ordinary manifest behavior in its wrapper; publisher requires a real compatible baseline.

Complete prepared-tree proof uses an approved-path prefix trie. Read complete non-recursive base/prepared trees. All unmentioned siblings must retain name/mode/type/object identity. Descend only approved ancestors; reject non-tree ancestors, duplicate/unsafe entries, unknown/truncated responses and unapproved differences. Approved leaves match exact mode and blob identity from approved bytes. Only ordinary explicitly approved deletions remain supported; publisher never deletes. Exact single parent and nested receipt are separately required. Sampling two expected blobs is insufficient.

Keep installed manifest/receipt format unchanged unless separately reviewed. Use a closed publisher-v2 operation (`purpose: bugbot-status-publisher`, one repository and only file effects) with the same private store/UUID/lock namespace. Legacy v1 parser/records remain on their route; reject cross-purpose/future/resource-effect resume. Never silently migrate old journals. Preserve ownership and nonce-based release; no PID-only orphan-lock recovery.

## 9. UI/UX and content contract

```text
Install the Bugbot status publisher — vypdev/copilot
Review the publisher workflow and installation receipt on the inspected default.
[Review full diff] [Approve this snapshot] [Cancel]
Technical details: source identity, permissions, hashes and retained effects
```

Pending: `Inspecting the proposal and destination. No changes started.`
Action: `Review both final files before creating the PR.`
Blocked: `The default revision changed. Prepare a new preview; the previous receipt is retained.`
Partial: `The installation branch exists; PR creation is unconfirmed. Inspect this operation before resuming. Setup has not updated the default branch.`
Complete delivery: `The installation PR is ready for review. Merge and native verification remain pending.`

Lead with status, completed facts, next action, human action, impact, direct links, then technical detail. One operation report and at most one installer PR; no progress-comment stream. Provide keyboard interaction, textual states/diagram fallback, readable narrow terminal content and inert escaped names/values/Markdown/URLs. No new web or human screen-reader acceptance is claimed.

Provide complete static en/es/fr/pt catalogs through existing catalog primitives, with atomic English fallback. Normalize LC_ALL, then LC_MESSAGES, then LANG for display only; absent/invalid/unsupported locale defaults en-US. Locale cannot change approval, files, digest, target or authority. No new locale flag or language/model call. publisher977-C54 covers English, publisher977-C61, publisher977-C62, publisher977-C63 the other three catalogs, publisher977-C64 fallback. All primary states/actions/recovery must remain understandable.

## 10. Failure, recovery, and cleanup

Unknown tree/commit POST outcomes with no identifiable prepared object block automatic retry/adoption. Retain uncertainty; any new operation needs a fully disclosed new snapshot and fresh approval, preserving prior unknown effects. Inspect ref/PR outcomes by exact operation/target/commit marker; no blind POST replay, force-push, deletion, automatic rebase or human-head overwrite. Existing read retries/backoff remain fixed. Report denied/unknown/stale/foreign states without claiming an observed edit merely from unavailable metadata. Do not remove completed PRs/grants or unrelated work.

## 11. Security, permissions, and privacy

Preview uses relevant GET/local reads only; no organization Secret inventories, resource writers, permission probes, scripts or models. Apply requests only the reviewed repository file/PR and workflow authority. Credentials stay paired private session state and never enter journals, logs, exports, digests or preview. Sanitize bounded diagnostics instead of echoing arbitrary provider payloads. Keep source/destination/producer identity distinct from independent producer-code attestation; artifact/run/receipt identity alone is not that attestation. Preserve protected routes, runner policy and approval/rollback fences.

## 12. Observability and operational UX

Retain operation/target, source/default/base, proposal/rendered byte hashes, prepared commit, exact ref/PR and known/uncertain effect receipts. Public view shows meaningful states and descriptive links; secondary diagnostics remain redacted. Queued/skipped runs, source-only merges and packaged passes cannot become installed/native-verified outcomes.

## 13. Compatibility, migration, rollout, and rollback

Source feature sequence: official SDD -> shared extraction/parity -> narrow route -> 64 controls and existing gates -> final native source review/merge. It does not install a workflow. Then #977 refreshes its #976-dependent proposal, prepares the concrete complete installation, obtains specific authorization, delivers/merges through the trusted route and runs only an explicitly authorized canary. No preparation PR closes #977 as accepted. #814's broader release/customization/web work and all 14 actual Setup observations remain open.

Rollback is a separately reviewed normal change from a fresh snapshot retaining prior receipt/workflow facts. No reference deletion or overwrite of newer human work. No release, production activation or automatic merge is part of this feature.

## 14. Testing strategy and numeric budget

Minimum 64 distinct new cases, separate from existing9 artifact /149 shadow /14 packaged evidence. Distribution:16 pure planning,8 read/freshness,12 application/recovery,10 provider/delivery,12 CLI/content,6 packaged/security. These are floors; add meaningful cases if required. Repeated execution does not add cases.

Pure policy:100% all metrics. New catalogued modules: at least 95% lines/statements and 90% branches/functions, plus existing global budgets. The owning Setup SDD additionally requires zero incomplete executable changed lines in the final uploaded report. Do not lower exclusions, thresholds, assertions or timeouts. Use deterministic clocks/IDs/provider/filesystem seams, actual CLI/packed entrypoints, retained-state and no-unapproved-effect assertions. Model-free tests prove contracts, not installation, human/platform or provider acceptance.

| Area | Minimum distinct cases | Behaviors/risks covered |
|---|---|---|
| Pure proposal/scope/plan policy | 16 | Closed proposal, exact source/scope/approval, receipt and compatibility policy |
| Read-only planning/freshness | 8 | Relevant complete reads, absence versus unknown, identity and freshness |
| Application/recovery | 12 | Cancellation, partial effects, locking, purpose-bound resume and uncertainty |
| Provider/delivery contracts | 10 | Complete tree/parent/receipt, exact owned refs/PRs, provider denial and races |
| CLI/content | 12 | Early explicit CLI dispatch, conflicts, four static locales and truthful content |
| Packaged integration/security | 6 | Actual packed CLI, narrow credentials/composition and legacy parity |
| Total | 64 | Every new executable case counted once |

| Case ID | Area | Requirements | Scenario |
|---|---|---|---|
| publisher977-C01 | Pure proposal/scope/plan policy | PU977-G01 | A structurally valid closed proposal admits exactly one target, source pin, workflow hash and supported artifact kind. |
| publisher977-C02 | Pure proposal/scope/plan policy | PU977-G01 | Repository ID/name/default declarations must agree internally; an arbitrary URL or contradictory identity is rejected. |
| publisher977-C03 | Pure proposal/scope/plan policy | PU977-G01 | Malformed or missing commit, bundle, workflow and manifest digests are rejected without coercion. |
| publisher977-C04 | Pure proposal/scope/plan policy | PU977-G01, PU977-G03 | Extra file, deletion, path traversal, absolute path or wrong file mode cannot enter the two-file delivery plan. |
| publisher977-C05 | Pure proposal/scope/plan policy | PU977-G01, PU977-G07 | Only the canonical publisher workflow path is selectable; no proposal field supplies a destination override or arbitrary template. |
| publisher977-C06 | Pure proposal/scope/plan policy | PU977-G01, PU977-G02, PU977-G04 | The plan digest changes for purpose, operation, repository/default/base, source identity, workflow bytes or original manifest identity. |
| publisher977-C07 | Pure proposal/scope/plan policy | PU977-G02 | Approval binds the complete rendered workflow and receipt bytes, so any post-preview byte change invalidates it. |
| publisher977-C08 | Pure proposal/scope/plan policy | PU977-G02, PU977-G05 | A manifest approved/authorized Boolean or an old review receipt cannot grant a fresh Apply. |
| publisher977-C09 | Pure proposal/scope/plan policy | PU977-G02, PU977-G03 | Receipt derivation is deterministic and noncircular: purpose-separated plan digest first, complete approval-byte digest afterward. |
| publisher977-C10 | Pure proposal/scope/plan policy | PU977-G03, PU977-G07 | Supported existing manifest fields/artifacts remain semantically intact outside the disclosed installation-receipt change. |
| publisher977-C11 | Pure proposal/scope/plan policy | PU977-G07 | Future/unsupported manifest or installation-receipt shape is blocked rather than normalized into a supported version. |
| publisher977-C12 | Pure proposal/scope/plan policy | PU977-G01, PU977-G07 | Partial, mismatched or tampered source-guidance identities block the narrow maintenance plan. |
| publisher977-C13 | Pure proposal/scope/plan policy | PU977-G05, PU977-G07 | An absent Setup manifest cannot become an invented empty artifacts/profile baseline. |
| publisher977-C14 | Pure proposal/scope/plan policy | PU977-G04, PU977-G07 | The closed publisher journal accepts only its v2 purpose and file-delivery effects; resource effects are rejected. |
| publisher977-C15 | Pure proposal/scope/plan policy | PU977-G03, PU977-G08 | An operation marker or matching receipt alone never produces a verified-native or independent producer-attestation claim. |
| publisher977-C16 | Pure proposal/scope/plan policy | PU977-G01, PU977-G07 | Symlink/nonregular proposal or unsupported path ancestry is rejected without following it as source authority. |
| publisher977-C17 | Read-only planning/freshness | PU977-G01, PU977-G02, PU977-G05 | Readable absent publisher plus compatible existing Setup state produces a full preview using only relevant reads. |
| publisher977-C18 | Read-only planning/freshness | PU977-G01, PU977-G05 | A denied relevant read remains unknown and cannot be classified as absent or safe to overwrite. |
| publisher977-C19 | Read-only planning/freshness | PU977-G01, PU977-G05 | Incomplete/truncated workflow or manifest inventory blocks an absence claim. |
| publisher977-C20 | Read-only planning/freshness | PU977-G01, PU977-G07 | An equivalent renamed or foreign/customized publisher is detected or remains explicitly unknown; no second publisher is added. |
| publisher977-C21 | Read-only planning/freshness | PU977-G01, PU977-G02 | A changed authenticated default branch or base before review requires a new plan and preview. |
| publisher977-C22 | Read-only planning/freshness | PU977-G01, PU977-G02 | A changed or mismatched source commit/bundle/workflow digest prevents reuse of the old proposal approval. |
| publisher977-C23 | Read-only planning/freshness | PU977-G05, PU977-G07 | Supported reads do not invent empty organization resources, permission evidence or source-guidance facts when access is unavailable. |
| publisher977-C24 | Read-only planning/freshness | PU977-G01, PU977-G06, PU977-G08 | An exact existing publisher yields unchanged/no empty PR while real-canary status remains separately pending. |
| publisher977-C25 | Application/recovery | PU977-G02, PU977-G05 | Declining the preview leaves GitHub and the durable operation store unchanged. |
| publisher977-C26 | Application/recovery | PU977-G02, PU977-G03, PU977-G05 | A fresh approved snapshot invokes the shared file-delivery sequence and no generic resource stage. |
| publisher977-C27 | Application/recovery | PU977-G02, PU977-G04 | Explicit cancellation before effects stops Apply without creating objects, refs or PRs. |
| publisher977-C28 | Application/recovery | PU977-G04 | Cancellation after a completed object effect retains partial metadata and starts no later effect or destructive cleanup. |
| publisher977-C29 | Application/recovery | PU977-G04, PU977-G07 | A concurrent Apply cannot acquire the exclusive UUID lock or perform a duplicate write. |
| publisher977-C30 | Application/recovery | PU977-G03, PU977-G04 | Restart after a known exact prepared commit revalidates/adopts it without preparing another commit. |
| publisher977-C31 | Application/recovery | PU977-G03, PU977-G04 | Restart after the exact owned ref reuses that ref and preserves its matching complete receipt. |
| publisher977-C32 | Application/recovery | PU977-G04 | Unknown tree/commit creation without an identifiable object blocks automatic retry and retains uncertainty. |
| publisher977-C33 | Application/recovery | PU977-G03, PU977-G04 | An uncertain PR response is recovered only after exact marker/head/base/repository inspection. |
| publisher977-C34 | Application/recovery | PU977-G04, PU977-G07 | Legacy v1/different-purpose/future journals cannot resume publisher work or cause legacy resource effects. |
| publisher977-C35 | Application/recovery | PU977-G02, PU977-G04 | Changed reviewed digest/base or a human-advanced owned head blocks resume until the appropriate fresh review; no overwrite occurs. |
| publisher977-C36 | Application/recovery | PU977-G04, PU977-G06 | A journal save failure after an effect stops later writes and reports partial/unknown recovery instead of claiming durable success. |
| publisher977-C37 | Provider/delivery contracts | PU977-G03 | Tree creation retains the reviewed base tree and the resulting full scope equals only the approved files. |
| publisher977-C38 | Provider/delivery contracts | PU977-G03, PU977-G04 | An unexpected prepared parent cannot be adopted even when its marker/receipt otherwise matches. |
| publisher977-C39 | Provider/delivery contracts | PU977-G03 | An extra sibling file or changed subtree is rejected even when both expected blobs are correct. |
| publisher977-C40 | Provider/delivery contracts | PU977-G02, PU977-G03 | Wrong workflow bytes, file mode, receipt identity or digest is rejected before ref/PR adoption. |
| publisher977-C41 | Provider/delivery contracts | PU977-G04, PU977-G05 | GitHub denial at an approved workflow/content write produces the correct blocked/partial outcome without permission escalation or a probe fallback. |
| publisher977-C42 | Provider/delivery contracts | PU977-G03, PU977-G04 | Unknown ref creation followed by the exact expected ref adopts once without blindly repeating POST. |
| publisher977-C43 | Provider/delivery contracts | PU977-G03, PU977-G04 | An existing UUID ref at a different human commit blocks with no force, deletion or replacement. |
| publisher977-C44 | Provider/delivery contracts | PU977-G03, PU977-G04 | PR inspection handles full pagination and rejects missing, duplicate or foreign matches rather than creating another PR. |
| publisher977-C45 | Provider/delivery contracts | PU977-G01, PU977-G04 | Default/base movement between provider effects stops remaining work; movement detected after an effect is honestly partial, not claimed atomic CAS. |
| publisher977-C46 | Provider/delivery contracts | PU977-G03, PU977-G04 | A head changed during PR creation/readback is retained as a partial ownership conflict with no cleanup or silent adoption. |
| publisher977-C47 | CLI/content | PU977-G01, PU977-G06 | The explicit publisher option selects the narrow application before generic setup configuration or probing. |
| publisher977-C48 | CLI/content | PU977-G05, PU977-G06 | Explicitly supplied forbidden generic options are rejected even when Commander parses an empty or default-looking value. |
| publisher977-C49 | CLI/content | PU977-G02, PU977-G06 | --yes and --non-interactive cannot turn proposal fields or a previous preview into Apply approval. |
| publisher977-C50 | CLI/content | PU977-G05, PU977-G06 | --web/--batch conflicts start neither a web server nor organization selection/model/permission setup. |
| publisher977-C51 | CLI/content | PU977-G02, PU977-G05, PU977-G06 | Valid dry-run shows both final files using controlled relevant reads and creates no journal, object, ref, PR or resource probe. |
| publisher977-C52 | CLI/content | PU977-G04, PU977-G06, PU977-G07 | Publisher resume requires its explicit proposal route and fresh review; bare resume retains the ordinary legacy batch route. |
| publisher977-C53 | CLI/content | PU977-G06, PU977-G08 | Pending, partial, waiting-for-merge and verification-pending copy links to the actual known operation/run and never invents successful installation or canary evidence. |
| publisher977-C54 | CLI/content | PU977-G06, PU977-G07 | English primary content, textual status, descriptive links and sanitized failures expose no credential or arbitrary provider payload. |
| publisher977-C55 | Packaged integration/security | PU977-G06 | The actual packed CLI help advertises the selected option and supported review/preview journey. |
| publisher977-C56 | Packaged integration/security | PU977-G01, PU977-G05, PU977-G07 | The actual packed CLI rejects an oversized, malformed or nonregular proposal before transport or generic setup effects. |
| publisher977-C57 | Packaged integration/security | PU977-G02, PU977-G05, PU977-G06 | The actual packed CLI rejects conflicting automation flags before authentication or generic orchestration. |
| publisher977-C58 | Packaged integration/security | PU977-G01, PU977-G06 | Outside a local Git checkout, a well-formed proposal with missing credentials reports the narrow credential prerequisite, without initializing or configuring a checkout. |
| publisher977-C59 | Packaged integration/security | PU977-G03, PU977-G05, PU977-G07 | Architecture/composition enforcement gives the publisher no resource writers/probes or raw application process/HTTP imports and proves both routes share one delivery implementation. |
| publisher977-C60 | Packaged integration/security | PU977-G03, PU977-G04, PU977-G07, PU977-G08 | A controlled cross-route integration preserves ordinary batch resource stages/Secret retention while publisher delivery remains file-only and cannot adopt a legacy operation; no production/model/native acceptance is inferred. |
| publisher977-C61 | CLI/content | PU977-G06, PU977-G07 | Spanish primary states/actions/recovery render from a complete static catalog with inert untrusted values and no language-agent or model request. |
| publisher977-C62 | CLI/content | PU977-G06, PU977-G07 | French primary states/actions/recovery render from a complete static catalog with inert untrusted values and no language-agent or model request. |
| publisher977-C63 | CLI/content | PU977-G06, PU977-G07 | Portuguese primary states/actions/recovery render from a complete static catalog with inert untrusted values and no language-agent or model request. |
| publisher977-C64 | CLI/content | PU977-G06, PU977-G07 | Unknown/invalid terminal locale or an incomplete catalog falls back atomically to English without changing approved bytes/digest or granting authority. |

## 15. Documentation and discoverability

Document the supported route/defaults/preview, relevant credentials, drift, uncertain effects, purpose-bound resume, legacy compatibility, source/default/native distinctions and rollback. Update existing CLI help, how-to-use/configuration, provisioning/troubleshooting, Bugbot failure guidance and issue977 evidence. Register actual code/test/docs only as implemented; regenerate and validate the catalog. Keep existing routes and validate links/content/locale fixtures.

Existing paths below are verified; Create paths are explicit proposed filenames under existing directories, not claimed implementation or catalog evidence.

| Path | Change |
|---|---|
| `specs/setup-bugbot-publisher-manifest-route.md` | create |
| `specs/organization-configuration-reuse-and-batch-setup.md` | update |
| `src/cli/commands/setup.ts` | update |
| `src/cli/commands/setup_execution.ts` | update |
| `src/cli/setup_command_options.ts` | update |
| `src/domain/setup_publisher_installation.ts` | create |
| `src/application/contracts/setup_installation_delivery.ts` | create |
| `src/application/ports/setup_installation_delivery_ports.ts` | create |
| `src/application/policies/setup_publisher_installation_policy.ts` | create |
| `src/application/policies/setup_installation_receipt_policy.ts` | create |
| `src/application/policies/setup_installation_tree_policy.ts` | create |
| `src/application/policies/setup_publisher_message_catalog.ts` | create |
| `src/application/usecases/setup/deliver_setup_installation_use_case.ts` | create |
| `src/application/usecases/setup/review_setup_publisher_installation_use_case.ts` | create |
| `src/application/usecases/setup/apply_setup_batch_use_case.ts` | update |
| `src/application/ports/setup_batch_ports.ts` | update |
| `src/infrastructure/setup_batch_github_apply_adapter.ts` | update |
| `src/infrastructure/setup_installation_github_delivery_adapter.ts` | create |
| `src/infrastructure/setup_operation_journal_store.ts` | create |
| `src/infrastructure/setup_batch_journal_adapter.ts` | update |
| `src/infrastructure/setup_publisher_journal_adapter.ts` | create |
| `src/infrastructure/composition/setup_publisher_installation_composition_root.ts` | create |
| `src/cli/setup_publisher_installation_adapter.ts` | create |
| `src/application/policies/__tests__/setup_publisher_installation.test.ts` | create |
| `src/application/usecases/setup/__tests__/setup_publisher_installation.test.ts` | create |
| `src/infrastructure/__tests__/setup_publisher_installation.test.ts` | create |
| `src/cli/__tests__/setup_publisher_installation.test.ts` | create |
| `src/tooling/__tests__/setup_publisher_installation_package.test.ts` | create |
| `src/architecture/__tests__/setup_doctor_boundaries.test.ts` | update |
| `scripts/coverage-budgets.json` | update |
| `docs/how-to-use.mdx` | update |
| `docs/configuration.mdx` | update |
| `docs/security-operations/operations/provisioning.mdx` | update |
| `docs/security-operations/operations/troubleshooting.mdx` | update |
| `docs/bugbot/failure-scenarios.mdx` | update |
| `specs/catalog.json` | update |
| `specs/CATALOG.md` | update |

Implementation responsibilities:

Path: `specs/setup-bugbot-publisher-manifest-route.md`. The Action publishes this companion for the existing setup-and-doctor capability; the existing registered owner remains coordinated.

Path: `specs/organization-configuration-reuse-and-batch-setup.md`. Update the registered setup owner through the official SDD flow on a suitable Action-managed source branch.

Path: `src/cli/commands/setup.ts`. Update option declaration and Commander provenance adaptation.

Path: `src/cli/commands/setup_execution.ts`. Update early explicit dispatch before generic terminal/config/credential/probe setup.

Path: `src/cli/setup_command_options.ts`. Update closed explicit-option facts; no Commander DTO in pure policy.

Path: `src/domain/setup_publisher_installation.ts`. Create publisher proposal/plan and closed purpose-bound operation entities.

Path: `src/application/contracts/setup_installation_delivery.ts`. Create narrow approved-final-files and common delivery receipt contracts.

Path: `src/application/ports/setup_installation_delivery_ports.ts`. Create read/freshness/commit/ref/PR/journal ports without resource writers.

Path: `src/application/policies/setup_publisher_installation_policy.ts`. Create bounded proposal/source derivation, two-file plan and freshness policy.

Path: `src/application/policies/setup_installation_receipt_policy.ts`. Create shared pure receipt/final-file derivation; legacy wrapper preserves its existing manifest behavior.

Path: `src/application/policies/setup_installation_tree_policy.ts`. Create complete approved-trie/sibling/tree admission policy.

Path: `src/application/policies/setup_publisher_message_catalog.ts`. Create complete static en/es/fr/pt primary content and atomic fallback using existing catalog primitives.

Path: `src/application/usecases/setup/deliver_setup_installation_use_case.ts`. Create extracted common file-delivery phases used by ordinary batch and publisher.

Path: `src/application/usecases/setup/review_setup_publisher_installation_use_case.ts`. Create narrow read/review/approve/resume orchestration.

Path: `src/application/usecases/setup/apply_setup_batch_use_case.ts`. Update delegation of file phases; retain ordinary resource stages and policy.

Path: `src/application/ports/setup_batch_ports.ts`. Update reference to shared delivery contracts while retaining legacy resource boundaries.

Path: `src/infrastructure/setup_batch_github_apply_adapter.ts`. Update delegation to the common GitHub file-delivery implementation; preserve broad legacy revalidation.

Path: `src/infrastructure/setup_installation_github_delivery_adapter.ts`. Create extraction of existing fixed commit/ref/PR transport and complete-tree verification, not a second installer.

Path: `src/infrastructure/setup_operation_journal_store.ts`. Create extraction of existing private UUID/file/lock primitives shared by both typed journals.

Path: `src/infrastructure/setup_batch_journal_adapter.ts`. Update delegation while preserving strict v1 parse/records/recovery.

Path: `src/infrastructure/setup_publisher_journal_adapter.ts`. Create closed publisher-v2 parser/store facade in the same private namespace.

Path: `src/infrastructure/composition/setup_publisher_installation_composition_root.ts`. Create narrow real composition without Variables/Secrets/grants/labels/issue-types/probe writers.

Path: `src/cli/setup_publisher_installation_adapter.ts`. Create terminal read/preview/approval rendering and local credential boundary.

Path: `src/application/policies/__tests__/setup_publisher_installation.test.ts`. Create pure policy/receipt/tree/catalog controls, with exact case traceability.

Path: `src/application/usecases/setup/__tests__/setup_publisher_installation.test.ts`. Create application review/recovery and shared-coordinator controls.

Path: `src/infrastructure/__tests__/setup_publisher_installation.test.ts`. Create read/delivery/journal/provider adversarial controls and legacy parity.

Path: `src/cli/__tests__/setup_publisher_installation.test.ts`. Create actual CLI/provenance/content route controls.

Path: `src/tooling/__tests__/setup_publisher_installation_package.test.ts`. Create real packed CLI/transport boundary controls.

Path: `src/architecture/__tests__/setup_doctor_boundaries.test.ts`. Update actual composition/dependency enforcement.

Path: `scripts/coverage-budgets.json`. Register new pure/module floors and preserve complete changed-path coverage acceptance.

Path: `docs/how-to-use.mdx`. Update supported route, defaults, four static locales and exact preview.

Path: `docs/configuration.mdx`. Update supported route, defaults, four static locales and exact preview.

Path: `docs/security-operations/operations/provisioning.mdx`. Update bounded permissions, retained effects, purpose-bound resume and unknown-object recovery.

Path: `docs/security-operations/operations/troubleshooting.mdx`. Update bounded permissions, retained effects, purpose-bound resume and unknown-object recovery.

Path: `docs/bugbot/failure-scenarios.mdx`. Update prepared/installed/native-canary distinctions and exact tuple evidence.

Path: `specs/catalog.json`. Register actual implemented evidence, regenerate and validate with implementation.

Path: `specs/CATALOG.md`. Register actual implemented evidence, regenerate and validate with implementation.

The operational #977 evidence packet is maintained on its own retained branch after actual source integration; it is not an existing file at this immutable source-feature base. Its prepared source is [the historical review packet](https://github.com/vypdev/copilot/blob/c7d6d6a2eb0db6d02376df8348707e5795a36999/quality/bugbot/evidence/issue-977/README.md). This link is history, not installation authority.

## 16. Acceptance scenarios

Valid supported proposal yields a complete two-file preview with zero effects. Dry-run/decline writes nothing. Fresh approval yields one exact prepared parent/tree/receipt and one owned ref/PR. Exact installed bytes produce no empty PR. Foreign/renamed/incomplete/future/denied state blocks. Pre-write drift stops; post-effect drift reports partial. Unknown outcomes preserve receipts and avoid duplicate writes. Cross-purpose/legacy records cannot acquire authority. Ordinary batch keeps resource stages and Secret retention while the publisher composition has none. Four static catalogs/fallback and actual packed CLI entrypoints behave as declared. Source acceptance ends at these tested behaviors; actual installation/native acceptance remains separately open in #977.

## 17. Requirements traceability

| Requirement | Cases |
|---|---|
| PU977-G01 | publisher977-C01, publisher977-C02, publisher977-C03, publisher977-C04, publisher977-C05, publisher977-C06, publisher977-C12, publisher977-C16, publisher977-C17, publisher977-C18, publisher977-C19, publisher977-C20, publisher977-C21, publisher977-C22, publisher977-C24, publisher977-C45, publisher977-C47, publisher977-C56, publisher977-C58 |
| PU977-G02 | publisher977-C06, publisher977-C07, publisher977-C08, publisher977-C09, publisher977-C17, publisher977-C21, publisher977-C22, publisher977-C25, publisher977-C26, publisher977-C27, publisher977-C35, publisher977-C40, publisher977-C49, publisher977-C51, publisher977-C57 |
| PU977-G03 | publisher977-C04, publisher977-C09, publisher977-C10, publisher977-C15, publisher977-C26, publisher977-C30, publisher977-C31, publisher977-C33, publisher977-C37, publisher977-C38, publisher977-C39, publisher977-C40, publisher977-C42, publisher977-C43, publisher977-C44, publisher977-C46, publisher977-C59, publisher977-C60 |
| PU977-G04 | publisher977-C06, publisher977-C14, publisher977-C27, publisher977-C28, publisher977-C29, publisher977-C30, publisher977-C31, publisher977-C32, publisher977-C33, publisher977-C34, publisher977-C35, publisher977-C36, publisher977-C38, publisher977-C41, publisher977-C42, publisher977-C43, publisher977-C44, publisher977-C45, publisher977-C46, publisher977-C52, publisher977-C60 |
| PU977-G05 | publisher977-C08, publisher977-C13, publisher977-C17, publisher977-C18, publisher977-C19, publisher977-C23, publisher977-C25, publisher977-C26, publisher977-C41, publisher977-C48, publisher977-C50, publisher977-C51, publisher977-C56, publisher977-C57, publisher977-C59 |
| PU977-G06 | publisher977-C24, publisher977-C36, publisher977-C47, publisher977-C48, publisher977-C49, publisher977-C50, publisher977-C51, publisher977-C52, publisher977-C53, publisher977-C54, publisher977-C55, publisher977-C57, publisher977-C58, publisher977-C61, publisher977-C62, publisher977-C63, publisher977-C64 |
| PU977-G07 | publisher977-C05, publisher977-C10, publisher977-C11, publisher977-C12, publisher977-C13, publisher977-C14, publisher977-C16, publisher977-C20, publisher977-C23, publisher977-C29, publisher977-C34, publisher977-C52, publisher977-C54, publisher977-C56, publisher977-C59, publisher977-C60, publisher977-C61, publisher977-C62, publisher977-C63, publisher977-C64 |
| PU977-G08 | publisher977-C15, publisher977-C24, publisher977-C53, publisher977-C60 |

Each case is counted once. Architecture owns layer/composition enforcement; section15 owns documentation paths. #977 actual authorization/default/native observations are not unit cases and cannot be inferred from this source feature's pass.

## 18. Implementation sequence

Resolve this bounded feature through the official first-SDD/seed gate on its Action-created branch. Implement pure scope/approval/tree policy; extract shared contracts/coordinator/provider/store with legacy parity; add publisher review/apply/resume and early CLI dispatch; complete static content, docs/catalog/package/security fixtures; meet all 64 cases, changed-path/global coverage and final native findings. Only then prepare #977's exact installation; do not ask for installation permission before the concrete preview is reviewable.

## 19. Definition of Done

- Official SDD/owner/branch readiness is verified before implementation.
- All 64 new cases and unchanged legacy/global/module/changed-path gates pass.
- Real CLI and packed route, actual narrow composition, shared delivery and v1/v2 recovery are enforced.
- Exact preview, fresh approval, complete tree proof and truthful retained-state UI work in all four locales/fallback.
- Docs/help/catalog/generated assets agree; actual build/type/lint/package/workflow/spec/documentation checks and final SHA native findings are complete.
- Source integration creates no default installation, canary, model request, release, protection/runner change or production activation.
- #977's installation authorization/default/native acceptance and #981/#982's14 observations remain explicitly separate, with no false completion claim.

## 20. References and decisions

Use the installed workflow skill/profile/guide, canonical specification standard/template/catalog, full organization reuse/batch owner, and actual CLI/prepare/apply/delivery/journal/proposal sources. The extended read-only design retains the source evidence and rejected alternatives; it is not an implementation or native result. Primary GitHub references are in section2. Decisions are one explicit publisher purpose, existing compatible manifest/guidance, fixed source-byte derivation, complete tree proof, common delivery/store and purpose-separated v2 state. Reject fake generic configuration, no-op writers, arbitrary renderers, parallel installers, hand-created remote refs and automatic installation/verification claims.
