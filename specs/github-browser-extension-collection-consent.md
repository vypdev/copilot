# Durable local collection consent and activity retention

- Status: Draft; prospective refinement, not implemented acceptance
- Date: 2026-10-30
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
start/stop application services and a bounded ticket writer are now present.
The background now shares its preference repository with that collection owner
and exposes closed, native-client-bound history/review use cases. The actual
center now produces accepted recent destinations under private native consent
and generation fences. Preference services now produce current-operation facts
and optional redacted history. Session/compound-operation and helper producers,
and native/human acceptance remain incomplete. The mounted center now
has a source-validated typed client and four-locale read/start/stop/clear/export
controls, independent of preference-read availability. Saved collection flags
still default false; opening a screen does not opt into collection.

### 2.3 Evidence

See `local_journal.ts`, `journal_store.ts`, `journal_reviews.ts`,
`settings_repository.ts`, `settings_mutation_queue.ts`, `settings_write_effects.ts`,
`collection_coordinator.ts`, `collection_restrictions.ts`, `center_settings.ts` and
the [journal refinement](github-browser-extension-local-journal.md). Current
deterministic fixtures are not native-browser acceptance. Primary sources: section20.
`collection_reviews.ts` and `collection_effects.ts` now retain exact plans and
execute their independent preference/policy phases behind explicit renderer reviews.
`journal_writer.ts`, `journal_work_queue.ts`, `journal_writer_io.ts` and
`journal_progress.ts` add secondary retention. `observed_journal_store.ts` delivers
canonical clear observations before releasing deferred old work. Their application
fixtures do not establish production composition or native/browser acceptance.
`collection_history.ts`, `history_controls.ts`, `history_gateway.ts` and
`history_protocol.ts` now compose one preference queue, actual writer idle,
controller/credential fences and independent history reads. `history_runtime.ts`
opens native history lazily; background bootstrap follows listener registration.
These deterministic composition tests are not loaded-browser acceptance.
`history_client.ts`, `history_reader.ts` and `history_review_client.ts` retain
bounded private selectors behind immutable public facts. The mounted local
routes use literal lazy components, independent read availability, shared
navigation guards and exact reviewed export bytes. DOM contract tests are not
loaded-browser or human evidence. A timed-out result inspection cannot erase
an earlier clear acknowledgement; delayed old reads cannot republish cleared
or superseded entries.
`recents_capture.ts`, `recents_client.ts`, `visit_delivery.ts` and
`center_visits.ts` now compose a closed native permit, bounded source delivery
and safe destination projection. `center_app.ts` observes only accepted visible
navigation and the first admitted current view. Native gateway, application and
mounted DOM cases exercise consent/source/epoch fencing, no backfill or resend,
private-detail removal and four-locale delivery uncertainty. They do not establish
real-browser or human acceptance.
`settings_observation.ts`, `settings_operation_target.ts`, `current_operations.ts`
and the actual `settings_operations.ts`/`settings_repository.ts` observer compose
validated intent, an observed store attempt and independent persistence facts.
`current_operation_reader.ts`, `center_client.ts`, `center_app.ts` and
`CurrentOperationPanel.svelte` expose bounded metadata and four-locale progress
independently of optional history and primary preference reads. Deterministic
native-gateway and mounted cases do not establish loaded-browser acceptance.

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
| Start | Reviewed service and closed gateway | Actual localized controls and trusted producers |
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

### 6.6 Bounded retained observations

Trusted use cases MUST admit only a validated, frozen, closed fact under known
active consent and a known history epoch. Admission creates an opaque in-process
object ticket; no renderer can supply it. Unknown consent admits nothing. Active
consent with an unknown epoch drops the observation and marks history incomplete;
later availability MUST NOT retrospectively capture it.

Track at most200 logical tickets for five minutes from first observation. A
single-flight writer coalesces changes to the same ticket without consuming more
slots. Pending/running records cannot be evicted to make room; only idle completed
or failed unproven slots can be replaced. Capacity, invalid clock and expiry are
closed retention issues, never a failure of the primary operation. A retained
entry's time describes its first observation, not a fabricated completion time.
Expiry is enforced on admission, update and native submission; no timer wakes a
worker. Stale in-memory slots are discarded on access or disposal, without a
promise of physical cleanup at the exact five-minute boundary.

