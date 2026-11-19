# Credential-health trust review — #979

**Policy proposal; maintainer approval remains pending.** This prepares a source-only
operating policy and its evidence. It does not establish independent protection
against workflow-editing collaborators or install anything on trusted default.

## Observed baseline

`observed-baseline.json` records the authenticated API snapshot. Source develop
is `ccefb27627cd627ccdb7d5666fd174c2ac1da07b`; default is master at
`ace49e4a7ce0f6a007fef5d11479eb9b7a5846e3`. Their health workflow hashes differ:
source a3706073a38708205bc1ec68c96a0b8caf5e5bff98f09fc747c11b926996aa08
uses self-hosted/codex/Linux; default
5f093b2c03bef389ccea68ef43bec3577cb1bfddc038da1884a146088f39a4ec
still uses ubuntu-latest. Exact pre-change workflows are preserved here.
No current default installation of the proposed policy is claimed.

The two repository collaborators are administrators: efraespada (1783618) and
vypbot (260864876). The repository enables all actions, does not require SHA
pinning, and defaults GITHUB_TOKEN to write with approval permission. The health
workflow explicitly narrows its own token to contents:read. Each explicit
false-by-default check exposes only its requested Secret to one job. That
`permissions` declaration does not reduce the PAT/provider key's own grants.
Actual stored-credential grants, organization secret access and runner isolation
were not established; no Secret value was read or health dispatch performed.

There is only an npm environment; health jobs name no environment. The effective
master rule response requires strict `CI Check`; classic branch protection is
404. These separate observations do not imply no ruleset protection, nor an
independent review requirement. Organization runner-group policy reads return
403 (admin:org / runner-group permission unavailable). The repository runner list
is empty, which says nothing conclusive about shared organization capacity.

## Concrete proposed policy

Only the source repository's default branch, the exact credential-health
workflow identity and an explicit selected check may run. Original actor IDs
1783618/260864876 and triggering actors efraespada/vypbot are allowed, including
reruns; other selections skip before runner assignment. Each job explicitly
selects group vypdev with self-hosted/codex/Linux. Consumer templates retain their
current runner and selector defaults. There is no new public input or environment
setting. Changes to the literal actor set require a new review.

The native title identifies actor/ref; existing Verify PAT/provider job names
remain unchanged. If all jobs skip, inspect the chosen actor/ref and check flags,
then explicitly retry from trusted default. A queued job is not a successful
check. A missing key fails before HTTP; provider failure fails the job without
retry or exposing its value.

| Threat / condition | Established boundary and limitation |
| --- | --- |
| Actor without write permission | GitHub requires write permission to dispatch this repository. No unauthorized event path is demonstrated. This review sends no real denied dispatch. |
| Accidental branch/workflow selection | The proposed unchanged workflow rejects the wrong ref/path/repository before assigning a runner. |
| Fork actor | The source selector rejects a foreign repository/actor; a fork's own workflow does not grant this repository's write privilege. Organization runner access remains unavailable evidence. |
| Workflow-editing collaborator | Can replace this mutable condition. The counter-control does exactly that. Treat such actors as credential holders unless a separately verified external boundary constrains them. |
| Missing credential / provider failure | Existing actual shell controls use fake curl; zero real endpoints/secrets. Authentication success does not establish full grants or write capability. |

Approval must explicitly choose this default-only actor policy and its trusted
workflow-editor assumption, or require a different externally enforced design.
The selector and repository validator are editable together and are not an
independent trust anchor. Stronger claims require organization/operator evidence
outside candidate-controlled workflow code. This task changes no organization
runner policy, protection, Secret, environment or token grant. Production remains
disabled. This review is not model qualification.

## Executed controls

Four focused Jest suites pass **503 tests**: 11 new selection/mutability cases,
82 existing fake-curl transport cases, 58 trusted-read evidence cases and 352
workflow-validator cases. The nine selection rows cover both allowed actors,
unlisted original/rerun actors, default/other ref, altered workflow identity,
fork repository, disabled flag and wrong event. The remaining new cases bind all
jobs/runners and demonstrate the mutable-condition bypass. These do not simulate
an independent organization policy or prove live authorization.

The intermediate group-format failure is retained: an old validator fixture
expected an array, while the source now explicitly names group vypdev. Updating
that positive shape retains the forbidden-hosted-runner assertion. Initial
502-test success, the 502/503 attempt and the final pass remain in compressed
logs. There was no credential or model call and no evaluated-PR write attempt.

Primary contracts checked on 2026-11-19:
[manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow),
[runner-group restrictions](https://docs.github.com/en/rest/actions/self-hosted-runner-groups?apiVersion=2026-03-10),
and [self-hosted trust](https://docs.github.com/en/actions/reference/security/secure-use).
