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
and optional redacted history. Native session services now produce separate active-credential, repository-preference and vault effects through the closed session family in section6.10. The actual compound start/stop producer now preserves independent native phase observations. Explicit clear operations now preserve actual submission, acknowledgement and canonical readback independently. Helper samples now have a source-checked pre-open handoff and separate readonly view. Native/human acceptance remains incomplete. The mounted center now
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
compound start/stop producers now use the bounded projection in section6.11. Explicit clear operations use section6.12. Helper samples use section6.13; native/human evidence remains required delivery work.
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
unconfirmed delivery. The active drain owns the loop through the notification
that empties the queue. A visit observed synchronously in that notification
continues in the same drain. Never acquire new consent for an old queued visit
or retry an unknown submission. Fresh capture reads are independently single-flight with
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

This first family covers preference operations. Session active-credential, repository-preference and vault effects now use the separate closed projection in section6.10. Compound collection preference/policy phases now use section6.11; neither family may be guessed from a top-level result or flattened into preference saving. Explicit clears use section6.12. Helper samples use section6.13. Complete H3 still requires the full native/human journeys.

### 6.10 Native session observations

Connect, select, disconnect, remove and explicit forget-all MUST have a separate
closed session-operation family. Capture only after the native service admits
the validated intent, vault revision and selected entry. Preflight restoration
is not retrospectively attributed to that operation. Explicit forget-all remains
available with an unreadable vault; native permission-driven revocation creates
no attributed user operation. No renderer recording method is added.

```text
Native admission → captured current target and optional one history ticket
 → prior active retirement → candidate verification/save → repository preference
 → named-vault save
 → independent cleanup if required → observed service result
```

Text equivalent: each actual protected mutation keeps its own ordered result.
Forget-all independently removes the active key and named vault. Inactive-entry
removal need not retire the selected connection. A top-level ready, unavailable
or unknown response is not proof that every storage phase completed.

The repository's nonsecret read opt-in is another independently attempted and
verified phase. It is not a browser permission or a provider credential grant.
Its observed update uses the same preference queue and full canonical readback;
secondary observer availability never selects a weaker primary save path.

Each fact contains only the closed action, running/settled state, closed service
result and at most16 ordered effects. Each effect has its ordinal, one of prior
active retirement, active save, candidate cleanup, repository preference, vault save or vault removal,
submitted/settled state, accepted/unknown acknowledgement and
not-observed/committed/different/unavailable observation. No target, credential,
account/repository, native selector or raw exception enters this fact. An
additional effect beyond the bound sets an irreversible incomplete flag rather
than inventing completion or retaining an unbounded event stream.

Register an effect only after invoking its real native mutation port, including
synchronous failure. Inspect each attempted mutation once without retrying it.
Settled effect facts cannot be rewritten; later cleanup remains a separate
effect. The final service result is terminal and cannot erase prior effects.
Unknown delivery or retention remains independent from primary session success.

The initial native credential admission remains mandatory. After admitted
preflight, the observation source binds the current editor/controller and service
generation, plus a private credential witness. Only a synchronous callback from
this operation's own active-session mutation can advance that witness from its
exact previous epoch to the actual next epoch. Another epoch, controller,
document, service-generation change or failed query retires it irreversibly.
Queries do not renew another client's idle lease. No witness or advance method
is exposed through IPC. Secondary observer faults cannot change primary results.

Current session targets share the existing eight-client/five-minute memory
bound with preference operations; a newer family replaces the old private target.
Only the captured local session label/Connections destination is displayed in
the verified source context. Observations cannot reconstruct a target after
source retirement, expiry or restart. A generated-history clear leaves this
independent current memory intact. Settled service facts and individual
effects remain inspectable even when the private target is unavailable.

Generated retention remains at most200 diagnostic rows and64KiB per journal.
When an appended/updated safe fact grows the envelope, evict the oldest other
generated rows until it fits, retaining the explicitly updated row. Never trim
authored preferences or phase facts to manufacture a fit. Canonically evicted
known-row tickets are retired, so late updates cannot recreate the missing row.
Readers and exports disclose the retained count; row-count limits are maxima.
Capacity accounting includes the exact reviewed JSON export envelope. A canonical
read may apply this generated-data capacity policy to older valid records; unknown,
future or malformed records remain preserved. No phase fields are trimmed to fit.

A later session read MUST NOT match an unknown old effect solely by its current
payload. Without an operation receipt, a new observation cannot attribute who
wrote that state. Current connection state stays separate from terminal history.
The connection client may return only the directly observed vault revision to
its native form handler to clear the submitted draft. That receipt is separate
from a retired private summary, carries no identity or reusable authority, and
cannot re-publish a connection after invalidation. A lost response provides no
such receipt; no automatic resubmission or draft-clearing guess is allowed.

Full session delivery requires the actual native producer, current metadata,
four-locale effect list, optional same-row history progress and clear/retention
races. The active-key foundation alone does not satisfy this contract. Compound collection preference/policy operations use their own family below; explicit clears use section6.12; helper samples use section6.13; complete native/human evidence remains separate H3 work.


### 6.11 Compound collection observations

An admitted start/stop preview MUST own its own closed collection-operation
projection. Preference saving, prerequisite policy pause and final activation
remain separate observations. No renderer recording method or global mutable
observer registry is introduced. A per-call observer follows the retained native
plan; its failure cannot change primary admission, storage, cancellation or replay.

```text
Reviewed start → confirmation → prerequisite pause → preference save/readback
 → exact-snapshot verification → activation/readback → service result
Reviewed stop → confirmation → policy pause/readback → staged reuse
 → preference save/readback → exact-snapshot verification → service result
```

Text equivalent: starting first establishes a paused policy, saves the opt-in and
verifies the full preference snapshot before activation. Stopping first attempts
a durable pause; preference preflight reuses that already observed restriction.
That reuse MUST NOT appear as another native attempt. Each phase distinguishes
no observation, an actual submitted command and the canonical observation. An
already-paused inspection is different from submitting a pause. A top-level done
result does not establish that every storage effect completed or remained active.

The immutable fact contains only collection kind, start/stop, reviewed/running/
cancelled/blocked/settled state, a closed service reason, whether preference
publication was required, the preference acknowledgement/observation, separate
pause and activation observations, and explicitly historical verification,
admission/source booleans. Policy facts may retain nonsecret local revision and
exact-receipt attribution, never the receipt selector itself. Fixed three phase
slots and an irreversible incomplete flag bound retention. Pending effects at
service completion MUST remain visibly incomplete. Settled phase observations
cannot be rewritten by weaker later availability or another operation.