An unknown append has no proved durable row identity. Do not guess a sequence by
matching time, action or payload, repeat the append, or attach later updates to a
similar row. A known append permits updates to its exact epoch, sequence, original
time and action, including while collection is off. An uncertain update may be
observationally reread. That reread never resubmits the write; only a different,
new explicit observation may advance the known row. Already established
acknowledgement/completion cannot be downgraded by weaker later availability.
If reviewed was persisted, a coalesced settled fact still passes through the
required persisted submitted transition. A not-yet-written first observation may
already describe a settled operation without inventing earlier retained events.

Clear and activation reservations defer new native writer jobs. Clear's idle
check measures the actual writer, not the coordinator's reservation eligibility.
The canonical clear epoch MUST reach the writer before lease release, retire
old tickets and queued work, and prevent any late continuation from recreating
them. A failed clear releases deferred admitted updates without claiming deletion.
Late reads cannot lower a known epoch/revision or erase a newer observation.
Failed retention/readback/notification never changes primary success.

### 6.7 Production ownership and closed control channel

The background MUST use the same `SettingsRepository`, coordinator, writer and
native policy/journal ports for ordinary saves, collection review and clear.
Constructing them performs no storage/native I/O; all wake listeners register
before bootstrap. Native IndexedDB acquisition is lazy and fails closed in a
private context or when unavailable. Secondary storage failure cannot prevent
unrelated preferences from saving. Bootstrap reads control metadata even when
capture is off and primes journals only for verified active consent; it never
creates retrospective entries.

The native-center protocol accepts only one fixed history kind per read,
retained start/stop previews, clear previews, confirmation/cancellation IDs and
read-only inspection of a retained result and the narrow destination producer
below. It MUST NOT accept generic recording facts, policy nonces, private guards, store names,
arbitrary commands or provider operands. The existing extension-origin,
document/tab binding, editor/controller and credential checks apply. An observer
may inspect; only the current editor may change authored preferences or collection
controls. Both roles may report their own consented local destinations. Controller changes invalidate
both retained plan families. A native reread rechecks its current binding and
credential after I/O before publishing the view.

Known history remains independently readable when authored preferences are
unreadable. The view reports collection state, writer availability and retained
data separately; unknown settings never become invented off/on preferences.
History changes notify only native centers and never reset content quarantine.
Current compound collection results preserve their independent preference and
policy facts. A collector MUST NOT flatten partial results into completed history;
session/compound-operation and helper producers remain required delivery work.
Localized controls, the narrow destination producer and native preference
observations are composed in development source.

After a lost response, inspecting the exact retained review MUST NOT submit or
repeat any effect. It reports pending, the same immutable historical result,
expired/stale/denied, or that this owner has not observed a confirmation for the
still-retained plan. That last observation does not prove an earlier IPC request
cannot arrive later. No read resets the five-minute lifetime or extends the32-result
bound. It requires the original current editor/controller/credential context;
another review family or client cannot reuse its selector. Current collection
and historical result remain separate. Retry is always an explicit reviewed
gesture; never convert a status read into confirmation or infer a result from
matching state/payload.

### 6.8 Admitted local destinations

Recent destinations MUST come only from the packaged application's accepted
navigation or its first admitted current view after native startup. A guarded
destination, Stay, focus refresh or intended navigation is not a visit. Profile
detail is generalized to Profiles; only registered feature IDs may accompany
Features. No URL, private label, authored target or caller timestamp is accepted.

```text
Known active consent + history generation → private native source permit
 → accepted local destination snapshots that permit → bounded delivery
 → native source/permit recheck → ordinary generation-checked journal writer
```

