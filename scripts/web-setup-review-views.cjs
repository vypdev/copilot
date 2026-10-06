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
  if (state === 'plan') return { ...base, prompt: { kind: 'plan', title: 'Review your setup plan', copyId: 'plan.review',
    editGroups: ['capabilities', 'repository', 'projects', 'storage'], plan: {
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
