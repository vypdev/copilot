# Command startup evidence and diagnostic job margin

The same130 controls produce **126 PASS / 4 FAIL** against parent `b26c892c`,
then **130 PASS / 0 FAIL / 0 SKIP** after the two causal corrections. Five cases
are new; the existing workflow contract is strengthened. The complete test
file has the same SHA256 in both runs. The modeled chunk-delivery fixture emits
the real process `spawn` event before data in both runs.

Already-cancelled and failed-to-spawn commands retain null stdout/stderr,
digests and capture metadata. A real successfully spawned empty Node command
retains empty strings and empty-byte hashes. An error after spawn preserves
actual captured bytes. Real owned process tests and controlled child-event
tests establish these separate cases; they do not execute Codex.

The manual Linux diagnostic job now allows15minutes. Its fixed technical
download60s, command20s, termination1s and Engine3s timers are unchanged. The
nominal eleven sequential command phases total294s including download and
Engine observation; the former300s job left only6s for checkout, setup,
hashing, receipt writing and upload. The new606s margin is not a guarantee
against stalled host I/O. No actual job timeout is claimed. Research/model,
consumer runtime and qualification limits are unchanged.

The two changed-module coverage gates pass: policy100%all metrics; adapter
99.54%lines,96.74%statements,91.37%branches,94.54%functions. The focused coverage
command retains exit1 because unrelated web and specification-publication
coverage owners are absent from that two-module run. Global acceptance remains
separate; no gate or threshold is suppressed.

[`source-and-controls.json`](source-and-controls.json) records the exact hashes,
counts, unchanged timer arithmetic, coverage and lossless raw-log archives.
All original private attempts remain retained. The
[prior canonical comment](goal-950-canonical-through-continuation131.md) is
preserved verbatim, including its earlier immutable history links.

Actual Native4 remains the single run45038779876 on executed source `94d76006`.
No new native diagnostic is dispatched by this packet. Actual SDK/model-tool,
credential/oracle exclusion, common native C32–C35 and174/42 acceptance remain
pending. Qualified profiles NONE, qualification calls0, evaluated-pilot writes0;
production settings are unchanged and verification remains disabled.