Actual submission is reported only after invoking the mutation port, including
synchronous failure. Secondary callbacks are contained and the native source is
rechecked before later effects. Canonical attribution requires this operation's
exact receipt and expected policy/settings revisions; a matching mode or selector
alone is insufficient. No read or observer retries a mutation. Cancellation before
confirmation reports no attempted effect; cancellation after confirmation remains
pending. Replay/retained-result inspection creates neither a new current entry
nor another history row. Expired/replaced pending previews become blocked without
inventing cancellation of effects that already started.

Current collection operations share the existing eight-client/five-minute bound.
Their closed local target is Privacy for collection controls. Existing source,
controller, credential, shutdown and replacement fences apply; reads do not renew
retention. One optional diagnostics ticket is admitted at preview time only.
Enabling diagnostics cannot backfill its own earlier off/unknown preview. A known
row may progress while collection is off until clear/eviction retires its ticket.
History or metadata failure cannot weaken the primary privacy operation.

The four locales MUST show a service result separately from preference, pause,
activation and retained history. Example: “The service returned a result.
Preference: verified. Durable pause: unavailable. Inspect current collection state
before continuing.” No read button may confirm, request permission or resubmit.
A current-policy read describes the present; immutable history describes its
original observation. Generated-history clear remains a separate retained native
operation: its own current projection MUST NOT recreate the rows just cleared.
Explicit clears use section6.12. Helper samples use section6.13; full H3 native/human gates remain.

| State | Representative content | Safe next action |
|---|---|---|
| Reviewed | “Collection change reviewed; no write attempt observed.” | Confirm or cancel the exact retained review |
| Running | “A preference write was attempted; its result is pending.” | Inspect metadata; confirmation joins the existing request |
| Partial | “Preference: verified. Durable pause: active; acknowledgement unknown.” | Read current collection state; no automatic repeat |
| Blocked/cancelled | “The unsubmitted review is no longer available.” | Create a new review if still wanted |
| Returned | “The collection service returned a result. Inspect its independent effects.” | Inspect current state separately |
| Metadata unavailable | “Earlier proved facts remain separate from current availability.” | Reread metadata; do not reconstruct the target |

These are text equivalents of the phase flow above. Historical verification,
admission and source booleans MUST NOT be shown as negative observations before
a service result exists. Current and retained history use correctly nested static
headings under the existing no-dynamic-markup constraint. Journal/review vocabulary
is a neutral domain dependency; effect-plan declarations are independent from
executors. Type and runtime imports MUST remain acyclic with no gate exceptions.

### 6.12 Clear-operation observations

A reviewed generated-history clear MUST own a closed current-operation projection,
independent from the journal being erased. Capture only after the native plan has
verified paused intent/policy, exact history generation/revision, source and idle
writer. Clear preparations, retained reviews and running confirmations share
16 slots. Each preparation reserves a slot before native reads. Invalidation
retires the preparation's authority while it keeps the slot until its reads
settle. Admission transfers that slot to the retained review. Invalid or
unavailable previews create no current entry or ticket. The existing
confirmation, permission and lease requirements remain mandatory.

```text
Verified preview → current intent (one optional diagnostics ticket for recents only)
 → register running promise → reserve preferences and paused collection
 → recheck exact plan → invoke clear once → observe submission
 → inspect canonical generation/emptiness once → retain historical result
```

Text equivalent: the running promise exists before reservation, observer or native
callbacks may reenter confirmation, cancellation or result inspection. Reentry
joins the same promise or reports pending. Preserve synchronous reservation order;
adding observation MUST NOT yield the preference queue to a later writer. No
observer retries a mutation, releases an owned lease or authorizes an operation.

The immutable fact contains fixed clear intent and collection kind, reviewed/
running/cancelled/blocked/settled state, a sticky actual-command-observed boolean,
closed service result, independent acknowledgement and desired-state observation,
a closed not-started/aborted reason when provided, nullable historical source fact
and an irreversible incomplete flag. No selector, private target, raw error,
credential, authored data or reusable generation/revision enters this projection.
A result summary cannot fabricate an unobserved submission; a missing detailed
observation is disclosed. Terminal history cannot be rewritten from a later
matching payload. Observed emptiness of the exact reviewed generation is a
condition at inspection, not attribution of another writer's action.

Clear diagnostics MUST NOT attempt diagnostics history admission, even if a
secondary consent cache is stale. Its current result remains temporary memory.
Clear recents MAY use the already-consented diagnostics journal, never recents.
It uses at most one ticket admitted at preview time, with no retrospective capture.
Canonical clear advances the journal generation and retires old tickets before
reservations release deferred work. A late result, metadata read, history refresh,
retry, replay or callback MUST NOT create a new row in a cleared generation.
Generated-history clear preserves the separate current-operation memory.

All four locales distinguish preview, actual command submission, returned service
result, acknowledged versus observed clearing, not applied and unknown/unavailable
inspection. Source indicators appear only when the native result sampled them;
absence is not rendered as a negative claim. Static semantic headings and existing
source/role/credential fences apply. Metadata inspection performs no store,
provider, permission or mutation operation.

| State | Representative content | Safe next action |
|---|---|---|
| Preview | “Clear reviewed; no native command observed.” | Confirm or cancel the exact review |
| Running | “A clear command was attempted; its result is pending.” | Inspect current metadata; duplicate confirmation joins |
| Observed cleared | “The reviewed history condition was observed cleared.” | Inspect current history separately |
| Unknown | “Acknowledged; clearing could not be verified.” | Read current history; no automatic resubmission |
| Not applied | “The native transaction did not start / was aborted.” | Resolve the cause and create a new review if wanted |
| Retired | “These are earlier observations; the originating context is unavailable.” | Inspect from the current native editor |

The application ports are per-call secondary capabilities, not recording IPC.
A neutral closed issue vocabulary avoids journal/model dependency cycles. The
owning clear service retains the plan, running promise and canonical readback;
presentation receives no native selector or mutation callback from this fact.
Helper samples use section6.13. Complete H3 still requires remaining CENTER
semantics and full native-browser/human evidence.

### 6.13 Pre-open helper sample and options handoff

The development source now implements this contract with deterministic native
application/gateway and mounted composition evidence. This is not loaded-browser
or human acceptance. The content
runtime currently owns a closed100-event health ring and independent quarantine.
Its native query refuses hidden/retired contexts. Asking after opening options
therefore cannot establish the original page's current health.

```text
User invokes a page control/shortcut to open the center
 → content samples its admitted visible source before sending the open intent
 → background validates native source and the exact configuration lease
 → capture immutable historical sample; optionally admit at most2 diagnostics
 → open native options tab; bind the sample to that native tab
 → center reads its own sample metadata; no query of the now-hidden source page
```

