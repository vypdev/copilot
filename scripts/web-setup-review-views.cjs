/** Credential-free fixtures for long content, navigation and prerequisite diagnostics. */
const base = { revision: 1, promptRevision: 1, repository: 'fixture-owner/fixture-repo' };
const decisions = {
  enabledCapabilities: ['issues', 'pullRequests', 'releases'], issueWorkflows: ['feature', 'bugfix', 'release'],
  agentRouting: ['planner', 'findings', 'reviewer', 'fixer', 'tester'].map(role => ({
    role, provider: 'codex', modelProvider: 'openai', model: 'fixture-model',
  })),
  productionBranch: 'main', developmentBranch: 'develop', approvalMode: 'recommend',
  trustedChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }], producerAttested: false,
  coverageMode: 'check', coverageCheck: 'CI Check', projectNumbers: ['2'],
  projectStatuses: [{ transition: 'issueCreated', value: 'Todo' }, { transition: 'pullRequestCreated', value: 'In Progress' }],
  variableScope: 'organization', secretScope: 'organization', initialTag: true,
};

function reviewView(state) {
  if (state === 'bot-scope-conflict' || state === 'bot-scope-conflict-unavailable') return { ...base,
    journey: { repository: base.repository, position: 4, total: 6, current: 'Plan',
      complete: ['Repository', 'Setup choices', 'Setup PAT'], pending: ['Bot PAT & credentials', 'Apply'], mutationStarted: false, choiceReviewPass: 1 },
    prompt: { kind: 'choice', title: 'Resolve the bot PAT scope conflict',
      copyId: state === 'bot-scope-conflict' ? 'botPat.scopeConflict' : 'botPat.scopeConflictUnavailable',
      copyValues: { repository: base.repository },
      choices: ['I have deleted the repository PAT — check again', 'Store PAT in the repository instead', 'Stop setup'] } };
  if (state === 'bot-credential' || state === 'bot-account-mismatch') return { ...base,
    journey: { repository: base.repository, position: 5, total: 6, current: 'Bot PAT & credentials',
      complete: ['Repository', 'Setup choices', 'Setup PAT', 'Plan'], pending: ['Apply'], mutationStarted: false, choiceReviewPass: 1 },
    prompt: state === 'bot-credential' ? { kind: 'secret', title: 'PAT — bot account PAT', copyId: 'botPat.entry.guided',
      copyValues: { name: 'PAT', account: 'fixture-bot', accountId: '42', storageScope: 'organization', storageDestination: 'fixture-owner', storageReplacesExisting: 'true' },
      link: 'https://github.com/settings/personal-access-tokens/new?target_name=fixture-owner&contents=write&expires_in=90' }
      : { kind: 'choice', title: 'This PAT belongs to a different GitHub account', copyId: 'botPat.identityMismatch',
        copyValues: { expected: 'fixture-bot', actual: 'fixture-operator' }, choices: ['Enter another bot PAT', 'Stop setup'] } };
  if (state === 'plan') return { ...base, prompt: { kind: 'plan', title: 'Review your setup plan', copyId: 'plan.review',
    editGroups: ['capabilities', 'repository', 'projects', 'storage'], plan: {
      workflowPatStorage: { scope: 'organization', destination: 'fixture-owner', replacesExisting: true },
      decisions, presentationDefaults: [{ group: 'bugbot', count: 10 }],
      permissionProbes: ['Contents', 'Secrets', 'Variables', 'Issues', 'Actions', 'Workflows'].map(permission => ({ scope: 'repository', permission })),
      files: Array.from({ length: 29 }, (_, i) => `workflows/fixture-workflow-${i + 1}.yml`),
      workflows: Array.from({ length: 15 }, (_, i) => `fixture-workflow-${i + 1}.yml`),
      variables: Array.from({ length: 68 }, (_, i) => `FIXTURE_VARIABLE_${i + 1}`), secrets: ['PAT'],
      warnings: ['Selected Project numbers must be accessible to the bot PAT, and all four configured Status values must exist in every selected Project.'],
    } } };
  if (state === 'checks') return { ...base, prompt: { kind: 'question', title: 'Trusted checks', phase: 'full', pass: 1,
    canGoBack: true, question: { stateId: 'pull-request-approval', id: 'pullRequestApproval.testChecks',
      label: 'Trusted checks', kind: 'producer-select', defaultValue: '', discoveryStatus: 'observed',
      producerCandidates: Array.from({ length: 12 }, (_, i) => ({ name: `CI Check ${i + 1}`, workflowName: 'Setup Platform Smoke',
        sourceAppId: 15368, sourceAppName: 'GitHub Actions', conclusion: 'success', headSha: 'a'.repeat(40),
        observedAt: '2026-10-06T17:18:46Z', runUrl: `https://github.com/fixture-owner/fixture-repo/actions/runs/${i + 1}` })),
    } } };
  if (state === 'question') return { ...base, prompt: { kind: 'question', title: 'Issue workflows', phase: 'permission-intent', pass: 1,
    canGoBack: false, question: { stateId: 'capabilities', id: 'issueWorkflows.enabled', label: 'Issue workflows',
      kind: 'multi-select', defaultValue: '', choices: ['feature', 'bugfix', 'documentation', 'chore', 'help', 'hotfix', 'release'] } } };
  if (state === 'credential') return { ...base, prompt: { kind: 'secret', title: 'Setup PAT', copyId: 'setupPat.entry' } };
  if (state === 'blocked-permissions') return { ...base, prompt: undefined, outcome: 'blocked',
    setupPatCorrection: { stage: 'final', addedGrants: ['repository Workflows write'],
      url: 'https://github.com/settings/personal-access-tokens/new?target_name=fixture-owner&contents=write&actions=write&workflows=write&expires_in=1' },
    resultDetail: { reasonCode: 'permissions', stoppedStage: 'Plan', mutationStarted: false },
    permissions: { role: 'setup', report: { role: 'setup', identityStatus: 'valid', identityMessage: 'Fixture identity verified',
      ready: false, confirmationRequired: false, checks: [
        { id: 'actions', role: 'setup', scope: 'repository', permission: 'Actions', level: 'write', applicability: 'required',
          reason: 'Dispatch credential-health checks for existing Secrets.', probe: 'actions', status: 'unverifiable',
          prerequisite: 'contents-workflows-write', message: 'Bounded fixture failure' },
        { id: 'workflows', role: 'setup', scope: 'repository', permission: 'Workflows', level: 'write', applicability: 'required',
          reason: 'Bootstrap a missing credential-health workflow.', probe: 'workflows', status: 'missing', message: 'Bounded fixture denial' },
      ] } } };
  return undefined;
}
module.exports = { reviewView };
