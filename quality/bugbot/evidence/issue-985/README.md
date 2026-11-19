# EV-07 corpus revision 2 — #985

This new 174-case data revision changes only the workflow input of
`actions-readonly-metadata`. The original v1 bytes, labels, plans, predictions
and failed scores remain unchanged; their exact baseline hashes are retained.
The JSON schema remains version 1. The v2 filename identifies a data revision.

The original root `steps` with no `jobs` is malformed as a complete workflow.
Revision 2 supplies one complete job running only the numeric PR metadata echo,
with explicit read-only contents permission and no checkout or PR execution.
The fixture's `ubuntu-latest` is fictional consumer context, not a source-repo
workflow or a runner-policy change. `expected: []` is proposed for independent
review of this corrected input; it does not relabel the original campaign.

`derivation.json` contains the exact before/after input and both corpus hashes.
Six deterministic controls cover original malformed shape, corrected complete
workflow, the fixed authorized metadata command, invalid structural negative,
all 174 stable IDs plus 173 unchanged case objects, and unchanged historical
hashes with deterministic derivation. The public benchmark loader accepts v2.
The fixed shell control prints a synthetic numeric PR value and makes no network,
GitHub or model call. No arbitrary corpus command is executed.

The original v1 remains the existing CLI/driver default. Before #974, the new
campaign must explicitly select this reviewed v2 artifact in a newly committed
exact driver/preregistration, after all deterministic prerequisites and this
correction merge. The current hardcoded v1 driver is not silently repurposed.
No v2 score or qualification result exists here. All previous negative results
remain negative. Precision/recall/F1/location/severity/category/Brier thresholds
are unchanged; no production prompt is tuned from this case.

Run `node --test quality/bugbot/evidence/issue-985/corpus-revision.test.cjs` or the
existing shadow-verification script. Production stays disabled and all 42
paired full reviews remain unstarted pending a genuinely passing identical-pin
corpus. No installation, activation, release or policy change is performed.

Evidence: #971 / PR #984; the independent structural rule is GitHub's official
[job steps syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps).