The permit is worker-local, purpose-separated from review/operation IDs and
bound to the native document/tab, client, controller/credential epochs, current
admission witness and known history generation. Keep at most8 source permits.
It grants no browser permission, GitHub capability, preference mutation or review
approval. Both native editor and observer windows may report their own admitted
destinations under the same explicit collection consent. No permit may enter a
presentation model, export, preference or journal. Invalidation MUST retire a
permit irreversibly when consent becomes unknown/paused, its witness changes or
history loses/changes generation; later recovery cannot revive it.

The closed capture endpoint reads already known metadata without I/O. The closed
observation endpoint accepts only a permit and local destination, never generic
facts, private guards or storage commands. Both keep existing native-origin,
document/tab and source-epoch checks. Acknowledging observation does not establish
durable retention; the writer's independent state remains authoritative.

The application MUST snapshot source and permit when observing the visit. Keep
one delivery active and one latest pending visit; replacement is disclosed as
unconfirmed delivery. Never acquire new consent for an old queued visit or retry
an unknown submission. Fresh capture reads are independently single-flight with
one coalesced trailing read. Controller/credential changes, clear and disposal
retire stale queued work. Old callbacks cannot republish permits or incompleteness
in a newer generation. Native duplicate delivery returns its original observation
answer without another append. Each captured visit has a positive safe-integer
sequence, local to this source permit. Equal sequence/destination replays the
same answer; an older sequence is stale and equal sequence with changed content
is invalid. The sequence never becomes a journal row identity or proves durable
retention. Capture metadata includes the source high-watermark so a resumed
client does not reuse earlier sequences. An exhausted delivery sequence rotates
only this ephemeral permit namespace for future observations; it never resets
journal/policy counters or retries an earlier event. Cache pruning MUST NOT touch other native clients
and accidentally extend their idle lifetime.

The Activity/Privacy recent-destination section discloses unconfirmed observations
in the current window separately from native writer pending/dropped facts. It
does not claim that transport acknowledgement means a retained row. Opening with
consent off performs no history write and reports no invented retention gap.

### 6.9 Native preference observations and current operation

The preference owner MUST retain the action returned by validated planning. It
MUST NOT infer the action later from changed preferences. A narrow synchronous
observer receives only that action, a separately captured ephemeral target and
the original source fence. No renderer recording method is introduced.

```text
Validated retained preview → current operation and optional reviewed ticket
 → confirmation registered as single-flight → confirmation pending
 → actual preference-store attempt → submission observed
 → independent acknowledgement and canonical readback
```

Text equivalent: preview capture precedes confirmation; current confirmation is
distinct from an observed store submission. Optional history and private current
state are separate outputs. Observer or retention failure cannot change the
primary result, block a preference queue or trigger a write retry.

The current operation is worker memory, available even with collection off or
native history unavailable. Keep at most one current entry per native client,
at most8 entries total, for five minutes from first observation. Reads and updates
MUST NOT extend that lifetime. A profile label/detail or numeric repository target
may appear only in this current source context. Source loss, replacement, expiry,
clock failure, eviction and shutdown erase that target irreversibly. A subsequent
read cannot reconstruct it from preferences, a receipt or generated history.
Pruning other entries MUST NOT call their native authorization callbacks.

`center.operation.read` is a closed native-client-bound metadata read, with only
version and client ID. It performs no preference, store or provider I/O and exposes
no native selectors, ticket or reusable approval. The existing source-tree,
extension-origin, document/tab and controller fences apply. Secondary updates use
only `center.operation.invalidated`; they never reset content quarantine.

The current view distinguishes reviewed, confirmation pending, observed
submission, cancelled, blocked, settled and unknown. It shows the last proved
acknowledgement/canonical observation and history retention independently. An
unexpected service failure without an observed submission MUST NOT fabricate a
submitted history transition. A canonical replay establishes historical completion
with unknown acknowledgement unless that acknowledgement was already proved.
A later unavailable observation cannot erase an established committed result.
An ordinary canonical preference read may reconcile the same retained unknown
confirmation only after checking owner, lifetime, native fence, receipt ID,
before revision and the complete expected after-state. No write is repeated and
no private target is reconstructed. At most32 completed results retain an expected
preference snapshot only while unknown, for the existing five-minute result-cache
lifetime; invalidation, expiry, eviction or proved completion releases it. These
private primary-service expectations never enter current metadata, journal or export.

