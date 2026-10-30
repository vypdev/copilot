# Verified session preferences

- Status: Ready for implementation; acceptance outstanding
- Date: 2026-10-30
- Catalog capability ID: github-browser-extension
- Owners: browser extension maintainers
- Scope: the complete transient-session preference journey required by H3
- Related issue: [#704](https://github.com/vypdev/copilot/issues/704)
- Required review: UX, architecture, testing, documentation, security/operations
- Open decisions blocking implementation: none

## 1. Executive summary

Users can review temporary density, shortcut, feature and pause preferences for
the currently verified selected read session. Saved personal profiles stay
independent. A temporary preference can never erase an inherited pause or grant
access. Confirmed preferences survive ordinary background suspension, using the
existing protected browser-session storage boundary. Review authority does not
survive background recreation.

```text
Profiles / Repositories → Current session preferences → inspect verified scope
 → draft → review exact effective change → confirm → native readback
 → current local state + updated GitHub explanation
```

Text equivalent: inspect the current verified session, author a local draft,
review its actual effect, confirm once, then inspect the independently observed
protected result. A changed source requires another explicit review.

## 2. Current behavior and evidence

At the local baseline `716cb96f`, `SessionProfile` and `resolveProfile` define pure
account/repository/epoch matching, while `pageProfileContext` supplies no session
epoch and the native center has no session-preference authoring journey. Public
runtime provenance already reserves a generic session source. The implementation
under #704 adds the reviewed native route and actual runtime admission; acceptance
requires the complete tests, documentation, packages and native/human evidence
below. A local implementation does not establish released-product readiness.

`NamedSessions` owns a protected, versioned selected-entry vault. Its revision
advances on selection-changing operations; materialized entry IDs are native
opaque IDs. `ProtectedSessionService.matches` compares the active credential and
numeric identities. Neither its worker-local epoch nor a page observation alone
is a stable cross-worker ownership key. Historical motivation is not required:
this is a prospective refinement of H3 section7.1, not an as-built baseline.

## 3. Actors, surfaces and terms

- An editor authors and confirms; other native center windows inspect only.
- **Session selection binding:** fixed github.com host, materialized native entry
  ID, vault revision, numeric account and repository. Never a caller-supplied
  target or a DOM-derived account/repository name.
- **Worker credential epoch:** the current active verification generation. Every
  review and application projection additionally checks this current epoch.
- **Retained match:** native selected credential and retained active credential
  agree. This can veto restoration; it cannot enable a preference or a GET.
- Route: `#/repositories/session`; Profiles and Repositories expose descriptive
  local links. Existing authored profile identifiers remain valid.

## 4. Goals and fixed invariants

1. Implement H3 session precedence, source explanation and reviewed reset.
2. Preserve temporary preferences across ordinary background suspension without
   putting them in persistent profiles, exports, sync or rollback.
3. Reject account/repository/selection changes, stale reviewers and uncertain
   native writes. Reading an unavailable source cannot release a restriction.
4. A narrower false pause never clears another layer's true pause.
5. Inspection and drafting perform no provider call, reconnect or grant request.

Write-role management and Action execution remain separate owning capabilities;
this preference journey supplies neither credential material nor write authority.

## 5. Product journey

| Stage | Visible meaning | Next action |
|---|---|---|
| No verified session | No temporary context can be applied | Inspect Connections or keep saved preferences |
| Ready | Current selected scope and inherited effective values | Edit temporary preferences |
| Draft | Local unsaved choices for that exact scope | Review or cancel |
| Review | Before/after values, inherited pauses and lifetime | Confirm once or return to draft |
| Pending | Native submission is in progress | Wait; duplicate submission is disabled |
| Observed | Current native document agrees with the desired result | Inspect current effective state |
| Unknown | The attempt cannot be confirmed | Keep draft; inspect before a new review |

The native current-state read and a previous operation's acknowledgement remain
separate facts. A later successful read never retrospectively certifies an older
unknown confirmation.

The review's intended end state has no extra preference precaution. This is not
an observation that the actual guard has cleared: pending or unknown native
effects may keep it restricted. Render the intended before/after state separately
from current native metadata and primary operation facts.

The editor exposes all150 feature choices with a bounded local text filter and
explicit inheritance. Filtering never saves, requests or removes hidden choices.
A source change preserves the authored draft and disables its review until the
user chooses **Use current source for this draft**. Explicit local discard loads
known observed values even when the connection is no longer verified. A proven
replacement becomes a clean draft only after matching native readback for the
same source; later metadata cannot mark an unknown operation saved.

## 6. State, ownership and source model

Keep at most one complete protected preference record. A different selection
makes the retained record inactive; it is not silently retargeted. Selecting the
same entry again advances the selection revision and also retires applicability.
A new explicit review may replace that inactive record for the current context.
Legacy `previous-session` must first be materialized using the existing explicit
verification journey. Merely opening this page cannot perform that verification.

Any vault revision change retires positive enabling preferences, including removal
of another saved connection. It MUST NOT silently release an earlier positive
pause for the same materialized entry/account/repository: retain that restriction
with a visibly historical source until explicitly reviewed. A different selected
native identity makes it inactive. An inactive density/feature draft remains
inspectable and can be explicitly reviewed for the current selection.

After worker recreation, only an unchanged native selection binding and a fresh
matching active verification allow application. The adapter constructs the pure
`SessionProfile` using the current worker credential epoch. Reconnection or
reselection cannot reuse an earlier override by coincidence of numeric IDs or
worker epoch. Retained native matching may preserve a positive temporary pause
before restoration, while density, shortcuts and feature enabling remain inert.

The browser-session document has explicit ready, future, corrupt and unavailable
states. Pending native work and earlier precaution are independent restriction
facts, distinct from saved pauses and native emergency/tab pauses. Public
explanation must not relabel any of them as an emergency selected by the user.

The content projection carries only the independent worker condition, document
availability and generic scope: empty, active, retained, inactive, unverified or
unknown. An active source requires current verified applicability; an unverified
source cannot enable preferences. A cold positive record for the claimed numeric
repository may conservatively veto restoration without reading a credential or
claiming that the account is verified. A different verified page account, numeric
repository or canonical route cannot apply that selection's preferences.

## 7. Bounded configuration

| Field/control | Default | Fixed boundary |
|---|---|---|
| Document | Absent; no override | `copilot.session-preferences.v1`, schema1, one record, 16KiB |
| Scope | Inferred from verified native selection | Positive numeric identities; materialized entry ID; safe natural selection revision |
| Preferences | Inherit | Optional comfortable/compact density, shortcuts/pause booleans, known feature booleans only |
| Feature map | Empty override | At most all150 registered IDs; unknown keys rejected |
| Document revision | 0 for absence | Safe natural CAS; no wrap or reset to hide conflict |
| Pending reviews | Empty | At most16, five-minute TTL, native opaque operation IDs |
| Completed receipts | Empty | At most32, same bounded lifetime; no replayed effect |
| Pending native submissions | None | FIFO16; current source rechecked before submission |

Recommended: inherit everything and add only a temporary compact-density choice.
Alternative: pause this verified session while keeping saved profiles untouched.
An explicit clear removes the override through review; an all-inherit draft is
canonically empty. Clear retains the version/revision controls while removing
authored scope and values. No configurable flag weakens origin, source, pause, grant or
confirmation checks. Preference imports cannot contain a session selection key.

## 8. Clean Architecture

| Boundary | Responsibility | Forbidden |
|---|---|---|
| Domain | Closed record, scope equality, pure plan and monotonic projection | Browser/time acquisition, credentials, DOM |
| Application | Native binding observation, retained reviews, CAS/guard/readback, independent result | Concrete SDK or presentation policy |
| Browser adapter | Protected session IO using existing ports | Disk/sync fallback or generic RPC |
| Composition | One owner, random IDs/clock, notification and runtime wiring | Business rules in message listeners |
| Presentation | Typed client, draft/review, four-locale content | Native writes, provider calls, authority selectors |

```text
Native selected vault + active verification → semantic binding observation
Protected session record → pure applicability / review plan
Editor confirmation → source recheck → protected mutation + canonical read
 → independent current-state observation → runtime invalidation / local view
```

Existing dependency-direction, purity, cycle, Svelte, module-size, closed-wire,
package and permission gates remain mandatory. Do not duplicate the active
credential in the preference record or add a credential-derived fingerprint.

Every admitted connection mutation retires a private application source lease
before native IO, including a mutation that ultimately fails preflight. Queue
execution rereads the native binding, then checks that synchronous lease
immediately before submission. A selection change between async inspection and
submission therefore cannot retarget a reviewed preference. The private lease
never crosses IPC and is not a replacement for role or credential verification.
Confirmation also reserves the existing settings mutation queue while it
revalidates sources and performs native submission/readback. A queued saved
preference change cannot overtake the reviewed effective-state snapshot between
async preflight and submission. Release the reservation after every outcome;
admission failure never starts another queue or retries a mutation.

## 9. UI, accessibility and localization

```text
Current session preferences
Verified session: Work · octo/example
Temporary choices survive background suspension within this browser session.
Density: Inherit [Compact]    Shortcuts: Inherit
Pause: Inherit               Features: Choose individual preferences
[Review temporary changes] [Cancel draft]

Review: Comfortable → Compact; inherited global pause remains active.
[Confirm temporary changes] [Back to draft]

Result unknown. The draft remains; no change will be repeated automatically.
[Inspect current session preferences] [Cancel draft]
```

Pending state disables duplicate effects. Unknown/future state offers inspection
and Help, preserves the original record and does not offer invented defaults.
Clear has its own exact before/after review. Old scope, unavailable scope and
current verified scope are visibly distinct. Technical IDs stay in disclosure.
Native drafts survive read failure, review expiry and source changes without
silently applying to another account. Existing dirty-navigation ownership and
explicit takeover rules apply. Ship complete en/es/fr/pt, semantic labels,
keyboard order, readable status, narrow layouts and light/dark behavior.

## 10. Failure and recovery

| Condition | Effect | Recovery |
|---|---|---|
| Permission/protected storage unavailable | Connected effects restricted; authored data preserved | Inspect access; no fallback |
| Future/corrupt record | No usable defaults or destructive downgrade | Compatible package / Help |
| Selection/credential/settings source changes | Review stale; older preferences inert | Inspect and explicitly review again |
| Acknowledgement lost, exact readback agrees | Current native state is observed | No repeated write |
| Readback missing/different | Desired result unknown; extra precaution remains | Independent inspection and new explicit review |
| Cancel/source retirement after submission | Does not reverse an actual native attempt | Keep factual result separate from authorization |
| Worker recreation | Old reviews/clients expire; native document remains | Reopen and reverify source; no replay |

Inspection cannot clear a pending/unknown operation's precaution. Explicit
adoption requires a source-bound review of the currently observed canonical
record; temporary-pause adoption cannot clear this independent guard.

## 11. Privacy and permissions

Use the existing protected session area and fixed github.com origin only. Content
gets effective scalar values, generic source codes and closed availability facts;
it receives no native entry ID, selection revision, operation ID, private name or
credential. No new browser permission, cookie/history read or provider endpoint
is introduced. Native origin, binding, role, controller epoch and credential
epoch are rechecked independently of UI state.

## 12. Observation and operational UX

Show attempted native submission, acknowledgement and canonical observation as
distinct facts. No view, notification or restart automatically repeats a write.
Authored temporary preferences and private binding selectors are outside generated
history, like authored profiles/notes; no unconsented backfill is introduced.
Any diagnostic projection is closed, optional and cannot contain the authored
record or establish success absent the primary service's observation. The panel
explains unknown session restrictions independently of native pause state.

## 13. Compatibility, migration and rollback

Absence is empty only after an admitted protected read. Future/invalid documents
are preserved; no disk migration or persistent-settings schema change occurs.
The existing settings import/reset/rollback excludes the new key. Native session
loss clears applicability. Browser/extension session-area removal follows the
browser's lifecycle; the product must not promise durability beyond that area.
An older package must not be installed as an operational rollback while a newer
session restriction is active unless it understands this admission contract;
disable connected access and explicitly inspect/reconcile first. Preserve the
registered H2 test application as engineering rollback, never H3 acceptance.

## 14. Testing strategy and numeric budget

| Area | Minimum distinct cases | Risks |
|---|---:|---|
| Pure record/binding/planning | 32 | Closed fields, epochs, bounds, inheritance, unknown input |
| Application source/review lifetime | 40 | Role/takeover, CAS, settings fences, expiry, replay, cancellation |
| Native IO and restriction guard | 36 | Ack/readback independence, reentry, queue, unknown, adoption |
| Mounted client/UX/localization | 32 | Draft retention, stale source, clear, keyboard, four locales |
| Actual composition/restart/admission | 20 | Cold pause, verified application, worker recreation, redaction, no extra HTTP |
| **Total** | **160** | Locale clones and reruns do not substitute for distinct risks |

Keep every prior regression. Require100% new executable lines, branches,
functions and statements, strict changed-line coverage without partials, and no
extension skips. Use deterministic native ports, clocks and IDs. Full H3 still
requires source-bound Chrome/Firefox/Safari journeys and its independent human
acceptance budget; deterministic tests are not evidence of human usability.

## 15. Documentation

Update configuration with lifetime, verified source, inheritance, normal edit and
clear; permissions with protected storage and no extra grant; runtime recovery
with pending/unknown/source-change states; development with dual source fences,
guard ownership, replay, schemas and native verification. Register local route
links and catalog evidence and run specification/docs/navigation validators.

## 16. Acceptance scenarios

1. A reviewed compact override applies only to the same verified selection and
   appears as a generic session source on the matching GitHub page.
2. Inherited saved/native pauses remain active after a false session pause.
3. A matching retained positive pause blocks cold restoration before HTTP.
4. No temporary enabling applies from a retained identity or page-authored name.
5. Background recreation retains the native document but expires review IDs.
6. Reselection, credential change, different account/repository or unavailable
   binding prevents old preferences from becoming current by epoch coincidence.
   A connection-list revision alone cannot release a positive pause for the same
   native selected identity; its restriction-only historical source stays explicit.
7. A lost response never causes automatic repeat; inspection shows current facts
   without certifying that older operation.
8. An observer can inspect; only the exact current editor can preview/confirm.
9. Future/corrupt storage and unknown native writes remain restricted and intact.
10. Four locales preserve draft, focus, dirty navigation and named before/after
    controls; clear leaves inherited preferences unchanged.
11. Backups/settings reset contain no temporary document or private native key.
12. Known native clear/adoption remains available if saved preferences are invalid,
    future or unreadable; effective saved values remain explicitly unavailable.
13. Missing native infrastructure and contradictory private wire fields cannot
    become an empty, verified or unpaused default. Native submission, acknowledgement,
    readback and current-source facts remain independently inspectable.

## 17. Traceability

| Requirements | Owner/evidence | Documentation |
|---|---|---|
| 16.1–4,6 | Pure binding/resolution and real configuration/GET admission suites | Configuration/runtime |
| 16.5,7,9,12–13 | Store/guard, review lifetime, protected readback and restart composition | Recovery/development |
| 16.8,10 | Native gateway/controller and mounted local route/draft suites | Configuration/onboarding |
| 16.11 | Closed schema/export/rollback and native-only wire/redaction suites | Permissions/development |

Implementation paths enter the catalog only when they exist and carry executable
evidence; this specification does not mark the feature implemented.

## 18. Implementation sequence

Define closed schemas/bindings/plans and tests; integrate native source observation
and protected ownership; add reviewed gateway/client/route with four locales;
wire cold restrictions and current projections; update docs/catalog; complete
unfiltered coverage, hooks, packages, Graphify and cleanup; then full native/human
H3 evidence and current-head remote review/Codecov after the entire milestone.

## 19. Definition of Done

- [ ] Every acceptance scenario has meaningful executable evidence.
- [ ]160-case risk budget, all previous regressions and full coverage pass.
- [ ] Source/role/epoch/CAS/guard/readback and privacy gates cannot be weakened.
- [ ] Reviewed four-locale native journey and complete docs are implemented.
- [ ] Three-target packages, architecture, specifications and Graphify pass.
- [ ] Source-bound native/human H3 acceptance is recorded separately.
- [ ] Entire #704 is implemented before source publication/PR; exact-head remote
      checks, complete review/no findings and Codecov100% without partials precede merge.

## 20. References and decisions

- [Owning H3](github-browser-extension-control-center-h3.md), section7.1.
- [Effective-state contract](github-browser-extension-collection-consent.md#616-complete-effective-state-and-runtime-restriction-provenance).
- [Chrome storage reference](https://developer.chrome.com/docs/extensions/reference/api/storage)
  and [Mozilla session storage reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session)
  describe browser-session memory storage. The implementation must recheck its
  capability and protect access; provider documentation is not native acceptance.
- Decision: combine a stable native selection binding with the current worker
  epoch; a worker counter alone cannot identify the same credential across restart.
- Decision: retain authored data through unknown outcomes, and keep this guard
  independent of temporary tab/emergency pause reconciliation.