Text equivalent: source capture precedes opening. The options page inspects an
already-established historical observation; it does not certify live source
health or infer a successful open from a retained fault. Failure of sampling,
secondary retention, delivery or clock inspection cannot stop an otherwise valid
center-open operation. After secondary callbacks, the primary opening ticket MUST
still be current before invoking native creation; retirement/disposal is not an
observer failure and cannot authorize an opening from the old source. Malformed/expanded native messages remain rejected.

**Source and authority.** The existing page-origin `settings.open` MAY carry one
closed health intent. It contains a source-build digest, known generation,
credential epoch, settings revision and bounded `{blocked,events}` snapshot, or an
explicit unavailable state. The native parser MUST detach input before async
work. Only `runtime-health` and `center-shortcuts`, the three registered fault
codes and the two historical scopes are allowed. No arbitrary fact, target, URL,
selector, callback, raw error, setting or command is accepted. The original
native top-frame extension sender, eligible active nonprivate tab/window and
existing configuration lease MUST agree before a ready sample is admitted.
Generation, credential and configuration receipt mismatch never become a ready
sample. The handoff is observation only, with no permission/mutation authority.
The native page lease is reserved before its first asynchronous inspection. A
new observation immediately withdraws the previous helper receipt, and only the
latest attempt may publish a replacement receipt; an older successful response
cannot restore one after a newer failure. Native document identity participates
when provided. A legacy open without a sample still opens normally and reports no available
observation; it never substitutes an empty healthy result.