The store-attempt observer runs after invoking the native preference-store port,
including synchronous failure, and before awaiting its outcome. Known preflight
rejection has no submission event. Register the running confirmation before any
observer can reenter; duplicates share its exact promise, and cancellation reports
pending after confirmation has begun. A newer current operation is never replaced
by an older completion. Already admitted history tickets may update their exact
known row while collection is off, but no later phase may obtain a fresh ticket
for a preview observed while off/unknown. Clear continues to fence old tickets.
Completed primary results MUST be detached immutable copies at the secondary
observer boundary; an observer cannot mutate their retained replay. Current
metadata starts once native editor/observer binding is admitted, before waiting
for the primary preference read. It has one active request and one coalesced
trailing refresh. Source invalidation immediately redacts private targets;
shutdown or a reentrant source change cannot publish a late private response.
Clearing generated history MUST NOT claim to clear this independent temporary
current-operation memory.

This first family covers preference operations. Session vault/active-connection
phases and compound collection preference/policy phases require their own closed
projections; neither may be guessed from a top-level result or flattened into this
family. Complete H3 still requires those producers and the mounted/native journeys.

## 7. User-facing configuration

| Input | Default | Scope/limit |
|---|---|---|
| `center.diagnostics` | false | Redacted diagnostics/operation facts,200entries/7days |
| `center.recents` | false | Extension-owned destinations,50entries/7days |
| Writer | fixed | At most200pending/coalesced logical tickets, five-minute tracking |
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
| Bounded writer/ticket ownership | 64 | Opt-in timing, cap/coalescing, expiry, unknown append identity, known-row reconciliation, clear/late-result races, primary-result isolation |
| Production ownership and closed gateway | 40 | Same preference owner, lazy listener-first bootstrap, independent reads, native binding/editor/credential fences, plan-family isolation, private-context/storage failure, center-only notifications |
| Native destination permits/producer | 20 | Known consent/epoch, irreversible retirement, native document/editor-observer/credential boundaries, duplicate/capacity/reentry/fault isolation |
| Bounded destination client | 18 | Captured scope, no backfill, single flight/latest pending, uncertain delivery, context/epoch rollover and late replies |
| Actual navigation composition | 12 | Initial admitted view, accepted/canceled/stay/leave, observer, profile generalization/feature IDs, off/unknown consent, separate privacy queries and uncertainty UI |
| Preference observation projection | 16 | Validated action/target, preflight versus submission, acknowledgement/readback, replay and unknown provenance |
| Current-operation ownership | 24 | Eight lifetime/clock cases, six retention-isolation cases, four source boundaries and six replacement/reentry/disposal races |
| Actual preference producers | 20 | Six admission/no-op cases, six outcome paths and eight duplicate/reentry/source/clear cases |
| Mounted current-operation view | 12 | Four complete locales plus eight metadata failure, target retirement, independent state and lifecycle cases |
| Typed client/response closure | 120 | Closed detached replies, source binding, wrong-family/scope, immutable independent facts |
| Reader/review/export ownership | 35 | Read-after-clear/revision races, retained result inspection, known-fact preservation, explicit exact-byte download, retirement/single flight |
| Mounted UI/locales/export/recovery | 40 | Independent phase facts, editor/observer, guarded navigation,4locales, accessible JSON, separate privacy inspectors |
| Real targets and human | 9 | Three native journeys per target plus owning human gate |
| **Total** | **623** | No substitution for semantic H3/catalog coverage |

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
The writer's eight application/domain suites cover bounded ownership, uncertainty,
reconciliation, clear composition, queue faults and frozen projections.
`recents_capture.test.ts`, `recents_client.test.ts`, `visit_delivery.test.ts`,
`recents_gateway.test.ts` and `recents_center.test.ts` now exercise the actual
destination producer and mounted navigation. Loaded-browser and human acceptance
remain separate required evidence.
`settings_observation.test.ts`, `current_operations.test.ts`,
`settings_observer.test.ts`, `settings_operation_gateway.test.ts`,
`current_operation_reader.test.ts`, `current_operation_center.test.ts`,
`current_operation_independent.test.ts` and `center_client_operation.test.ts`
cover the preference projection, native observation, independent metadata and
mounted four-locale flow. Existing transaction-outcome cases verify observer
failure isolation after the actual native store attempt.

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
11. Unknown append cannot be retried or joined to a guessed row; a known-row
    uncertainty is read back without automatic resubmission.
