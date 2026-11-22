# Output capture integrity — #1002 / PR1003

The completed review of cf5b4306 validated9/9partitions and identified a real
capture defect: decoding every child chunk independently corrupts split UTF8,
and discarding an oversized chunk before appending a later small one creates a
gap. The exact review job137238727474/run45032430405, its source check metadata
and thread PRRT_kwDONSeBW866kwH_ remain preserved. The prior artifact-rerun
finding is explicitly dismissed from primary-source evidence; it is not reopened.

The adapter now retains each channel's contiguous first65,536 raw bytes, including
the available prefix of an overflowing chunk, and decodes only after joining the
prefix. All chunks delivered through child close contribute to independent raw
observed byte counts/digests; raw retained-prefix identities are separate. The
schema4 receipt declares UTF8-with-replacement text. Invalid original UTF8 or a
character cut by the byte limit can therefore render a replacement character;
its raw identity is still exact. Existing stdout/stderr hash fields retain their
unprojected decoded-text meaning, and displayed text remains privacy projected.
Raw bytes are not exposed to evade that projection. Output limits, termination,
close/quiescence, failed truncation and read/write admission do not change.

Nine new deterministic child-delivery cases cover two-channel split UTF8(2),
overflow followed by later small chunks in both channels(2), malformed UTF8 raw
identity(1), split character at byte limit(1), independent channel budgets/late
bytes(1), exact byte limit(1) and receipt projection/byte identities(1). Existing
actual owned-process/pipe/close tests remain separate. The same corrected test
file retains116PASS/9FAIL before and125PASS after the capture correction. The
initial control used one wrong pre-existing projection token; its original source
and9FAILlog remain distinct. The matched contrast corrects that test defect before
changing capture logic. Final schema/summary assertions refine existing cases.
Final diagnostic125 plus real-journal43 suites pass168/168, without skips.

The parent native CI45032430479/job137238727590 on ubuntu-runner-1 remains a
negative:945suites pass and one fails;18,859tests pass, one times out,35historical
skips. All116diagnostic controls pass. The ambiguous Variable-create recovery
fixture exceeds its5s test budget at5005ms. Its exact pending I/O stage is not
recorded. The fixture awaits real private journal write/fsync/close; the normal
Variable fixtures already use20s under commit b0d181f97700b0b9ea6ce871cbde079fc6e13582.
Only this recovery fixture adopts that existing allowance. HTTP, CLI, runtime,
research, model-call, job and scientific budgets remain unchanged. A separate
one-time6s delay after REAL journal fsync causes the old fixture budget to fail
and the corrected fixture to pass; this is controlled slow-storage evidence,
not a trace proving the original runner's delayed operation. Nonselected tests
in those two isolated contrasts are not counted as executed or new skipped cases.

Pure policy remains100%all coverage metrics; the adapter passes all unchanged
floors. Focused coverage's exit1 retains the two unrelated unexecuted global
owners, with no threshold suppression or global acceptance claim. Generation
and all seven remaining source validators pass. Normal hooks and fresh native
source/runtime gates remain pending at packet creation. Full original negative
CI and review logs, all local controls, verified input snapshots and commands are
losslessly archived with raw/compressed hashes in archive-map.json. The readable
canonical129archive retains the prior live index verbatim and links full history.

The last actual sandbox observation remains Native3/run45028875562:5PASS/3FAIL/
2not-run. No source control here is another sandbox, SDK/model-tool, credential/
oracle exclusion or common C32–C35 observation. Native4 remains unexecuted and
requires the new committed source's gates and review. Never retry an old source
diagnostic unchanged. The174/42campaigns are unstarted; qualification calls0;
evaluated-pilot writes0; profileNONE. Production/privileges and the frozen
recoveries/develop base are unchanged.
