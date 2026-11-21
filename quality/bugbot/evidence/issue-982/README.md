# Six real platform observations — #982

No case is passed by this packet. The historical acceptance ledger is unchanged:
I039/I040 require a real Linux desktop; I041/I042 require a real Windows desktop;
X023/X026 require the named actual Windows service account and file-symlink
capability. This current session is macOS. Linux CI activity does not establish
Linux desktop access, and a repository runner list does not establish organization
capacity. Organization runner-policy inspection returned HTTP 403.

The exact source/package/CLI/UI identity is in manifest.json, also recorded by the
independent #981 review packet (PR #994). This packet contains its own identities;
#981 is not a prerequisite for these platform observations.
Use a disposable fixture only, no real repository or credentials. Keep Windows
service jobs off the codex label; do not grant privileges or alter runner policy
as part of an observation. Never enable enforcement or publish a release.

## Required evidence

Record actual reviewer/date, self-hosted runner identity/group/job URL, OS/version,
Node/CLI/package/source hashes, browser/version for desktop cases, Windows service
principal/session and actual file-symlink capability for X023/X026. Keep a terminal
trace and direct browser observation of URL/pairing/fallback. Use the existing
fixture-only protocol in scripts/smoke-packaged-web-session.cjs as the safe boundary:
it strips credentials, starts a disposable local Git fixture, deliberately
suppresses the browser opener, pairs only on loopback, cancels before confirming
the repository or submitting a credential, and verifies that the fixture checkout
is unchanged. The automated smoke closes its session; its HTTP assertions alone
are supplementary and do not supply the required human desktop observation.

A reviewer-assisted interactive execution must keep that same isolation and stop
before repository confirmation or real credential entry. Do not run copilot setup
against a live checkout. Do not expose the loopback server on an external address.
Capture actual normal launch and actual opener failure/fallback separately.

## Windows service symlink checks

Use the exact ccefb source on the actual reviewed self-hosted Windows service
runner (self-hosted, Windows; no codex label). Record its native identity and
privilege result without changing privileges. Run the two existing production
server assertions with Node 24 and the frozen lockfile:

    pnpm exec jest src/cli/__tests__/web_setup_server.test.ts --runInBand --json --outputFile=platform-symlink-results.json --testNamePattern="an asset replaced by an escaping symlink is not served|startup refuses an index symlink outside the asset root"

Inspect the two exact JSON assertion rows. Both must be passed, executed on
Windows under the stated service identity. A skipped/pending assertion caused by
EPERM is unavailable evidence; record that result and leave its ledger row open.
Two passes on macOS/Linux are not substitutes. Do not remove capability-based
skips or loosen the server containment boundary to manufacture an observation.
The fixture creates and removes only its own local files; no model/provider/GitHub
write adapter is needed. Keep raw failures, skips and available capability details.

The broad setup_platform_smoke.yml also includes companion native verification
and repository/extension suites. Do not dispatch it blindly as proof of these six
cases: its complete effects must first be reviewed, and automated package checks
still cannot replace the four human desktop observations. A queued job is not an
execution result. No platform-observation workflow has been dispatched for #982 in this task.
The ordinary issue/PR delivery Actions are separate from these observations.

After actual evidence arrives, update only its corresponding existing ledger rows,
preserve the previous unavailable observations, and run validate:setup-acceptance
and the applicable specification/docs validators. Partial focused Jest output is
not a repository-wide acceptance pass. All six rows remain open pending evidence.


## Budget and actual result

The budget is exactly the six existing observations: four direct desktop/package
journeys and two existing Windows-service filesystem assertions. There are zero
new automated acceptance cases and zero claimed executions of these six rows.
The blank fields are a review template, not evidence. No named corresponding
reviewer/environment has been supplied to this session. Keep all six cases open;
do not infer that organization runners or desktops are absent merely from an
inaccessible policy endpoint. The platform/environment request is still pending.

After an actual observation, retain its raw result, identity and any failed/skipped
attempt, then reconcile only its corresponding existing ledger row. Existing
336/350 acceptance with 14 open cases is unchanged by preparing these instructions.
Run `pnpm run validate:setup-acceptance`, documentation and applicable specification
validators. A focused Jest run cannot establish complete repository acceptance.
No runner label, privilege, consumer installation template, model invocation,
production verification setting or default workflow is changed by this packet.

Preparation validation passes: unchanged acceptance ledger 336/350 with 14 open, documentation and specification contracts, and Graphify. These checks provide no new desktop or Windows-service observation.

The initial mandatory hook passed 942 suites but a worker received SIGSEGV before the unchanged complete-conversation prompt suite started. Its exact log/metadata are retained. That suite passes independently (6/6 in one process); the complete mandatory hook is retried without altering tests or assertions. These delivery tests supply none of the six platform observations.
