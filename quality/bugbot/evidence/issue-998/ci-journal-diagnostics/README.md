# Journal CI wait diagnostics

Native7b static and build/package checks pass, including104 files and11 extracted
CLI controls with zero effects. Coverage fails five unchanged5-second test waits:
one batch receipt/rename case and four publisher uncertainty/recovery cases.
964 suites /19,725 assertions pass;35 historical skips remain. The aggregate fails.
The complete API logs are retained; no old CI run is retried.

The same64 controls pass in local isolation. Observation records279 real fsyncs,
maximum16.71ms here; this does not establish the native cause or reproduce its
host conditions. The focused coverage command exits1 for unrun owners. Native
cause remains **unproven**.

The only new code is test-fixture observation. It reports bounded method/ordinal/
elapsed/pending metadata if a test is slow or unfinished. It never records file
paths, arguments, contents, credentials or environments, changes no test deadline,
and never cancels, retries or changes filesystem completion. Shared methods are
restored after the suite. The final64-test diagnostic cohort passes; the initial
lint/global-declaration error is retained and corrected without rule changes.

Production code and all four bundles are byte-identical to7b. New normal hooks,
exact-head native checks and review remain required. A later pass would not itself
prove the cause of these historical timeouts. Production verification stays disabled;
actual174/42 remain unstarted and evaluated-pilot write attempts remain zero.

The final diagnostic-source23-file cohort also passes1,085 assertions and86/86 mapped cases;90 remain registered. Both measured runtime modules retain100%allmetrics. That focused coverage command exits1 for unexecuted owners, so it is not a global/native pass.188 declared archive entries verify.
