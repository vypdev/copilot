# #895 reserved diagnostic results

[Preregistration](preregistration.md) · [Frozen commit](https://github.com/vypdev/copilot/commit/c45ac549860b9b611b71ba974a8aa2ee4cc96651) ·
[Simulated controls](runner-control.json) · [Trial ledger](trials.jsonl) ·
[Causal review](causal-review.json) · [Scores](scores.json)

The same first-call packet, prompt and schema went to both profiles
and all three arms on each tree. The controls exercised both turns
with the real Git adapter on the on-demand arm and compared
authenticated receipts against the published fixture. The initial
packet withheld the effective Vitest config. The simulated complete
packets were below 15,500 bytes and prompts below 21,500 bytes.

| Tree | First packet / prompt bytes | Repeat packet / prompt bytes | On-demand packet / prompt bytes |
| --- | ---: | ---: | ---: |
| original | 11453 / 12764 | 11520 / 12349 | 13766 / 14595 |
| mutant | 11453 / 12764 | 11520 / 12349 | 14275 / 15104 |

The pilot ran 36 scheduled trials and recorded 48
provider attempts. No trial attempted a GitHub write. Coverage outputs
and expected verdicts remained with the evaluator.

## Results by model, tree and arm

| Model | Tree | Arm | Admitted | Config retrieved / delivered / cited | Supported correct | Inconclusive | Unsupported | Technical | Proven budget | Median wall ms | Gross input / output |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gpt-6-luna | original | fixed | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 1/3 | 0/3 | 2/3 | 1/3 | 42013 | 21,457 / 196 (1/3 measured) |
| gpt-6-luna | original | repeat | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 2/3 | 0/3 | 1/3 | 2/3 | 7426 | 21,390 / 327 (2/3 measured) |
| gpt-6-luna | original | on-demand | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 1/3 | 0/3 | 2/3 | 2/3 | 7408 | 32,139 / 341 (2/3 measured) |
| gpt-6-luna | mutant | fixed | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 2/3 | 0/3 | 1/3 | 3/3 | 27304 | 32,113 / 466 (3/3 measured) |
| gpt-6-luna | mutant | repeat | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 2/3 | 0/3 | 1/3 | 2/3 | 7164 | 21,412 / 294 (2/3 measured) |
| gpt-6-luna | mutant | on-demand | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 2/3 | 0/3 | 1/3 | 3/3 | 6545 | 32,115 / 464 (3/3 measured) |
| gpt-6.1-sol | original | fixed | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 7393 | 32,091 / 479 (3/3 measured) |
| gpt-6.1-sol | original | repeat | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 18146 | 63,552 / 1,080 (3/3 measured) |
| gpt-6.1-sol | original | on-demand | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 15428 | 63,630 / 981 (3/3 measured) |
| gpt-6.1-sol | mutant | fixed | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 3/3 | 9219 | 32,113 / 617 (3/3 measured) |
| gpt-6.1-sol | mutant | repeat | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 16481 | 63,594 / 971 (3/3 measured) |
| gpt-6.1-sol | mutant | on-demand | 0/3 | 0/3 / 0/3 / 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 18315 | 53,095 / 990 (3/3 measured) |

Config counts require the decisive Git ranges. A supported verdict
also cites the four material links and passes causal review. A correct
label without the requisite evidence is unsupported. The fixed and
repeat controls can stop as designed while recording their responses.

## Per trial

| Slot | Typed request | Adapter or control outcome | Config retrieved / delivered / cited | Verdict | Outcome | First stopping stage | Budget |
| --- | --- | --- | --- | --- | --- | --- | --- |
| original/1/fixed/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| original/1/fixed/gpt-6.1-sol | searchTree . name *vitest* | unresolved · fixed-single-call | no / no / no | — | unresolved-request | admission | within |
| original/1/repeat/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| original/1/repeat/gpt-6.1-sol | searchTree . name *vitest* | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| original/1/on-demand/gpt-6-luna | — | — | no / no / no | — | technical-failure · initial/provider-turn-timeout | technical-initial | unknown |
| original/1/on-demand/gpt-6.1-sol | searchTree . literal completeCoverage, . literal storybookTest( | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| mutant/1/fixed/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| mutant/1/fixed/gpt-6.1-sol | — | — | no / no / no | refuted | unsupported-conclusive | request | within |
| mutant/1/repeat/gpt-6-luna | readBlob tooling/coverage.mjs 1–56, vitest.config.mjs 1–80, tests/coverage-evidence.test.mjs 1–30 | denied · request-shape | no / no / no | — | technical-failure · delivery/provider-turn-timeout | admission | unknown |
| mutant/1/repeat/gpt-6.1-sol | searchTree . name vitest | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| mutant/1/on-demand/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| mutant/1/on-demand/gpt-6.1-sol | searchTree . literal completeCoverage, . literal storybookTest | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| original/2/repeat/gpt-6-luna | — | — | no / no / no | — | technical-failure · initial/provider-turn-timeout | technical-initial | unknown |
| original/2/repeat/gpt-6.1-sol | searchTree . name *vitest*, . literal completeCoverage( | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| original/2/on-demand/gpt-6-luna | — | — | no / no / no | — | technical-failure · initial/closed-session-tool-event | technical-initial | within |
| original/2/on-demand/gpt-6.1-sol | searchTree . name *vitest* | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| original/2/fixed/gpt-6-luna | — | — | no / no / no | — | technical-failure · initial/provider-turn-timeout | technical-initial | unknown |
| original/2/fixed/gpt-6.1-sol | searchTree . name *vitest* | unresolved · fixed-single-call | no / no / no | — | unresolved-request | admission | within |
| mutant/2/repeat/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| mutant/2/repeat/gpt-6.1-sol | searchTree . literal completeCoverage, . literal storybookTest( | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| mutant/2/on-demand/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| mutant/2/on-demand/gpt-6.1-sol | — | — | no / no / no | refuted | unsupported-conclusive | request | within |
| mutant/2/fixed/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| mutant/2/fixed/gpt-6.1-sol | searchTree . literal completeCoverage, . literal storybookTest | unresolved · fixed-single-call | no / no / no | — | unresolved-request | admission | within |
| original/3/on-demand/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| original/3/on-demand/gpt-6.1-sol | searchTree . literal completeCoverage, . literal storybookTest | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| original/3/fixed/gpt-6-luna | — | — | no / no / no | — | technical-failure · initial/provider-turn-timeout | technical-initial | unknown |
| original/3/fixed/gpt-6.1-sol | searchTree . name *vitest* | unresolved · fixed-single-call | no / no / no | — | unresolved-request | admission | within |
| original/3/repeat/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| original/3/repeat/gpt-6.1-sol | searchTree . name *vitest*, . literal completeCoverage( | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| mutant/3/on-demand/gpt-6-luna | — | — | no / no / no | — | technical-failure · initial/first-response-shape | technical-initial | within |
| mutant/3/on-demand/gpt-6.1-sol | searchTree . name *vitest* | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |
| mutant/3/fixed/gpt-6-luna | — | — | no / no / no | — | technical-failure · initial/first-response-shape | technical-initial | within |
| mutant/3/fixed/gpt-6.1-sol | searchTree . literal completeCoverage, . literal storybookTest( | unresolved · fixed-single-call | no / no / no | — | unresolved-request | admission | within |
| mutant/3/repeat/gpt-6-luna | — | — | no / no / no | inconclusive | valid-inconclusive | request | within |
| mutant/3/repeat/gpt-6.1-sol | searchTree . literal completeCoverage(, . literal storybookTest( | denied · scope-denied | no / no / no | refuted | unsupported-conclusive | admission | within |

The ledger retains the exact typed requests, source receipts and
aliases, transport outcomes and usage for each attempt. The scores
record the first stop independently of the outcome class.


## Profile decisions

Neither profile met the gate. Both scored 0/3 supported original
refutations and 0/3 supported mutant confirmations in the on-demand
arm. Neither exceeded the controls, which also had zero supported
verdicts.

Luna returned three valid inconclusives and three technical failures
in its six on-demand trials. The inconclusives identified missing
effective configuration or runtime extensions without asking for the
missing source. The failures were a timeout, a closed-session MCP
tool event and an invalid first response shape. Its single request
across all 18 trials came in the repeat control. It combined three
targets in a one-target line-read operation and was denied.

Sol made five on-demand requests and all failed admission. The other
on-demand trial returned a refutation on its first call. All six
refutations lacked the decisive configuration receipt. The three
original responses matched the expected label without sufficient
support. The three mutant responses also got the label wrong by
treating the default exclusion as effective. The same assumption
appeared in the repeat arm after the denial.

Across all arms, 17 requests were recorded and zero were admitted.
Sixteen Sol requests used `scope: "."` and were denied before Git
ran. The adapter represents the repository root with an empty string
and uses exact basename matching for `match: "name"`. Some of the
denied requests also used a glob as a name query. The preregistered
prompt did not state those two syntax rules. The controls proved
the path for an already valid request. The measured pilot did not
reach real retrieval or delivery in any trial. No request or prompt
was repaired or retried after measurement started.

The ledger records 48 attempts, with five timeouts, two invalid
first-response shapes and one closed-session tool event. Five trials
have unknown consumption because a call timed out. The closed
transport disables tools and rejected the unexpected event. The
ledger records its type as `mcp_tool_call` and does not identify a
method. The application write ports recorded zero attempts.

The scoring command requires Python 3.10 or newer. The fixtures and
deterministic delivery checks remain valid. This model run leaves
production activation disabled and PR #951 in draft.