Capture occurs in the originating open call, using the same existing native
message transport on Chrome/Firefox/Safari. It does not require document-targeting
browser API options, another host permission, a foreground tab scan, provider
access or a background-to-arbitrary-page sender. Native navigation/activation
invalidation and the source-build fence remain in force. The packet is untrusted
data even when sent by the extension content context. Primary transport references:
[Chrome messaging trust boundary](https://developer.chrome.com/docs/extensions/develop/concepts/messaging),
[MDN native message semantics](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage).

**Temporary ownership.** A native application owner retains at most8 option-tab
samples for5minutes from capture, sharing neither private targets nor mutation
ownership with current operations. Native tab IDs are private map keys only;
renderer requests carry no target-tab operand. Any native tab removal retires
unbound receipts before a delayed created-tab result can attach an uncertain
identifier; other already-bound historical samples remain independent. Install only against the native
created-tab result. `center.health.read` is a closed metadata request from an
already admitted options client and can read only that client's native tab sample.
Editor and observer roles may inspect their own sample. Opening options in a
browser menu/new window without an originating sample gives unavailable evidence,
not “no faults”. Clock rollback/invalidity, expiry, replacement, native tab removal
and background disposal retire the sample without reconstructing it from history.
Reads do not renew its lifetime and perform no preferences/history/provider/grant
I/O. Native install can race the first options read: a dedicated center-only
invalidation schedules a fresh metadata read after client admission; an earlier
missing sample cannot establish that no handoff occurred. No polling is added.

**Historical semantics and optional retention.** The view preserves the complete
closed ring snapshot and separately sampled blocked set, with one native capture
time. Ring reasons have no original timestamps; capture MUST NOT invent them or
represent an earlier fault as a newly occurred fault. Every scope is explicitly
historical. An empty successfully captured snapshot differs from absent/failed
capture. Resets of live quarantine, source hiding, later matching events and
metadata refresh cannot rewrite the captured sample or retry a helper.

Only when diagnostics already has verified consent/admission and a known journal
generation at capture MAY the writer acquire one ticket per helper's latest reason,
never more than2. The entire ring is not replayed into persistent history. These
are observations of a user-requested sample, not retrospective activation of an
automatic fault collector. The accepted historical sample has its own bounded
observation lifetime after the source page hides; it is not a continuing live-page
lease. Clearing/expiry of the journal, withdrawn admission or unknown append
identity keep the existing writer fences. Install, metadata read, opt-in later,
notification replay and failed retention MUST NOT acquire another ticket. No
sample enters recents. Journal retention is shown separately from sample
availability, and its failure cannot erase capture or block opening.

**UI and four locales.** Diagnostics and Help expose a read-only source sample
independently of settings availability and optional history. Source meaning comes
first, then capture time, sampled blocked helpers, closed historical reasons and
separate retention. Human helper names/reasons and the capture-versus-live warning
are localized in en/es/fr/pt with atomic English fallback. No page/repository/account
identity or exact target is displayed. Retained helper rows also show localized
helper names, causes and historical scopes; one section notice distinguishes the
retained-observation time from an unknown original failure time or live health. Static headings, keyboard controls, live
pending status and explicit refresh apply; no retry, mutation or grant control is
introduced through a sample.

| Observation | Representative content | Next action |
|---|---|---|
| Reading | “Reading the source-page sample…” | Wait; duplicate read joins the current request |
| No sample | “No source-page observation is available in this window.” | Open the center from the page to capture an observation |
| Captured, empty | “No faults were present in this captured sample.” | Inspect normal configuration separately |
| Captured, reasons | “Earlier page observation; this is not live helper health.” | Inspect each closed reason and troubleshooting guidance |
| Retention failed | “The sample is available; optional history retention is unconfirmed.” | Inspect history separately; no automatic resend |
| Source unavailable | “The source could not certify a current sample.” | Return to an admitted visible page before a new explicit open |
| Expired/read failed | “Earlier sample unavailable; current helper state is unknown.” | Refresh metadata or make a new explicit source capture |

Domain owns closed snapshot validation, projection, wire decoding and immutable
view models. Application owns pre-open validation, one-time capture/admission,
native-tab/lifetime ownership and independent single-flight reads. Content and
background composition adapt the existing native open call and created tab;
center composition adapts admitted-client reads and invalidation. Presentation
receives no native source selector or mutation capability. All type/runtime imports,
static markup, package/CI/size and existing source-tree checks remain enforced.
The100-case risk budget below and native/human acceptance both remain mandatory.
The reader registers its in-flight promise before notification callbacks; duplicate
reads, including synchronous reentry, join it without recursive notifications.
One invalidation can request one fresh generation without retrying capture.

### 6.14 Native pause operation observations

User-confirmed emergency/tab restrictions and explicit adoption use one closed
`pause-operation` fact. Its nine fields are kind, closed action, lifecycle state,
actual native submission, primary result, native acknowledgement, canonical
observation, sampled source-current boolean/null and an incomplete-events flag.
The five actions are pause/resume emergency, pause/resume tab and adopt observed
pauses. Do not retain native tab IDs, URLs, labels, snapshots, revisions, operation
IDs, guard witnesses, credentials or raw errors. Current memory may identify the
local repositories control section; generated history cannot reconstruct an
exact native target. Existing eight-client/five-minute current-memory bounds and
200-row/seven-day/64-KiB diagnostics bounds remain unchanged.

```text
Native retained review → optional consented diagnostics ticket + current facts
 → confirmation → actual native set invocation → acknowledgement
 → one canonical observation → primary response + sampled source
Later metadata read → inspect facts only; no native retry or new history ticket
Explicit adoption → reviewed current native state → adopted; no set or native ack
Native tab expiry → scope cleanup only; never a synthetic user operation
```

Text equivalent: intent, native invocation, acknowledgement, canonical readback
and primary response are independent facts. A confirmed acknowledgement can be
shown while readback is still pending. A lost acknowledgement with observed
canonical effect stays unknown acknowledgement. A lost coordinator response
cannot erase an accepted acknowledgement or canonical record already observed;
it remains an unconfirmed primary response beside those separate facts. No later
ordinary pause/settings read may certify that response. Explicit adoption has
`submitted:false`, no native acknowledgement and an adopted-state observation;
it never changes the older unknown operation's row.

Observation acquisition follows retained preview installation and is secondary.
Source retirement during capture discards the unexposed preview and frees its
capacity. Register the running promise before confirmation callbacks; duplicate
confirmation from a callback joins it. Observe native submission at the existing
protected mutation boundary, not at review or queue reservation. Notification
failure cannot suppress the single canonical read or repeat a native write.
Missing phase events must be disclosed with `incomplete`, never inferred into an
observed submission. Completion callbacks may retire authority: the final reply
must recheck source after those callbacks without erasing the accepted effect.
The historical sampled-source value is distinct from current source availability.
The retained observer liveness closure captures only owner/epochs/time/generation
and a shared small retirement marker. It must not capture the full pending plan,
native path, snapshots, intent or private guard witness after completion.

Acquire at most one optional diagnostics ticket at preview capture under the
existing explicit consent/policy/source permit. Update only that ticket; no
fallback append, retrospective admission, automatic resend or new consent.
Retention failure remains separate from primary effects and current inspection.
A newer current operation cannot be overwritten by an older pause callback.
Shutdown/expiry cannot reacquire tickets or renew first-observation time.
Trusted tab closure is system lifecycle, not a user review, so its cleanup has
no pause observer or generated operation row. Future/corrupt native preferences
cannot hide independent current pause facts or authorize a destructive reset.

The existing schema-1 journal envelope now recognizes this closed fact variant.
Unknown fact kinds remain preserved inert: an older/downgraded reader that cannot
validate a variant reports unavailable/corrupt history and does not silently
rewrite or discard it. No preference migration, new database store, credential
fallback, permission request or history default-on is introduced. Export includes
only the validated nine-field projection. Unknown fields are rejected rather than
copied. This additive variant does not permit arbitrary renderer-authored facts.

Current-operation and retained-history components show localized action, neutral
lifecycle, primary result, actual native submission, acknowledgement, canonical
observation and a source sample only when one exists. Representative unknown copy:
“Operation response unconfirmed” next to “Desired native pause record observed”
and its independent acknowledgement. Adoption explicitly says it writes no
native record and certifies no earlier operation. Retained facts expose no
confirm/resume buttons. Ship all content in en/es/fr/pt with proper heading
hierarchy, readonly fact lists, escaped labels and existing keyboard/focus rules.
The native authoring/recovery increment is specified in section 6.15; full
runtime provenance and native/human H3 acceptance remain separate requirements.

Minimum **64 distinct** component risk cases: 16 closed fact/redaction/transition,
20 native event ordering/loss/reentry, 12 current/source/optional-retention, 10
actual composed gateway/lifecycle, 6 mounted disclosure/readonly-content cases.
Locale repetitions do not increase the semantic risk count. Require 100% local
new executable lines/branches/functions/statements and the final exact-head
remote Codecov no-missing/no-partial changed-line gate. Evidence families are
`pause_fact`, `pause_observations`, `current_pause_operations`,
`pause_operation_gateway`, `pause_review_observation_races`,
`pause_effects_presentation`, `protected_mutation` and the actual background
expiry regression. These deterministic native-port/composition/DOM cases do not
replace loaded Chrome/Firefox/Safari or human acceptance.

### 6.15 Native pause authoring and recovery

The packaged local center MUST expose `#/repositories/pauses`, reachable from
repository preferences, profiles and privacy. Emergency and native-tab scopes
are distinct from saved global/profile/repository preferences. Confirming a
native pause MUST NOT edit saved preferences, export/import or rollback, read a
credential, prompt for a grant, call GitHub or approve an Action. An observer can
read the independent native state but cannot preview, confirm, cancel or inspect
another window's operation. Explicit control takeover retains its existing
native identity/epoch admission; a suspended ordinary preference read MUST NOT
block takeover or independently authorized native safety work. New editor role
is visible before its saved-preference read completes. A pending native takeover
exposes a distinct busy state and MUST NOT issue duplicate claims. Future/corrupt/unavailable
preferences do not imply unavailable native pause controls. An incompatible
package source or unknown native identity still fails closed.

```text
Repositories / Temporary pauses → independent native record + eligible tabs
 → Pause / Resume one scope → complete before / after → Confirm / Cancel
 → native response, acknowledgement, canonical observation, source sample
Unknown delivery → Inspect that retained operation; no automatic confirmation
Uncertain native effect → Read current native state → Review adoption → Confirm
 → same emergency/tab scopes preserved; only worker precaution ends
```

Text equivalent: viewing/filtering/reading never writes. Preview reserves an
exact native review; only its explicit confirmation requests its native effect.
Cancellation retires the review without an inverse write. Unknown response or
unknown effect MUST remain unknown after ordinary metadata reads. Inspect uses
only the retained opaque ID and original revision; stronger exact completion
can replace missing delivery, while weaker/expired/unavailable inspection
cannot erase already observed uncertainty. Adoption writes no native record,
acknowledges no older operation and preserves all observed native/saved scopes.

Representative review content is “Resume tab 7 — Before: emergency paused,
tabs 7 and 9 paused. After: emergency paused, tab 9 paused.” Show extra precaution
as an explicit boolean on both sides, never merge it with emergency. For unknown
effects show “The response is unconfirmed. Do not repeat the change. Inspect its
retained result or read current pauses and explicitly review adoption.” The
technical details disclose browser-session lifetime of native state, worker
lifetime of extra precaution, and the longer lifetime of saved pauses. No
resumption may claim to release a saved inherited pause or another native scope.

The native record and tab inventory have separate availability. Future,
corrupt or unavailable native state MUST remain preserved, explicitly unknown
and unavailable for effects; no empty/unpaused default or repair. Pending native
work disables new reviews. Extra precaution disables every resumption; it does
not prevent a restrictive pause or explicit adoption. At confirmation, resumption
rechecks precaution after target verification and inside the queued store before
actual invocation. A newly acquired hold before invocation prevents the write;
a hold acquired after invocation cannot erase its factual effect. Canonical
revision observations reject rollback within one native client context; explicit
context replacement permits a legitimate new browser-session document.

`PauseClient`, `PauseReader` and `PauseReviewClient` own the view and private
selectors. The renderer receives immutable closed copies, complete public plans
and callbacks, never native client IDs, controller/credential epochs, operation
IDs, witnesses, native paths or reusable authority. Decode every reply with
strict bounded fields, complete canonical snapshots and an exact intended scope,
revision and action match. These pure validators cannot authorize a native
effect. `CenterClient` supplies native headers privately and fences post-await
identity/role/epochs. Existing native gateway admission remains authoritative.
Recheck retirement and eligibility after synchronous renderer notifications and
immediately before dispatch: a notification that retires a view cannot send its
obsolete work. After native invocation, retain observed scalar effect facts even
if editing authority or target identity has since been retired.

Fixed, nonconfigurable bounds are one native metadata request plus one coalesced
trailing request, at most sixteen outstanding review/effect calls and one joined
exact-result inspection, eight subscribers, native review deadline five minutes,
128 eligible native candidates and 128 saved native-tab restrictions. The merged
list is at most 256 rows and preserves missing restrictions with generic tab IDs
and explicit unavailable labels. It MUST NOT render private URLs or titles. The
local search trims and limits its query to 120 characters; it filters IDs and
safe labels without storage, IO, a preference draft or a new history fact. Empty
inventory and no matching filter have different messages. These bounds add no
settings schema, provider configuration or user safety override.

Native closure/navigation/reload signals carry only version, closed method,
opaque tab ID and retirement boolean. Source-checked completion refreshes metadata
without retiring a still-current target. Closure/navigation/reload retires only
the selected pending target; after invocation purge its public label/plan but
keep private selectors only for inspecting that exact retained result. Never
include URLs/titles/grants in these notifications; reject foreign-extension and
content-tab senders in the local center. Blur/hidden views drop current metadata
and cannot confirm until a fresh eligible read; source identity/role/epoch change
purges private plans and labels. Shutdown drops selectors and ignores late replies.

Settings, connection and history mutations/reviews, unsaved drafts and native
reviews exclude conflicting authoring. Ordinary saved-preference reading does
not. Navigation and beforeunload protect pending/in-flight reviews. Staying keeps
the review; leaving an unsubmitted review cancels its exact ID; leaving a settled
or unknown result explicitly keeps native effects. In-flight work cannot be
discarded. No automatic inverse, confirmation replay, renewal or resumption.
The packaged lazy boundary exposes loading/unavailable locally and ignores late
chunks after unmount; no remote code fallback. Ship all UI/copy in en/es/fr/pt,
semantic headings, named controls, keyboard access, live status, filter focus
preservation and focus on the new review/result heading. Color is supplemental.

Minimum **160 distinct semantic cases**: 32 strict reply/schema/bounds, 40
review/inspection/effect/retirement races, 32 native policy/transport/lifecycle,
24 mounted authoring/recovery/accessibility, 24 actual composed native-route
journeys and 8 local loader/filter/copy cases. Locale clones do not increase the
semantic count. Require all prior regression cases, no skips and 100% local
new executable lines/branches/functions/statements, plus final exact-head remote
Codecov no-missing/no-partial changed lines against the correct base. Evidence
families are `pause_reply`, `pause_ui`, `pause_transport`, `pause_reader`,
`pause_review_client`, `pause_review_faults`, `pause_review_reentrancy`,
`pause_resume_precaution`, `pause_target_notifications`, `pause_page`, `pause_route`,
`pause_center`, `pause_center_lifecycle` and `pause_client_retirement`. Documentation MUST explain entrypoints,
lifetimes, unknown recovery, retained facts, permissions and architecture.
These deterministic native-port/background/DOM tests do not replace loaded
Chrome/Firefox/Safari, full runtime provenance or the H3 human acceptance tasks.

### 6.16 Complete effective-state and runtime restriction provenance

H3 MUST explain the effective density, shortcut setting, every registered feature
preference and every applicable active pause, including inherited and shadowed
restrictions. A winning layer alone is insufficient: emergency and this tab's
pause can coexist, as can pending native work and earlier worker precaution.
Never describe unavailable data, an unverified scope or a worker restriction as
a user-selected emergency pause. This is an explanation contract, not permission
to connect, restore a credential, request a grant or bypass a pause.

```text
Saved preferences + verified applicability → pure effective values + all pauses
Protected native observation → worker condition + current native availability
 → closed scalar provenance → source/route/epoch checked configuration
 → required local explanation + settings entrypoint, including while paused
Connected enhancements / provider reads → existing pause/identity/access gates
```

Text equivalent: native and saved sources remain independent. A valid explanation
does not authorize any connected effect. The local control shell remains visible
when enhancements are paused, but offers no usable connected-read action until
the independently checked configuration permits it. An unknown configuration
shows unavailable state with local recovery, never usable default preferences.

Worker observation is a closed condition: `clear`, `pending`, `precaution`,
`pending-precaution` or `unavailable`. It contains no hold counts, native tokens,
witnesses or raw failures. Sample before protected access, after that access
before native IO and after IO. A positive/unknown condition prevents the next
read and removes any usable older native snapshot. Return it separately from
native availability. Native state withheld by a worker restriction is
`not-checked`, never an empty/false native pause record. The internal admission
reader still returns fail-closed unavailable data to existing GET gates. The
actual background supplies the precise guard condition; an older positive
boolean callback is conservatively unknown, never a guessed kind of pause.

For an available canonical native document, disclose emergency and this tab's
pause independently, with emergency as the higher-priority restriction. Never
disclose other tab IDs, snapshots, native revision or operation selectors to the
GitHub page. An unavailable native tab identity makes its tab restriction
unknown; independently known emergency state must not be discarded or turned
into permission. Future, corrupt and unavailable native records remain distinct
from worker state and are never repaired by observation.

The pure preference resolver MUST preserve all positive applicable pause sources.
An explicit false in a more specific scope cannot erase an inherited true. The
existing precedence remains default, global preference/profile, host, verified
account, verified organization, verified repository and verified current session;
then native tab/emergency restrictions apply independently. Missing identity or
epoch makes a corresponding layer unavailable, not applicable by inference from
DOM names. A saved restriction for a claimed repository may veto restoration but
must be labeled as unverified scope. A retained scoped restriction may veto
restoration without being presented as freshly verified identity or permission.
Neither case may masquerade as native emergency. Full verified-session overrides
must integrate later with this same source model and their own epoch contract.

Public configuration provenance MUST be a closed bounded projection: generic
source/scope codes, booleans or explicit unknown values, existing registered
feature IDs and bounded applicability facts. No profile names/IDs, account or
organization IDs, saved collections, native IDs, raw errors, credentials, grant
objects or reusable authority may enter the content view. The native center can
resolve user-authored labels locally under its existing ownership contract; the
web page uses generic scope labels. Validate exact fields, enum values, source
consistency, value agreement, pause monotonicity and all feature keys before
rendering. Preserve the existing source-build/route/generation/credential fence
and response-size limit. Mixed or incompatible configuration is unavailable.

The configuration service MUST carry real native prerequisite observations
through each early return, final identity/settings revalidation and invalidation.
Missing native admission infrastructure fails closed; it is not an unpaused
compatibility default. Never collapse a saved/retained/unknown restriction into a
native emergency boolean. The local explanation and current effective values
must correspond to the same accepted configuration. New settings, route/viewer,
native scope, credential epoch or package invalidation removes old explanation
and stale labels before repaint. No extra provider call, native mutation or
credential read may be introduced merely to explain a restriction.

Representative content: “Connected reads are restricted — Emergency pause: on;
this tab: on; personal profile pause: on.” When blocked before native inspection:
“A native change is pending and an earlier extra precaution remains. Current
native pause state was not inspected.” For unknown scope: “No verified account
context; account and organization preferences cannot be confirmed.” A “Why this
setting?” detail shows effective value and generic winning layer; “Manage pauses”
uses the trusted local settings entrypoint, never an untrusted web return URL or
an implicit resume. Native GitHub remains usable throughout.

Required local control UI is a distinct fixed lifecycle purpose, not a
user-configurable pause exemption for productivity features. It can display
closed metadata and open local recovery while paused; every connected action
still passes native GET admission. Feature-specific disable/quarantine, disposal,
hidden/protected-route teardown and resource ownership remain effective. Do not
set a true pause to false merely to mount the shell. Ship en/es/fr/pt, semantic
details/lists, named controls, keyboard access and readable non-color status.

The connection is an independent closed fact: disconnected, connected,
unavailable, revalidating, limited, cooldown or budget. Only the last three may
carry a nullable natural deadline within the JavaScript date range; unknown or
elapsed deadlines show waiting, never a fabricated retry time. Network state is
independent. A verified session for another page is unavailable for that page,
not disconnected. The connected-read button MUST remain disabled during pending,
restricted, offline, disconnected, wrong-scope or waiting configuration.

**Recheck local state** sends one `page.configuration` with `inspectOnly: true`.
This closed optional attenuation is accepted only for that method and only with
literal true. It cannot restore credentials, invoke a provider, read activity,
clear precaution, retry a native mutation or request a grant. Normal admitted
page entry retains its existing restoration rules. While pending, no previous
preference values remain usable and repeated clicks do not enqueue more work.
The 150 preference rows populate once, on first expansion, with no IO. They
describe preferences rather than claiming implementation or eligibility.
Same-page refresh preserves owned keyboard focus and expanded detail state,
including through a pending shell. If the user moves into a native editor while
waiting, delivery MUST NOT steal focus. Route/account/hidden retirement discards
the old view state and listeners. Only exact extension-owned node references
are eligible for focus restoration; page-authored lookalikes are never targets.

Minimum **160 distinct semantic cases**: 24 worker/native observation ordering,
32 all-source monotonic resolution, 32 strict/redacted public configuration,
20 connection/inspection boundaries, 32 actual composition/admission/invalidation races and 20 mounted paused/unknown
control-shell/copy/accessibility cases. Locale clones do not count as additional
semantic risks. Retain all prior regressions, require no test skips and 100%
local new executable lines/branches/functions/statements. The final exact-head
remote Codecov gate still requires every modified executable line covered without
partials against the correct base. Update configuration, runtime, permissions,
architecture and recovery documentation together. Deterministic proof does not
replace source-bound Chrome/Firefox/Safari or human H3 acceptance.

Current increment status: worker/native observations, all-source preference
resolution, closed public configuration, metadata-only inspection and the paused
local shell are integrated in source. Deterministic composition and mounted
regressions cover these contracts. Complete unfiltered coverage, native-browser
and human acceptance remain distinct gates; this is not full H3 acceptance.

### 6.17 Private API cache clear observations

The [owning H3 cache-clearing refinement](github-browser-extension-control-center-h3.md#reviewed-private-api-cache-clearing-2026-10-31)
defines the fixed scope, native admission, retained result and additional numeric
test budget. Cache clearing has a separate `family: cache` current-operation
variant whose closed fact contains only `kind: cache-operation`,
`action: clear-api-cache` and its state. Its exact target is null or the current
Privacy route with a null label. No cache selector, body, identity, count, ETag,
operation ID or reusable witness enters current metadata or diagnostic history.

Native preview captures the current-operation fact independently of optional
history. Its live callback latches source retirement, but a successful clear's
own cache-generation replacement does not retire its completion observation.
Old completions may update only their original optional ticket and cannot replace
a newer primary operation. Reviewed, cancelled, blocked, submitted, cleared,
not-applied and unknown remain distinct. Existing consent may admit one redacted
diagnostic ticket; unavailable/off collection never blocks clearing. A coalesced
terminal update persists submission first. An unknown native boundary remains
unknown; later empty/newly populated cache state cannot reconcile that history.

Privacy provides explicit result inspection. It never repeats clearing. A new
review cannot borrow a previous operation's result, including when its own
acknowledgement is lost. The unpublished H3 closed reader preserves unsupported
facts rather than silently repairing them. Full source-bound browser and human
acceptance remains required alongside the owning refinement's local risk cases.

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

The unpublished H3 version1 journal admits closed session, compound collection, private API-cache clear and explicit history-clear
facts alongside existing operation/helper facts. Existing supported rows keep
their meaning. An older draft reader that does not recognize a fact MUST preserve
the record as unavailable rather than downgrade or delete it. The existing exact
source-tree client/background fence rejects mixed installed builds independently
from fact decoding. No native database upgrade or H2 rollback claim follows from
this addition.

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
| Bounded destination client | 19 | Captured scope, no backfill, single flight/latest pending, empty-queue reentry, uncertain delivery, context/epoch rollover and late replies |
| Actual navigation composition | 12 | Initial admitted view, accepted/canceled/stay/leave, observer, profile generalization/feature IDs, off/unknown consent, separate privacy queries and uncertainty UI |
| Preference observation projection | 16 | Validated action/target, preflight versus submission, acknowledgement/readback, replay and unknown provenance |
| Current-operation ownership | 24 | Eight lifetime/clock cases, six retention-isolation cases, four source boundaries and six replacement/reentry/disposal races |
| Actual preference producers | 20 | Six admission/no-op cases, six outcome paths and eight duplicate/reentry/source/clear cases |
| Mounted current-operation view | 12 | Four complete locales plus eight metadata failure, target retirement, independent state and lifecycle cases |
| Session projection and causal source | 30 | Sixteen closed/order/immutability cases and fourteen native controller/credential/generation races |
| Actual session service effects | 32 | Admission, two protected stores, acknowledged/unknown readback, cleanup, duplicate/busy and source loss |
| Session retention and generated byte eviction | 20 | Twelve ticket/clear/off/unknown cases, six byte-bound cases and two canonical ticket-retirement cases |
| Mounted session-operation view | 16 | Four complete locales and twelve pending/partial/retired/independent metadata journeys |
| Typed client/response closure | 120 | Closed detached replies, source binding, wrong-family/scope, immutable independent facts |
| Reader/review/export ownership | 35 | Read-after-clear/revision races, retained result inspection, known-fact preservation, explicit exact-byte download, retirement/single flight |
| Mounted UI/locales/export/recovery | 40 | Independent phase facts, editor/observer, guarded navigation,4locales, accessible JSON, separate privacy inspectors |
| Real targets and human | 9 | Three native journeys per target plus owning human gate |
| Compound projection and progression | 32 | Closed phases, no invented attempt, immutable exact facts, bounded/monotonic terminal states |
| Actual compound effect ownership | 36 | Native preference/policy callbacks, staged reuse, exact receipt, partial outcomes, secondary faults and source/replay races |
| Compound current/history integration | 28 | Shared lifetime/replacement, no backfill, off/clear/unknown retention, readonly metadata and sender isolation |
| Mounted compound operation view | 16 | Four complete locales plus twelve pending/partial/recovery/retirement/independent-read journeys |
| Clear projection and progression | 32 | Closed primitive facts, sticky submission, immutable terminal semantics and missing-observation disclosure |
| Actual clear lifecycle and effect owner | 32 | Synchronous reservation order, reentrant confirmation/inspection/cancel, canonical readback, primary/secondary failure isolation and source races |
| Clear current/history boundaries | 18 | No diagnostics self-record, optional recents-clear diagnostics, exact ticket/epoch retirement, shared preparation capacity, invalidation during a read and readonly metadata |
| Mounted clear-operation view | 16 | Four complete locales plus twelve pending/partial/unknown/recovery/source/privacy/native-cancel journeys |
| Helper snapshot and closed projection | 20 | Whitelist, bounded ring, unavailable-versus-empty, immutable detachment and private-field rejection |
| Pre-open native source admission | 24 | Actual content call before hiding, sender/source-tree/generation/epoch/revision fences, reentry, invalidation and primary-opening isolation |
| Bounded handoff and optional retention | 24 | Native options binding,8/5minute/clock/replacement/removal limits, at-most2 tickets, no backfill/retry, clear/unknown identity and notification races |
| Helper metadata reader and mounted UI | 16 | Single flight/source retirement, unavailable settings, four complete locales, static headings, focus/disposal and independent reads |
| Actual helper composition journeys | 16 | Content panel/shortcut, native gateway/open/created-tab, listener-first late install, missing snapshot, secondary fault and lifecycle integration |
| **Total** | **1032** | No substitution for semantic H3/catalog coverage |

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
Session evidence adds `session_fact.test.ts`, `session_operation_view.test.ts`,
`session_observation_source.test.ts`, `session_observations.test.ts`,
`current_session_operations.test.ts`, `session_operation_service.test.ts`,
`session_repository_observation.test.ts`, `session_observation_context.test.ts`,
`session_journal_progress.test.ts`, `session_journal_capacity.test.ts`,
`session_operation_gateway.test.ts`, `session_effects_presentation.test.ts` and
`session_operation_center.test.ts`. These cover actual service/gateway ownership,
independent state, generated byte bounds and the mounted form's own-notification
race. Contract and DOM cases remain distinct from required native/human evidence.
Compound evidence adds `collection_fact.test.ts`, `collection_operation_view.test.ts`,
`collection_journal_progress.test.ts`, `collection_observations.test.ts`,
`collection_policy_observation.test.ts`, `collection_policy_trace.test.ts`,
`collection_observation_service.test.ts`, `current_collection_operations.test.ts`,
`collection_operation_gateway.test.ts` and `collection_operation_center.test.ts`.
The exact-revision attribution cases fail against the prior native service and
pass after the fix. Existing architecture and actual clear journeys remain gates;
updated history expectations explicitly include the admitted stop row before clear.

Clear evidence adds `clear_fact.test.ts`, `clear_observations.test.ts`,
`journal_review_observation.test.ts`, `clear_observation_service.test.ts`,
`current_clear_operations.test.ts`, `clear_operation_gateway.test.ts` and
`clear_operation_center.test.ts` and `clear_effects_presentation.test.ts`. Two reservation-reentry cases fail before the
running-promise fix and pass after it; a third verifies synchronous preference
reservation. The fixtures execute actual application/gateway/rendered ownership
without claiming loaded-browser or human evidence.

Helper evidence adds `helper_sample.test.ts`, `helper_sample_view.test.ts`,
`helper_samples.test.ts`, `helper_open_gateway.test.ts`,
`helper_sample_reader.test.ts`, `helper_observation_context.test.ts`, `helper_sample_center.test.ts`,
`helper_composition.test.ts`, `helper_background_history.test.ts` and
`helper_sample_presentation.test.ts`. Four native
source-receipt regressions fail before synchronous withdrawal/latest-attempt
publication. A separate reader case fails before the initial notification reentry
guard. Two additional cases fail before primary-opening ticket revalidation after
secondary reentry. Actual content/background composition covers source hiding, real helper
failure, native creation/removal/disposal and secondary failure isolation; trusted
key delivery remains a deterministic fixture, not native/browser acceptance.

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
23. An admitted session operation records only real storage attempts, each with
    its own acknowledgement and canonical observation. Repository preference,
    active key, named vault and later cleanup cannot stand in for each other.
24. This operation's own native epoch advance preserves its captured current
    source; another controller, credential or service generation retires it.
    Later matching data without a receipt cannot rewrite an unknown old effect.
25. A growing generated row keeps its complete facts while oldest other rows
    leave to fit the exact64KiB export bound. A canonically evicted/cleared row
    cannot be recreated by an old ticket; unknown/future data are preserved.
26. The actual connection form clears its submitted draft after a directly
    observed successful response even if its own notifications retire the private
    summary. A missing response grants no revision receipt or automatic retry.
27. A compound start/stop preserves prerequisite pause, preference and activation
    independently; staged reuse creates no duplicate attempt or history row.
28. A lost/accepted acknowledgement cannot establish canonical policy state or
    attribute a matching selector whose expected policy/settings revisions differ.
29. Confirmation, cancellation, replay, source loss and inspection preserve one
    native primary promise and one optional preview-time ticket; no diagnostics
    activation backfills its own earlier off/unknown intent.
30. Missing detailed phases are disclosed as incomplete, never rebuilt from a
    service summary. Four-locale current/history views show historical verification
    and admission only after an actual result, separately from live metadata.

31. Reentrant clear confirm joins the registered primary promise before reservation
    callbacks execute; inspect/cancel report pending and later preference writes
    cannot preempt the synchronous reservation.
32. Clear distinguishes actual attempt, acknowledgement and canonical readback.
    Lost acknowledgement remains unknown even when the exact next generation is
    empty; missing callbacks disclose incompleteness rather than invented effects.
33. Diagnostics clear never admits its own diagnostic. Recents clear can update
    one already-consented diagnostic ticket; cleared generations retire old tickets
    before deferred work resumes. No callback or opt-in later can recreate a row.
34. Four-locale current/history clear views use static nested headings and show a
    retrospective source indicator only when the primary service sampled it.

35. An explicit page open captures helper data before hiding, under its exact
    native configuration source. A pending/failed new observation withdraws the
    prior helper receipt; an older success cannot restore it.
36. Historical samples distinguish no evidence, unavailable source and a captured
    ring with no reasons. Native options binding,8/5minute bounds and own-client
    reads exclude selectors, private targets, provider/grant work and backfill.
37. Only one latest reason per fixed helper can acquire a consenting diagnostic
    ticket at capture. No metadata read, later opt-in, notification or native
    install repeats admission, capture or opening.
38. Four-locale Diagnostics/Help inspection remains available without usable
    preferences. Read duplication/reentry joins the one registered native read;
    invalidation, source loss and disposal cannot republish a retired sample.

## 17. Requirements traceability

Effective-state acceptance for section6.16:

1. Simultaneous saved, native emergency and this-tab pauses retain independent
   positive facts; pending/precaution withholds native values as unknown.
2. Cold paused or metadata-only inspection never reads a credential or calls a
   provider. Unknown/future native state remains preserved and restricts GETs.
3. An account/route/settings-content/credential change retires old values. Strict
   detached decoding rejects missing, extra, contradictory or private provenance.
4. All150 feature winners are available on demand in four locales, with generic
   sources and a clear distinction between preference and implementation.
5. Same-page recheck preserves expanded details and owned focus through pending;
   typing in native GitHub, source retirement and detached lookalikes cannot be
   interrupted or used as restoration targets. Retired faults stay historical.

| Concern | Owner | Evidence | Documentation |
|---|---|---|---|
| Consent/off | Policy/native | Schema/migration/restart | Privacy/configuration |
| Atomic late-work fence | Transaction/recorder | Policy/source/epoch races | Contributor/recovery |
| Truthful ordered phases | Application | Partial/ack/replay/queue | Activity/privacy |
| Restriction-only save and owner lifetime | Settings/coordinator | Five application contract suites; native/UI evidence still required | Configuration/contributor |
| Reviewed phase continuation and priority of a later stop | CollectionReviews/effects/private leases | Eight retained-plan/phase/ownership/staging suites; full native/UI evidence pending | Configuration/privacy/contributor |
| Bounded secondary retention and unknown identity | JournalWriter/queue/IO/progress | Writer/domain/race suites plus session/compound gateway and capacity journeys; full native/human evidence pending | Privacy/recovery/contributor |
| One production owner and closed native control | CollectionHistory/HistoryControls/HistoryGateway/native composition | Protocol/application/gateway/bootstrap and mounted UI suites; native/human acceptance pending | Contributor/privacy/recovery |
| Accepted destinations and consent/source retirement | RecentsCapture/RecentsClient/VisitDelivery/centerDestination/center_app | Native source, delivery, gateway and 12 mounted navigation/localization cases; real-browser/human gates outstanding | Local history/privacy/contributor |
| Actual preference observations and independent current view | SettingsOperations/SettingsRepository/CurrentOperations/CurrentOperationReader/CenterClient/center_app | Eight projection/native/reader/client/mounted suites plus direct store observer isolation; native/human gates outstanding | Local history/configuration/privacy/contributor |
| Independent session effects and causal source | NamedSessions/ProtectedSessionService/SettingsRepository/SessionObservations/SessionObservationSource | Session contract/source/service/current/gateway/repository/mounted suites; native/human gates outstanding | Local history/configuration/privacy/contributor |
| Generated byte capacity and irreversible row retirement | local_journal/JournalWriter | Session capacity/progress/gateway suites, exact reviewed export envelope | Local history/privacy/contributor |
| Compound effects, exact attribution and staged reuse | CollectionReviews/effects/CollectionObservations/coordinator/native policy attempt | Compound domain/port/service/current/gateway/mounted suites plus two failing-before native regressions; full native/human gate outstanding | Local history/configuration/privacy/contributor |
| Clear facts, reentry order and no self-record | JournalReviews/ClearObservations/CurrentOperations/ObservedJournalStore | Clear domain/service/current/gateway/mounted suites plus failing-before reservation reentry; full native/human gate outstanding | Local history/configuration/privacy/contributor |
| Source-checked helper capture and historical options handoff | RuntimeHealth/content open/MessageGateway/HelperSamples/HelperSampleReader/center composition | Helper domain/owner/native source/reader/mounted/actual composition suites and failing-before source/reentry regressions; full native/human gate outstanding | Local history/runtime/privacy/contributor |
| Complete effective-state provenance and paused local controls (section6.16) | TemporaryPauseReader/profile_resolution/runtime configuration/PageConfigurationService/FeatureRuntime/owned DOM | Observation, profile sources, preference provenance, strict validation, inspection, availability, view, controls, actual content/focus/queue and retired-fault suites; native/human H3 gates remain separate | Configuration/runtime/permissions/contributor |
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
