import { hasExplicitClosingReference, shouldPreserveClosingReference } from '../pull_request_closing_reference';
import { MANAGED_PULL_REQUEST_DESCRIPTION_START as START, MANAGED_PULL_REQUEST_DESCRIPTION_END as END,
  type PullRequestDescriptionMode } from '../pull_request_description';
import { createPendingPullRequestLink, attachPendingPullRequestLink, type PullRequestLinkIdentity } from '../pull_request_issue_link_state';

const identity: PullRequestLinkIdentity = { number: 10, state: 'open', repository: 'owner/repo',
  headRepository: 'owner/repo', headRef: 'feature/42-work', headSha: 'a'.repeat(40) };
const marker = createPendingPullRequestLink({ pullRequestNumber: 10, issueNumber: 42, originalBaseBranch: 'develop',
  operationId: '00000000-0000-4000-8000-000000000001', headRepository: identity.headRepository,
  headRef: identity.headRef, headSha: identity.headSha });
const managed = `${START}\nCloses #42\n${END}`;

type Scenario = { name: string; body: string; has: boolean; preserve?: boolean; mode?: PullRequestDescriptionMode;
  issueNumber?: number; identity?: Partial<PullRequestLinkIdentity> };

it.each(['close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved'])('recognizes the explicit %s keyword', word => {
  const body = `${word.toUpperCase()}: #42.`;
  expect(hasExplicitClosingReference(body, identity.repository, 42)).toBe(true);
  expect(shouldPreserveClosingReference(body, 'replace', identity, 42)).toBe(true);
});

const scenarios: readonly Scenario[] = [
  { name: 'qualified same repository', body: 'Fixes OWNER/REPO#42', has: true },
  { name: 'multi-line discussion paragraph', body: 'Closes #42\nThis is discussion of a sample.', has: false },
  { name: 'fenced example', body: '```text\nCloses #42\n```', has: false },
  { name: 'indented example', body: '    Closes #42', has: false },
  { name: 'quoted reference', body: '> Closes #42', has: false },
  { name: 'lazy quoted continuation', body: '> Example\nCloses #42', has: false },
  { name: 'HTML comment', body: '<!--\nCloses #42\n-->', has: false },
  { name: 'inline code', body: '`Closes #42`', has: false },
  { name: 'contextual mention', body: 'Discuss Closes #42 before deciding.', has: false },
  { name: 'wrong repository', body: 'Closes foreign/repo#42', has: false },
  { name: 'wrong issue', body: 'Closes #43', has: false },
  { name: 'staged nonclosing reference', body: 'Refs #42', has: false },
  { name: 'oversized source', body: 'x'.repeat(65_537) + '\n\nCloses #42', has: false },
  { name: 'invalid pending state', body: 'Closes #42\n\n<!-- copilot:pr-issue-link:invalid -->', has: false },
  { name: 'owned temporary reference only', body: attachPendingPullRequestLink('Refs #42', marker), has: false },
  { name: 'overwritten managed closing reference', body: `Human context\n\n${managed}`, has: true, mode: 'append' },
  { name: 'surviving reference before section', body: `Closes #42\n\n${managed}`, has: true, preserve: false, mode: 'append' },
  { name: 'surviving reference after section', body: `${managed}\n\nCloses #42`, has: true, preserve: false, mode: 'append' },
  { name: 'unclosed managed marker retains outside prose', body: `${START}\n\nCloses #42`, has: true, preserve: false, mode: 'append' },
  { name: 'disabled ownership', body: 'Closes #42', has: true, preserve: false, mode: 'disabled' },
  { name: 'foreign head repository', body: 'Closes #42', has: true, preserve: false, identity: { headRepository: 'foreign/repo' } },
  { name: 'different branch issue', body: 'Closes #42', has: true, preserve: false, identity: { headRef: 'feature/43-work' } },
  { name: 'self issue identity', body: 'Closes #42', has: true, preserve: false, identity: { number: 42 } },
  { name: 'branch without tree', body: 'Closes #42', has: true, preserve: false, identity: { headRef: '42-work' } },
  { name: 'escaped raw reference', body: 'Closes \\#42', has: false },
  { name: 'entity-decoded raw reference', body: 'Closes &#35;42', has: false },
  { name: 'CRLF managed reference', body: managed.replace(/\n/gu, '\r\n'), has: true, mode: 'preserve' },
  { name: 'zero issue identity', body: 'Closes #42', has: false, issueNumber: 0 },
  { name: 'noninteger issue identity', body: 'Closes #42', has: false, issueNumber: NaN },
  { name: 'human closing alongside owned pending state', body: attachPendingPullRequestLink('Closes #42', marker), has: true },
  { name: 'Unicode-confusable keyword', body: 'cloſes #42', has: false },
];
it.each(scenarios)('grounds $name in raw source and replacement ownership', scenario => {
  const issueNumber = scenario.issueNumber ?? 42;
  expect(hasExplicitClosingReference(scenario.body, identity.repository, issueNumber)).toBe(scenario.has);
  expect(shouldPreserveClosingReference(scenario.body, scenario.mode ?? 'replace', { ...identity, ...scenario.identity }, issueNumber))
    .toBe(scenario.preserve ?? scenario.has);
});
