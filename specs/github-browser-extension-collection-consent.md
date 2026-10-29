# Durable local collection consent and activity retention

- Status: Draft; prospective refinement, not implemented acceptance
- Date: 2026-10-29
- Catalog capability ID: `github-browser-extension`
- Last verified: not applicable
- Owners: Copilot maintainers
- Scope: Complete H3 local activity, diagnostics and recents collection
- Related issues/PRs: [#704](https://github.com/vypdev/copilot/issues/704)
- Required review gates: product UX, architecture, testing, documentation, security/operations
- Open decisions blocking readiness: none for this contract; implementation and source-bound native/human evidence remain required.

## 1. Executive summary

Saved collection preferences and actual collection state are separate facts.
Collection starts only after reviewed activation. A verified durable pause
survives ordinary background restarts; a failed native write cannot establish it.
Stopping preserves history until expiry or a separate reviewed clear.

```text
Review → save opt-in → activate policy → bounded collection
 → pause policy → save preference off → optionally review clear
```

All150 functions/803 catalog cases, owning H3 and CENTER remain normative.

## 2. Problem, current behavior, and evidence

### 2.1 Problem

A temporary in-memory pause cannot alone tell a restarted worker what to collect.
Treating an acknowledgement as every desired effect hides partial outcomes.

### 2.2 Current behavior

The source has a transactional journal, a reviewed clear service, a preference
queue reservation and restriction-only preference preflight. Native database2
preserves the two version1 journals and adds a fixed policy store. An application
coordinator observes consent and fences admission/clear. Dedicated retained
start/stop application services are now present. Their production collector,
gateway and center UI composition remain incomplete. Saved
collection flags still default false; these source slices do not activate them.

### 2.3 Evidence

See `local_journal.ts`, `journal_store.ts`, `journal_reviews.ts`,
`settings_repository.ts`, `settings_mutation_queue.ts`, `settings_write_effects.ts`,
`collection_coordinator.ts`, `collection_restrictions.ts`, `center_settings.ts` and
the [journal refinement](github-browser-extension-local-journal.md). Current
deterministic fixtures are not native-browser acceptance. Primary sources: section20.
`collection_reviews.ts` and `collection_effects.ts` now retain exact plans and
execute their independent preference/policy phases; they are not yet renderer controls.

### 2.4 Retrospective classification

Not applicable: prospective collection flow, not an as-built claim.

## 3. Actors, surfaces, and terminology

| Actor | Goal | Surface |
|---|---|---|
| User/editor | Confirm exact collection and clear plans | Activity, Diagnostics, Privacy |
| Observer | Read available redacted state | Read-only center |
| Background owner | Enforce admission and finite work | Narrow internal ports |

Preference is saved intent; policy is the durable admission gate. A ticket is a
private in-memory admitted observation. Acknowledgement and canonical observation
are independent. Receipts/tickets never grant browser, GitHub or setup authority.

## 4. Goals, non-goals, and fixed invariants

1. Missing/unknown/future/corrupt consent admits no capture.
2. Append compares active policy revision and journal generation atomically.
3. Existing admitted records may finish while off until clear invalidates their epoch.
4. No private target/account/repository, URL, error text, code, draft, credential
   or authored note enters policy/history; exact targets remain session-only.
5. No telemetry, browser history, generic renderer recorder or automatic retry.

Signed delivery and later GitHub-native recents remain in their existing milestones.

## 5. Current versus proposed journey

| Stage | Current source | Required outcome |
|---|---|---|
| Preference | Saved Boolean | Display independently from actual collection |
| Start | No collector | Reviewed activation after observed opt-in |
| Stop | No durable collection gate | Observed policy pause before preference-off |
| Restart | No collector | Restore only healthy active policy and canonical opt-in |
| Failure | Core closed errors | Retain completed phases and one recovery action |

```mermaid
flowchart LR
    R[Review start] --> P[Preference observed on]
    P --> A[Policy activated]
    A --> C[Bounded collection]
    C --> S[Policy observed paused]
    S --> O[Preference observed off]
    O --> D[Separate clear review]
```

Text: start is preference then activation; stop is pause then preference off;
deleting history is separate.

## 6. Functional behavior and state model

### 6.1 Policy and native schema

Keep namespace `copilot.generated-history.v1`; upgrade native database version2
with exactly diagnostics, recents and policy stores. History envelopes stay
version1. Policy has only the fixed keys diagnostics/recents. Renderers never
choose database/store/key names.

Policy has exactly schemaVersion1, kind, revision, mode(paused|active), receipt.
Missing means revision0/paused/null receipt. Nonzero revision requires one receipt
with exactly id(32lowercase hexadecimal), beforeRevision, settingsRevision;
beforeRevision+1 equals policy revision. The settings revision is historical
review context, not perpetual authority. All counters are safe nonnegative
integers; exhaustion fails closed. Policy is at most2KiB, has no time/history
trail and persists until changed.

Read does not write. Set accepts exactly type=set, expectedRevision, mode,
operationId, settingsRevision, plus a private native guard. Matching receipt
replays without writing; reused ID with a different exact plan is invalid.
Revision movement conflicts. Unknown/future data is preserved, never defaulted over.

### 6.2 Admission and clear

Append checks the supplied active policy revision and journal epoch in one
readwrite transaction spanning the selected journal and policy. Clear requires
known paused policy, exact reviewed policy/history revisions and owner/preference
reservations. Existing admitted updates cannot change their action/target or
resurrect expired/cleared records. Known history may be read while collection
state is unknown; unknown policy never authorizes mutation.

### 6.3 Ordered compound effects

Enable first saves and canonically observes reviewed opt-in, then activates the
exact policy revision under a fresh source/consent guard. If already opted in,
the dedicated retained policy plan authorizes activation itself. Importing a true
preference does not authorize activation.

Stop pauses new admissions synchronously, attempts policy pause and its canonical
read, then independently attempts preference-off. An unconfirmed policy pause
does not prevent saving a restrictive off preference; each result stays distinct.
Restriction-only preflight for a confirmed reset/import-to-off follows that order.
Retained history is preserved. A pause that could not be persisted is explicitly
session-only/unconfirmed unless the off preference is separately observed. If
neither restriction can be persisted, no durable stop can be promised.

Every false-to-true preference transition first observes or establishes a paused
policy before writing the new preference. Failure blocks that increase. Thus a
later import cannot reuse an old active marker after a partially successful stop.
Only the dedicated reviewed activation starts capture. Global feature pause also
stops new admissions without deleting consent/history; resume restores only
otherwise healthy known consent. Already admitted completions may still settle.

Every await rechecks facts before later effects. An intervening change retains
truthful partial results, never rollback or automatic repeat. Do not recursively
confirm queued settings while holding the preference reservation. Clear uses the
reservation; compound consent phases do not claim cross-storage atomicity.

### 6.4 Owner lifetime and preference preflight

The one preference FIFO admits a detached immutable before/after pair. After
validation and duplicate/revision checks, restriction-only preflight runs before
native preference publication. The source is rechecked after it resolves. Its
owned scope covers publication and canonical observation; releasing it twice,
or a cleanup/notification error, cannot erase an established primary result.
Startup migration preserves its existing behavior and grants no collection.

Consent changes retire private admission tickets synchronously before policy
I/O. All changed kinds are restricted even if another kind cannot be enabled.
A failed increase prevents publishing the combined preference plan, while any
already observed restriction remains a truthful partial fact. No cross-store
rollback or automatic repeat is implied. Unrelated saves neither rewrite policy
nor retire healthy admission. Global pause retains policy/intent; resume may
restore only healthy consent, and never the previously retired ticket.
A global pause whose preference write is uncertain also remains blocked in the
current owner. Reading an unchanged unpaused value cannot discharge it. Observing
a saved global pause establishes that restriction; a later reviewed resume may
then restore otherwise healthy consent without reviving retired tickets.

Refresh reads canonical preferences and the two fixed policy keys. Older or
mid-write reads cannot replace a newer observation. Bursts share one active
read batch and at most one coalesced trailing request, including synchronous
reentry; there is no unbounded queue of native reads. An uncertain stop remains
blocked for that owner despite later ordinary reads of an active marker. A new
owner restores only the actual persisted facts: if both restriction writes failed,
a session-only pause cannot survive restart. Report that limitation explicitly.
Known-history clear reserves the exact off preference and paused policy plus an
idle writer. It never reacquires the preference reservation already held by the
clear service. A replacement lease cannot be released by an older owner.

### 6.5 Retained start and stop

Keep at most16 pending/running plans,32 completed results and a five-minute
review/replay lifetime under the editor/controller/credential fence. Each review
retains the actual complete preference snapshot, kind, action, policy observation
and a private admission-generation witness. The public frame shows only the
exact planned preference/policy states and revisions. Its confirmation ID is
distinct from the unexecuted native policy nonce. IDs cannot collide with pending,
running/completed identities or relevant existing receipts. Completed results
discard full preference snapshots and private witnesses.

Start with off intent first confirms the retained preference through the existing
FIFO. Its mandatory preflight records at most32 consumable, operation-bound
restriction receipts, with the admission generations before/after its own change.
The after-generation is captured before asynchronous policy work, so a later stop
cannot be adopted as that older start's continuation. Activation requires the
exact previously paused revision, or the exact owned pause receipt/revision that
the opt-in preflight produced. A changed policy may leave saved intent but cannot
authorize undoing another stop. Imported intent that is already on uses a genuine
policy review without submitting an unchanged preference operation.

Only after preference publication finishes may activation acquire the idle
preference reservation. Canonical inspection must establish the complete exact
confirmed snapshot and revision, and, when changed, the owned preference receipt.
A matching receipt/opt-in with partially persisted other fields is insufficient.
No recursive queued confirmation
runs while that reservation is held. Policy activation uses its private nonce,
exact revision and source/generation guard. An independent read must establish
the exact active receipt before the current owner can admit capture. Unknown
acknowledgement may coexist with an attributed observed effect; acceptance alone
cannot establish the effect. A newer stop, changed source or incompatible data
prevents admission without erasing already submitted effects. Do not activate a
counter whose resulting active revision cannot still advance once to stop.

Stop retires admission synchronously, after registering its running operation and
before any native wait or notification callback. Under an idle preference lease,
the retained plan attempts its one metadata pause before preference publication.
Its observed restriction retires older cache reads and updates the current owner
only when its admission generation is still owned. With on intent, the result is
staged for at most16 running operations under exact operation ID/kind/preference
revision. The preference lease is released before queued commit; mandatory
preflight consumes that exact completed attempt instead of repeating an unknown
submission. A mismatching or increasing transition cannot consume it. Staging is
cleared after the operation, including failed or exhausted preference writes.
Thus an exhausted/unreadable preference store still permits the independent
durable policy stop. With already-off intent, there is no fabricated settings
change. Stop authorizes
a restriction of that kind under the current owner, not activation of a changed
policy. Future/unavailable policy and a busy secondary writer must not prevent
reviewing off; incompatible data stays preserved. Actual preference-queue
contention may leave a session-only pause and explicit partial result.

Duplicate confirmation joins one running submission; in-flight cancellation is
pending. Replay returns the same historical facts with no repeated writes.
`preferenceVerifiedAtObservation`, `admittedAtObservation` and
`sourceCurrentAtObservation` describe that result's observation, never current
collection. Observed off does not certify partially persisted unrelated settings;
retain the actual preference uncertainty and full-snapshot verification result.
The live owner view remains separate.

| State | Meaning | Primary action |
|---|---|---|
| Off | Known paused policy or canonically observed off preference | Review enable |
| Collecting | Healthy active policy and canonical opt-in | Review stop |
| Temporary pause | Memory admission stopped; durable result unknown | Read state |
| Preference saved, activation incomplete | First phase completed | Review activation |
| Durably paused, preference unchanged | Capture stopped; preference write incomplete | Review preference change |
| Unknown/future/corrupt | No admission; existing data preserved | Recovery/compatible package |

## 7. User-facing configuration

| Input | Default | Scope/limit |
|---|---|---|
| `center.diagnostics` | false | Redacted diagnostics/operation facts,200entries/7days |
| `center.recents` | false | Extension-owned destinations,50entries/7days |
| Writer | fixed | At most200pending/coalesced jobs |
| Private exact targets | session-only | Never policy/history/export |
| Authored notes | existing session default | Separate persistence/deletion review |

Recommended both off; alternative diagnostics on after disclosure, recents off.
No public settings field is silently added. Expiry stays transactional on access.
An unrelated preference change cannot reactivate collection or unnecessarily
disable a healthy existing consent.
Seven-day retention applies to entries. The journal's epoch/revision/one clock
fence and the policy's last receipt persist as safety-control metadata until
native data removal. Clear removes records and retains these disclosed controls;
it does not promise physical deletion of every extension-owned metadata value.

## 8. Clean Architecture design

| Layer | Owns | Forbidden |
|---|---|---|
| Domain | Closed policy, CAS/replay, admission | SDK/DOM/storage/time acquisition |
| Application | Reviewed phases, tickets, consent, bounded writer | Native requests |
| Browser adapter | Fixed migration and transactions | User consent decisions |
| Composition | One owner, native factories, preference preflight | Generic renderer forwarding |
| Presentation | Localized facts and exact reviews | Storage/provider effects |

```text
Review → application → pure decisions → semantic ports ← native transactions
Trusted observation → opaque ticket → finite writer → atomic admission
```

Private guards are never serialized. Reads and dependent writes are queued
synchronously in native request callbacks, with no external promise inside the
active transaction. Request success is not commit. Abort, pre-start failure and
unknown stay distinct. Guard before open, after open and before write. Existing
AST dependency/cycle/pure/size/package constraints remain enforced.

## 9. UI/UX and content contract

```text
Diagnostics and operation history — Off
Saved preference: Off. Actual collection: Paused.
Up to200 redacted records for7days. Private targets are not retained.
[Review enable] [Inspect retained history]

Review enable
1 Save the displayed preference.
2 Start collection at the reviewed policy revision.
[Enable collection] [Cancel]
```

Pending: “Saving the preference. Collection has not started.” Partial start:
“Preference saved. Collection is still paused. Review activation.” Partial stop:
“Collection is durably paused. The preference change is not confirmed.” Unknown:
“Paused in this process. Durable stop is not confirmed. Read state; disable the
extension in browser settings if local storage cannot confirm the stop.” Complete:
“Collection is off. Retained history remains until expiry or reviewed clear.”

One primary action; visible scope; separate acknowledgement/observation. Cancel
before effects; in-flight is pending/unknown, never falsely aborted. Complete
en/es/fr/pt, keyboard/focus, screen reader,320CSSpx/200%zoom, themes/reduced motion.
Receipts are collapsed technical detail. No automatic issue/comment/notification.

## 10. Failure, recovery, and cleanup

Failed retention does not change primary settings/connection success. Old tickets
cannot cross clear. Unknown submission is not retried blindly. A full queue or
unknown epoch marks history incomplete and drops bounded work. Cleanup/readback
failure cannot erase success. Future/corrupt policy requires compatible recovery,
never automatic database removal.

## 11. Security, permissions, and privacy

Trusted use cases admit closed facts. Source/account changes cannot join an exact
private target to another context. Recents generalize profile labels and record
actual admitted destinations, never canceled/intended navigation. No history
permission, raw errors, credentials or remote uploads. Export remains separately
reviewed nonsecret JSON at most64KiB; notes/preferences/policy/history have distinct scopes.

## 12. Observability and operational UX

Separate saved preference, actual policy, current operation, retained history and
writer availability. Drops/unknowns are inspectable without private data. Use
center-only notification, never content-quarantine reset. No retrospective capture
on opt-in. An explicit old-ring sample is an observation at capture time.

## 13. Compatibility, migration, rollout, and rollback

Database0 creates three fixed stores. Known database1 with exactly the two owned
stores adds policy without changing records; missing policy is paused. Unexpected
layouts abort/preserve; no deletion/recreation. Close stale connections on version
change and late blocked opens. Older v1 code sees future DB as unavailable; H2
never used it. Preserve registered Safari rollback. No dependency/SDK/permission
upgrade or publication is implied.

## 14. Testing strategy and numeric budget

| Area | Minimum distinct cases | Risk |
|---|---:|---|
| Policy schema/CAS/replay | 16 | Closed fields, future preservation, counter/identity bounds |
| Native migration/admission | 20 | V1 preservation, stale/inactive writer, request/commit/abort |
| Preference write preparation | 14 | Commit/update, immutable input, replay, failure/cleanup, source retirement |
| Restriction and observation | 18 | CAS, unknown/accepted/not-applied, closed reads, no invented attribution |
| Consent owner and coordination | 35 | Partial stop, import, restart, late reads/burst/reentry/disposal, independent kinds, clear leases/global pause |
| Retained start/stop application plans | 90 | Exact phase/full-snapshot receipts, ownership/lifetime/capacity, exhausted/unreadable stores, scoped stop staging/races, independent acknowledgement/readback, replay/cleanup |
| Recorder/tickets/navigation | 16 | Opt-in timing, coalescing/cap, expiry, lost context |
| UI/locales/export/recovery | 20 | Independent facts, scope,4locales, a11y |
| Real targets and human | 9 | Three native journeys per target plus owning human gate |
| **Total** | **238** | No substitution for semantic H3/catalog coverage |

Count each case once. Pure branches and modified executable lines/branches100%,
no exclusions/threshold weakening; keep root budgets. Request fixtures are not
native evidence. Actual Chrome/Firefox/Safari verify preservation, durable pause
across worker restart, stale append and clear.
Application ownership cases live in `settings_collection_preflight.test.ts`,
`collection_restrictions.test.ts`, `collection_coordinator.test.ts` and
`collection_preference_coordination.test.ts`, plus `collection_global_pause.test.ts`.
Their contract fixtures are not
native-browser, renderer or complete-milestone acceptance.
Retained plans add `collection_reviews.test.ts`, `collection_review_races.test.ts`,
`collection_review_failures.test.ts`, `collection_review_lifetimes.test.ts`,
`collection_review_bounds.test.ts`, `collection_review_phase_fences.test.ts` and
`collection_activation_ownership.test.ts` and `collection_stop_staging.test.ts`;
count their distinct cases once.

## 15. Documentation and discoverability

Activity/Privacy: opt-in, start/stop versus clear, independent facts. Configuration:
bounds/import-not-activation/notes. Recovery: quota/unknown/durable stop and native
disable on actual storage failure. Contributor: policy/queue ownership, migration,
guards, bounded writer and center-only notification. Register and validate routes,
docs/specs/catalog and concrete examples together.

## 16. Acceptance scenarios

1. Missing consent admits no capture or automatic activation.
2. Enable displays saved intent separately from observed active policy.
3. Durable stop survives worker restart while retaining history.
4. Lost acknowledgement may establish state without attributing the write.
5. Stale policy/cleared epoch cannot append or resurrect a record.
6. Source/state movement between phases preserves completed facts and stops later effects.
7. Import true does not start collection; reset/off pauses first.
8. Database1 upgrade preserves records and defaults collection paused.
9. Future/private input stays inert without private output.
10. Full native/human/H3/current-base review and remote Codecov gates pass.

## 17. Requirements traceability

| Concern | Owner | Evidence | Documentation |
|---|---|---|---|
| Consent/off | Policy/native | Schema/migration/restart | Privacy/configuration |
| Atomic late-work fence | Transaction/recorder | Policy/source/epoch races | Contributor/recovery |
| Truthful ordered phases | Application | Partial/ack/replay/queue | Activity/privacy |
| Restriction-only save and owner lifetime | Settings/coordinator | Five application contract suites; native/UI evidence still required | Configuration/contributor |
| Reviewed phase continuation and priority of a later stop | CollectionReviews/effects/private leases | Eight retained-plan/phase/ownership/staging suites; full native/UI evidence pending | Configuration/privacy/contributor |
| Minimal discoverable facts | Presentation | Locales/a11y/export | User navigation |

## 18. Implementation sequence

Policy schema/migration/admission; coordinator/preflight/reviews/recorder; actual
localized activity/privacy/diagnostics/export; docs/full coverage; native/human
evidence and complete current-head review.

## 19. Definition of Done

- [ ] All states implemented, traced and documented.
- [ ] Preservation/atomic admission/stop/clear pass all three targets.
- [ ] No false cross-storage atomicity, cancellation, live replay or private evidence.
- [ ] Primary success survives retention/readback/cleanup failures.
- [ ] Four locales/a11y, numeric cases and coverage pass.
- [ ] Complete #704 checks/review/no findings/remote Codecov100% pass.
- [ ] Full150/803 and later milestones stay unchanged.

## 20. References and decisions

[Owning H3](github-browser-extension-control-center-h3.md), CENTER catalog and
[journal](github-browser-extension-local-journal.md).
[Native transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction),
[open/version events](https://developer.mozilla.org/en-US/docs/Web/API/IDBFactory/open),
[worker persistence](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
primary sources checked2026-10-29. Same DB gives policy/admission atomicity;
ordered preference phases give truthful partial outcomes. No durable guarantee
from an uncompleted write, OS power loss or browser-owner removal. #763 is deferred.
