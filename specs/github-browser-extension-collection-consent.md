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

The source has a transactional journal, a reviewed clear service and a preference
queue reservation. They are not yet composed into collection/UI. Native database1
contains diagnostics/recents; strict saved collection flags default false.

### 2.3 Evidence

See `local_journal.ts`, `journal_store.ts`, `journal_reviews.ts`,
`settings_repository.ts`, `settings_mutation_queue.ts`, `center_settings.ts` and
the [journal refinement](github-browser-extension-local-journal.md). Current
deterministic fixtures are not native-browser acceptance. Primary sources: section20.

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
| Consent/preference coordination | 18 | Partial/unknown, restart, source change, no queue deadlock |
| Recorder/tickets/navigation | 16 | Opt-in timing, coalescing/cap, expiry, lost context |
| UI/locales/export/recovery | 20 | Independent facts, scope,4locales, a11y |
| Real targets and human | 9 | Three native journeys per target plus owning human gate |
| **Total** | **99** | No substitution for semantic H3/catalog coverage |

Count each case once. Pure branches and modified executable lines/branches100%,
no exclusions/threshold weakening; keep root budgets. Request fixtures are not
native evidence. Actual Chrome/Firefox/Safari verify preservation, durable pause
across worker restart, stale append and clear.

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
