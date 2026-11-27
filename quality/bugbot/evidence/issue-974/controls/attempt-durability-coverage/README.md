# Attempt durability and test evidence identities

The actual unchanged recorder reproduces13failures/1pass; the same14controls pass
after correction. New ledgers and request/response artifacts now synchronize their
file, containing directory and its parent before dispatch or completion. Append
requires an existing ledger, preventing lost history from silently restarting.
Descriptor cleanup preserves a first write/sync failure over a later close failure,
and a sole close failure still prevents acknowledgement. Both detector/verifier
paths retain failures rather than claim completed output after a sync error.

These are real private filesystem calls with deterministic syscall faults and
semantic provider fakes. They do not reproduce a physical host crash or prove the
future admitted Linux/filesystem/runtime. The Linux fsync directory-entry contract
is linked in the retained primary-source reference.

Two actual child-process controls mutate only private copied test fixtures after
admission. The old session AST receipt hashes the changed bytes as though they were
the original suite; both controls fail. With pre-load hashes and an exit guard,
both pass and no misleading receipt is emitted. Semantic imports are suppressed;
the instrumented session module is registered without a provider invocation.

The launcher/attempt AST cohort passes69controls with16pre-load test hashes. The
launcher meets its module gate, and the changed recorder reaches100% allmetrics.
The unchanged session transport passes63controls at100% allmetrics with2pre-load
hashes. All module gates pass; global changed-driver qualification remains separate.
The complete ordinary deterministic command passes479/479, without failure, skip
or cancellation. Documentation, catalog/specifications, Graphify and diff checks pass.

The first session AST command incorrectly used node --test with positional wrapper
arguments; Node treated the checkout as another test entry, whose local Action load
failed without supplied GitHub event/credential environment. Its complete negative
and explicit observation limits are retained separately. The documented plain-node
invocation passes; no source assertion, threshold or deadline was weakened.

All SDK/four bundle bytes, corpora, frozen plans,35logicalIDs and selected SDD remain
unchanged. Attempt driver bytes intentionally change and require fresh exact-tuple
admission/preregistration. Normal hooks, final native/review, other valid findings
and global drivers remain required. Actual174/42 stay unstarted, qualification
calls/pilot writes0, qualified profileNONE and production disabled.