12. An update queued behind a real clear reservation cannot recreate cleared
    history; failed clear releases the work and leaves existing history intact.
13. Native-client-bound authored controls use the actual preference queue; an
    observer, replaced document, moved credential or arbitrary recording operand
    cannot change preferences or collection controls.
14. Unavailable native history leaves ordinary saves functional; bootstrap runs
    after listeners, and history-only notifications never reset content quarantine.
15. With active known consent and generation, an accepted visible destination is
    projected before IPC and admitted once. An observer reports only its own
    consented navigation; no profile detail reaches IPC or storage.
16. Off/unknown, hidden, pending or canceled navigation is not captured later.
    Losing consent, native context or generation irreversibly retires old permits.
17. Burst navigation holds one active and one latest waiting delivery. Replacement
    and lost responses disclose local uncertainty in all four locales; no automatic
    resend occurs, and an old callback cannot affect the new context or clear epoch.
18. Equal source-sequence/destination replay returns its existing answer without
    appending; changed equal-sequence input is invalid and older input is stale.
    Metadata resumes the private delivery high-water mark without resetting journals.
19. A validated preference preview captures its exact action and current target;
    invalid/no-op input captures neither. Confirmation is distinct from submission,
    and duplicate confirmation shares the one retained primary promise.
20. Current metadata remains readable with history off/unavailable or a stalled
    preference read. No observer or retention failure changes the primary result.
    Source loss, expiry and disposal cannot restore private target detail.
21. An uncertain save can be reconciled only by the same current owner, exact
    receipt, before revision and complete expected after-state. No repeat write or
    target reconstruction occurs; a later failure preserves proved completion.
22. Enabling collection cannot backfill an earlier untracked preference preview.
    Generated-history clear preserves current-operation memory and erases no
    preferences, protected credentials or authored notes.

## 17. Requirements traceability

| Concern | Owner | Evidence | Documentation |
|---|---|---|---|
| Consent/off | Policy/native | Schema/migration/restart | Privacy/configuration |
| Atomic late-work fence | Transaction/recorder | Policy/source/epoch races | Contributor/recovery |
| Truthful ordered phases | Application | Partial/ack/replay/queue | Activity/privacy |
| Restriction-only save and owner lifetime | Settings/coordinator | Five application contract suites; native/UI evidence still required | Configuration/contributor |
| Reviewed phase continuation and priority of a later stop | CollectionReviews/effects/private leases | Eight retained-plan/phase/ownership/staging suites; full native/UI evidence pending | Configuration/privacy/contributor |
| Bounded secondary retention and unknown identity | JournalWriter/queue/IO/progress | Eight writer/domain/race suites; session/compound/helper producers and native evidence pending | Privacy/recovery/contributor |
| One production owner and closed native control | CollectionHistory/HistoryControls/HistoryGateway/native composition | Protocol/application/gateway/bootstrap and mounted UI suites; native/human acceptance pending | Contributor/privacy/recovery |
| Accepted destinations and consent/source retirement | RecentsCapture/RecentsClient/VisitDelivery/centerDestination/center_app | Native source, delivery, gateway and 12 mounted navigation/localization cases; real-browser/human gates outstanding | Local history/privacy/contributor |
| Actual preference observations and independent current view | SettingsOperations/SettingsRepository/CurrentOperations/CurrentOperationReader/CenterClient/center_app | Eight projection/native/reader/client/mounted suites plus direct store observer isolation; native/human gates outstanding | Local history/configuration/privacy/contributor |
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
