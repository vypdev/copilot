#!/usr/bin/env node

const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const repositoryRoot = path.resolve(__dirname, '..');
const workflowDirectories = [
  path.join(repositoryRoot, '.github', 'workflows'),
  path.join(repositoryRoot, 'setup', 'workflows'),
];
const QUEUE_WAIT_MINUTES = 90;
const QUEUE_GATE_TIMEOUT_MINUTES = 120;
const PREPARE_VERSION_TIMEOUT_MINUTES = 15;
const PREPARE_COMPILED_TIMEOUT_MINUTES = 20;
const TAG_TIMEOUT_MINUTES = 120;
const FAILURE_REPORT_TIMEOUT_MINUTES = 5;
const MIN_QUEUE_JOB_TIMEOUT_MINUTES = QUEUE_GATE_TIMEOUT_MINUTES;
const FAILURE_REPORT_CONDITION = "${{ failure() && github.event.inputs.issue != '-1' }}";
const DISTRIBUTED_COPILOT_ACTION = 'vypdev/copilot@v3';
const CHECKOUT_ACTION = 'actions/checkout@v5';

function assertQueueBudget(queueWaitMinutes, minimumJobTimeoutMinutes) {
  if (!Number.isFinite(queueWaitMinutes)
    || !Number.isFinite(minimumJobTimeoutMinutes)
    || minimumJobTimeoutMinutes < queueWaitMinutes) {
    throw new Error(`minimum job timeout must be >= queue wait (${queueWaitMinutes}m).`);
  }
}
assertQueueBudget(QUEUE_WAIT_MINUTES, MIN_QUEUE_JOB_TIMEOUT_MINUTES);

const QUEUE_WORKFLOW_MANIFEST = Object.freeze([
  ['copilot_commit.yml', 'Copilot - Commit', 'copilot-commits'],
  ['copilot_branch_sync.yml', 'Copilot - Branch Sync', 'branch-sync'],
  ['copilot_issue.yml', 'Copilot - Issue', 'copilot-issues'],
  ['copilot_issue_comment.yml', 'Copilot - Issue Comment', 'copilot-issues'],
  ['copilot_pull_request.yml', 'Copilot - Pull Request', 'copilot-pull-requests'],
  ['copilot_pull_request_comment.yml', 'Copilot - Pull Request Comment', 'copilot-pull-requests'],
  ['copilot_close_inactive_issues.yml', 'Copilot - Close Inactive Issues', 'copilot-inactive-issues'],
  ['hotfix_workflow.yml', 'Task - Hotfix', 'tag'],
  ['release_workflow.yml', 'Task - Release', 'tag'],
].map(([file, workflowName, jobId]) => ({ file, workflowName, jobId })));

const MUTATION_WORKFLOW_MANIFEST = Object.freeze([
  { file: 'release_workflow.yml', workflowName: 'Task - Release' },
  { file: 'hotfix_workflow.yml', workflowName: 'Task - Hotfix' },
]);

const BOT_GATED_WORKFLOW_FILES = new Set([
  'copilot_commit.yml',
  'copilot_issue.yml',
  'copilot_issue_comment.yml',
  'copilot_pull_request.yml',
  'copilot_pull_request_comment.yml',
]);
const BOT_GATE_EXPRESSION = "${{ vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN }}";
const FORK_SAFE_BOT_GATE_EXPRESSION = "${{ (vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN) && github.event.pull_request.head.repo.full_name == github.repository }}";
const FORK_GATED_WORKFLOW_FILES = new Set([
  'copilot_pull_request.yml',
  'copilot_pull_request_comment.yml',
]);
const ZERO_OBJECT_ID = '0000000000000000000000000000000000000000';
const MAJOR_ACTION_REFERENCE = /^[^/\s]+\/[^@\s]+@v[1-9]\d*$/;
const currentCopilotManifest = yaml.load(readFileSync(path.join(repositoryRoot, 'action.yml'), 'utf8'));

const BASE_AGENT_INPUTS = ['agent-provider', 'agent-model-provider', 'agent-model', 'agent-effort', 'agent-command'];
const AGENT_ROLE_INPUTS = Object.freeze(Object.fromEntries(
  ['findings', 'fixer', 'planner', 'reviewer', 'tester'].map(role => [role, [
    `${role}-provider`, `${role}-model-provider`, `${role}-model`, `${role}-effort`, `${role}-command`,
  ]]),
));
const WORKFLOW_AGENT_ROLES = Object.freeze({
  'copilot_issue.yml': ['planner'],
  'copilot_pull_request.yml': ['planner', 'reviewer'],
  'copilot_commit.yml': ['findings'],
  'copilot_issue_comment.yml': ['findings', 'fixer', 'planner', 'reviewer', 'tester'],
  'copilot_pull_request_comment.yml': ['findings', 'fixer', 'planner', 'reviewer', 'tester'],
});

function workflowFiles(directory) {
  return readdirSync(directory)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map(name => path.join(directory, name));
}

function relativeWorkflow(file) {
  return path.relative(repositoryRoot, file).replaceAll(path.sep, '/');
}

function isCopilotAction(step) {
  return typeof step?.uses === 'string'
    && (step.uses === './' || /(?:^|\/)copilot@/.test(step.uses));
}

function isQueueGateAction(step) {
  return isCopilotAction(step) && step.with?.['queue-gate-only'] === 'true';
}

function shouldPersistCheckoutCredentials(relativeFile, jobId) {
  const isMutationWorkflow = MUTATION_WORKFLOW_MANIFEST.some(
    entry => relativeFile.endsWith(`/${entry.file}`),
  );
  if (!isMutationWorkflow) return false;
  if (jobId === 'prepare-version-files') return true;
  return !relativeFile.startsWith('setup/workflows/') && jobId === 'prepare-compiled-files';
}

function assertMajorActionReferences(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const actionUses = [job.uses, ...(job.steps ?? []).map(step => step?.uses)]
      .filter(value => typeof value === 'string');
    for (const uses of actionUses) {
      if (isCopilotAction({ uses })) {
        const expected = relativeFile.startsWith('setup/workflows/') ? DISTRIBUTED_COPILOT_ACTION : './';
        if (uses !== expected) {
          throw new Error(`${relativeFile} job ${jobId} must invoke Copilot with ${expected}.`);
        }
        continue;
      }
      if (uses.startsWith('actions/checkout@')) {
        if (uses !== CHECKOUT_ACTION) {
          throw new Error(`${relativeFile} job ${jobId} checkout must use ${CHECKOUT_ACTION}.`);
        }
        continue;
      }
      if (uses.startsWith('./') || uses.startsWith('docker://')) continue;
      if (!MAJOR_ACTION_REFERENCE.test(uses)) {
        throw new Error(`${relativeFile} job ${jobId} action ${uses} must use a major version tag such as owner/action@v1.`);
      }
    }
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!/^actions\/checkout@/.test(step?.uses ?? '')) continue;
      const expectedPersistence = shouldPersistCheckoutCredentials(relativeFile, jobId);
      if (step.with?.['persist-credentials'] !== expectedPersistence) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} checkout must set persist-credentials: ${expectedPersistence}.`);
      }
    }
  }
}

function assertCopilotActionInputs(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!isCopilotAction(step)) continue;
      const supportedInputs = new Set(Object.keys(currentCopilotManifest.inputs ?? {}));
      const unsupported = Object.keys(step.with ?? {}).filter(input => !supportedInputs.has(input));
      if (unsupported.length > 0) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} passes inputs unsupported by ${step.uses}: ${unsupported.join(', ')}.`);
      }
    }
  }
}

function runnerLabels(value) {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function assertRunner(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const expected = relativeFile.startsWith('setup/workflows/')
    ? ['ubuntu-latest']
    : relativeFile === '.github/workflows/publish_npm.yml'
      ? ['ubuntu-latest']
    : relativeFile === '.github/workflows/repowise.yml'
      ? ['self-hosted', 'coolify']
      : ['self-hosted', 'codex'];
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const labels = runnerLabels(job['runs-on']);
    if (expected.length === 1 ? labels[0] !== expected[0] : expected.some(label => !labels.includes(label))) {
      throw new Error(`${relativeFile} job ${jobId} must use runs-on ${expected.join(', ')}.`);
    }
  }
}

function assertAgentInputs(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const roles = WORKFLOW_AGENT_ROLES[path.basename(file)];
  if (!roles) return;
  const requiredAgentInputs = [
    ...BASE_AGENT_INPUTS,
    ...roles.flatMap(role => AGENT_ROLE_INPUTS[role]),
  ];
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (jobId === 'queue-gate' || !isCopilotAction(step) || isQueueGateAction(step)) continue;
      const missing = requiredAgentInputs.filter(input => !(input in (step.with ?? {})));
      if (missing.length > 0) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} is missing agent inputs: ${missing.join(', ')}.`);
      }
    }
  }
}

function assertNoJobLevelSecrets(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const exposed = Object.entries(job.env ?? {})
      .filter(([, value]) => String(value).includes('secrets.'))
      .map(([name]) => name);
    if (exposed.length > 0) {
      throw new Error(`${relativeFile} job ${jobId} must scope Secrets to the exact step that consumes them: ${exposed.join(', ')}.`);
    }
  }
}

function assertAgentWorkflowPermissions(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!WORKFLOW_AGENT_ROLES[path.basename(file)]) return;
  const expectedPermissions = path.basename(file) === 'copilot_pull_request.yml'
    ? { checks: 'write', contents: 'read' }
    : { contents: 'read' };
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const permissions = job.permissions ?? {};
    const permissionKeys = Object.keys(permissions).sort();
    const expectedKeys = Object.keys(expectedPermissions).sort();
    if (permissionKeys.length !== expectedKeys.length
      || permissionKeys.some((key, index) => key !== expectedKeys[index])
      || expectedKeys.some(key => permissions[key] !== expectedPermissions[key])) {
      throw new Error(`${relativeFile} job ${jobId} must grant GITHUB_TOKEN exactly ${expectedKeys.map(key => `${key}: ${expectedPermissions[key]}`).join(', ')}; mutations use the explicit PAT.`);
    }
  }
}

function assertLightweightBranchSyncWorkflow(file, workflow) {
  if (path.basename(file) !== 'copilot_branch_sync.yml') return;
  const relativeFile = relativeWorkflow(file);
  const branches = workflow.on?.push?.branches;
  if (!Array.isArray(branches) || branches.length !== 1 || branches[0] !== '**') {
    throw new Error(`${relativeFile} must observe pushes on every branch exactly once.`);
  }
  const job = workflow.jobs?.['branch-sync'];
  if (!job || Object.keys(workflow.jobs ?? {}).length !== 1 || job.if !== undefined) {
    throw new Error(`${relativeFile} must have one ungated branch-sync job so bot pushes can propagate.`);
  }
  if (job.env !== undefined) {
    throw new Error(`${relativeFile} branch-sync must not define an agent environment.`);
  }
  const permissions = job.permissions ?? {};
  if (Object.keys(permissions).join(',') !== 'contents' || permissions.contents !== 'read') {
    throw new Error(`${relativeFile} branch-sync must grant only contents: read to GITHUB_TOKEN.`);
  }
  const actionSteps = (job.steps ?? []).filter(isCopilotAction);
  const inputs = actionSteps[0]?.with ?? {};
  if (actionSteps.length !== 1
    || inputs['single-action'] !== 'check_branch_sync_action'
    || inputs.token !== '${{ secrets.PAT }}'
    || Object.keys(inputs).some(key => key !== 'single-action' && key !== 'token')) {
    throw new Error(`${relativeFile} must invoke only the lightweight branch-sync single action and PAT input.`);
  }
  if (/\b(AGENT_|CODEX_|OPENCODE_|CURSOR_|API_KEY|findings-|fixer-|planner-|reviewer-|tester-)/i.test(JSON.stringify(job))) {
    throw new Error(`${relativeFile} branch-sync must not expose agent configuration or provider credentials.`);
  }
}

function needsFor(job) {
  if (job?.needs === undefined) return [];
  return (Array.isArray(job.needs) ? job.needs : [job.needs]).map(String);
}

function assertNoUnsafeCondition(relativeFile, jobId, job) {
  if (typeof job.if === 'string' && /\b(always|failure|cancelled)\s*\(/i.test(job.if)) {
    throw new Error(`${relativeFile} job ${jobId} has a bypass-capable if condition.`);
  }
  for (const [stepIndex, step] of (job.steps ?? []).entries()) {
    if (typeof step.if === 'string' && /\b(always|failure|cancelled)\s*\(/i.test(step.if)) {
      throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} has a bypass-capable if condition.`);
    }
  }
}

function assertNoConcurrency(relativeFile, workflow) {
  if (workflow.concurrency !== undefined) {
    throw new Error(`${relativeFile} must not define GitHub concurrency.`);
  }
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (job.concurrency !== undefined) {
      throw new Error(`${relativeFile} job ${jobId} must not define GitHub concurrency.`);
    }
  }
}

function assertDirectEventTriggers(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const triggers = workflow.on ?? {};
  if (triggers && typeof triggers === 'object' && Object.prototype.hasOwnProperty.call(triggers, 'workflow_run')) {
    throw new Error(`${relativeFile} must use direct event triggers and must not define workflow_run.`);
  }
  if (!relativeFile.endsWith('/copilot_pull_request.yml')) return;
  if (!triggers.pull_request || !triggers.pull_request_review) {
    throw new Error(`${relativeFile} must define direct pull_request and pull_request_review triggers.`);
  }
}

function assertQueueGateJob(file, workflow, expectedUses) {
  const relativeFile = relativeWorkflow(file);
  const queueGate = workflow.jobs?.['queue-gate'];
  if (!queueGate) throw new Error(`${relativeFile} must define queue-gate.`);
  assertExactTimeout(relativeFile, 'queue-gate', queueGate, QUEUE_GATE_TIMEOUT_MINUTES);
  const permissions = queueGate.permissions ?? {};
  const permissionKeys = Object.keys(permissions).sort();
  if (permissionKeys.join(',') !== 'actions,contents'
    || permissions.actions !== 'read'
    || permissions.contents !== 'read') {
    throw new Error(`${relativeFile} queue-gate must have only actions: read and contents: read permissions.`);
  }
  if (queueGate.env !== undefined || Object.prototype.hasOwnProperty.call(queueGate, 'continue-on-error')) {
    throw new Error(`${relativeFile} queue-gate must not define bypass or agent environment.`);
  }
  assertNoUnsafeCondition(relativeFile, 'queue-gate', queueGate);

  const steps = queueGate.steps ?? [];
  if (steps.length !== 2 || steps.some(step => step.run !== undefined)) {
    throw new Error(`${relativeFile} queue-gate may contain only a safe checkout and one gate action.`);
  }
  const checkout = steps[0];
  if (typeof checkout?.uses !== 'string' || !/^actions\/checkout@/.test(checkout.uses)
    || checkout.with?.['persist-credentials'] !== false
    || Object.keys(checkout.with ?? {}).some(key => key !== 'persist-credentials')) {
    throw new Error(`${relativeFile} queue-gate checkout must set persist-credentials: false.`);
  }
  const action = steps[1];
  if (action?.uses !== expectedUses || !isQueueGateAction(action)) {
    throw new Error(`${relativeFile} queue-gate must invoke ${expectedUses} with queue-gate-only: 'true'.`);
  }
  if (Object.prototype.hasOwnProperty.call(action, 'continue-on-error')) {
    throw new Error(`${relativeFile} queue-gate action must not define continue-on-error.`);
  }
  const actionInputs = action.with ?? {};
  if (actionInputs.token !== '${{ github.token }}'
    || Object.keys(actionInputs).some(key => key !== 'queue-gate-only' && key !== 'token')) {
    throw new Error(`${relativeFile} queue-gate must pass only queue-gate-only and github.token.`);
  }
  const gateText = JSON.stringify(queueGate);
  if (/\b(secrets\.|PAT|API_KEY|AGENT_|CODEX_|OPENCODE_|CURSOR_|ANTHROPIC_|OPENROUTER_)/i.test(gateText)) {
    throw new Error(`${relativeFile} queue-gate must not contain PAT, provider secrets, or agent environment.`);
  }
}

function assertExactNeeds(relativeFile, jobId, job, expected) {
  const actual = needsFor(job);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${relativeFile} job ${jobId} must need exactly ${expected.join(', ') || 'no jobs'}.`);
  }
}

function assertExactTimeout(relativeFile, jobId, job, expected) {
  if (job?.['timeout-minutes'] !== expected) {
    throw new Error(`${relativeFile} job ${jobId} must have timeout-minutes ${expected}.`);
  }
}

function assertTagPermissions(relativeFile, job) {
  const permissions = job?.permissions ?? {};
  const permissionKeys = Object.keys(permissions).sort();
  if (permissionKeys.length !== 1 || permissionKeys[0] !== 'contents' || permissions.contents !== 'read') {
    throw new Error(`${relativeFile} tag must have only contents: read permissions.`);
  }
}

function assertTransitiveQueueGateAncestry(file, workflow, gateJobId, allowedFailureJobs = new Set()) {
  const relativeFile = relativeWorkflow(file);
  const jobs = workflow.jobs ?? {};
  const ancestry = new Map();
  const visiting = new Set();
  const reachesGate = (jobId) => {
    if (jobId === gateJobId) return true;
    if (ancestry.has(jobId)) return ancestry.get(jobId);
    if (visiting.has(jobId)) throw new Error(`${relativeFile} has a cycle in job needs.`);
    const job = jobs[jobId];
    if (!job) throw new Error(`${relativeFile} references missing job ${jobId}.`);
    visiting.add(jobId);
    const result = needsFor(job).some(parent => reachesGate(parent));
    visiting.delete(jobId);
    ancestry.set(jobId, result);
    return result;
  };

  for (const [jobId, job] of Object.entries(jobs)) {
    if (!allowedFailureJobs.has(jobId)) assertNoUnsafeCondition(relativeFile, jobId, job);
    if (jobId !== gateJobId && !reachesGate(jobId)) {
      throw new Error(`${relativeFile} job ${jobId} is not a transitive descendant of ${gateJobId}.`);
    }
  }
}

function assertFailureReportingJob(relativeFile, job, expectedNeeds, expectedKind) {
  if (!job) throw new Error(`${relativeFile} must define report-failure.`);
  assertExactTimeout(relativeFile, 'report-failure', job, FAILURE_REPORT_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, 'report-failure', job, expectedNeeds);
  if (job.if !== FAILURE_REPORT_CONDITION) {
    throw new Error(`${relativeFile} report-failure must run only for a failed deployment with a launcher issue.`);
  }

  const permissions = job.permissions ?? {};
  const permissionKeys = Object.keys(permissions).sort();
  const setup = relativeFile.startsWith('setup/workflows/');
  const expectedPermissions = setup
    ? { issues: 'write' }
    : { contents: 'read', issues: 'write' };
  if (permissionKeys.join(',') !== Object.keys(expectedPermissions).sort().join(',')
    || Object.entries(expectedPermissions).some(([key, value]) => permissions[key] !== value)) {
    throw new Error(`${relativeFile} report-failure must use its exact least-privilege permissions.`);
  }
  if (job.env !== undefined || Object.prototype.hasOwnProperty.call(job, 'continue-on-error')) {
    throw new Error(`${relativeFile} report-failure must not define job-level secrets or bypasses.`);
  }

  const steps = job.steps ?? [];
  if (setup) {
    assertSetupFailureReporter(relativeFile, steps, expectedKind);
  } else {
    assertActiveFailureReporter(relativeFile, steps, expectedKind);
  }
}

function assertActiveFailureReporter(relativeFile, steps, expectedKind) {
  if (steps.length !== 2
    || steps[0]?.uses !== CHECKOUT_ACTION
    || steps[0]?.with?.['persist-credentials'] !== false
    || steps[1]?.uses !== './') {
    throw new Error(`${relativeFile} report-failure must checkout safely and invoke the local Copilot action.`);
  }
  const inputs = steps[1].with ?? {};
  const expectedTitle = expectedKind === 'release' ? 'Release' : 'Hotfix';
  if (inputs['single-action'] !== 'publish_issue_comment'
    || inputs['single-action-issue'] !== '${{ github.event.inputs.issue }}'
    || inputs.token !== '${{ github.token }}'
    || !String(inputs['single-action-message'] ?? '').includes(`## ❌ ${expectedTitle} deployment failed`)
    || !String(inputs['single-action-message'] ?? '').includes('${{ github.run_id }}')) {
    throw new Error(`${relativeFile} report-failure must invoke publish_issue_comment with the launcher issue and run link.`);
  }
}

function assertSetupFailureReporter(relativeFile, steps, expectedKind) {
  if (steps.length !== 1
    || steps[0]?.uses !== DISTRIBUTED_COPILOT_ACTION) {
    throw new Error(`${relativeFile} report-failure must invoke the released Copilot action.`);
  }
  const inputs = steps[0].with ?? {};
  const expectedTitle = expectedKind === 'release' ? 'Release' : 'Hotfix';
  if (inputs['single-action'] !== 'publish_issue_comment'
    || inputs['single-action-issue'] !== '${{ github.event.inputs.issue }}'
    || inputs.token !== '${{ github.token }}'
    || !String(inputs['single-action-message'] ?? '').includes(`## ❌ ${expectedTitle} deployment failed`)
    || !String(inputs['single-action-message'] ?? '').includes('${{ github.run_id }}')) {
    throw new Error(`${relativeFile} report-failure must invoke publish_issue_comment with the launcher issue and run link.`);
  }
}

function assertMutationWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const manifest = MUTATION_WORKFLOW_MANIFEST.find(entry => relativeFile.endsWith(`/${entry.file}`));
  if (!manifest) return false;
  if (workflow.name !== manifest.workflowName) {
    throw new Error(`${relativeFile} must have workflow name ${JSON.stringify(manifest.workflowName)}.`);
  }
  const setup = relativeFile.startsWith('setup/workflows/');
  const expectedJobs = setup
    ? ['queue-gate', 'prepare-version-files', 'tag', 'report-failure']
    : ['queue-gate', 'prepare-version-files', 'prepare-compiled-files', 'tag', 'report-failure'];
  const actualJobs = Object.keys(workflow.jobs ?? {});
  if (actualJobs.length !== expectedJobs.length || expectedJobs.some(jobId => !actualJobs.includes(jobId))) {
    throw new Error(`${relativeFile} must define the exact gate-first job graph.`);
  }
  assertNoConcurrency(relativeFile, workflow);
  assertQueueGateJob(file, workflow, setup ? DISTRIBUTED_COPILOT_ACTION : './');
  assertExactTimeout(relativeFile, 'queue-gate', workflow.jobs['queue-gate'], QUEUE_GATE_TIMEOUT_MINUTES);
  assertExactTimeout(relativeFile, 'prepare-version-files', workflow.jobs['prepare-version-files'], PREPARE_VERSION_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, 'queue-gate', workflow.jobs['queue-gate'], []);
  assertExactNeeds(relativeFile, 'prepare-version-files', workflow.jobs['prepare-version-files'], ['queue-gate']);
  if (setup) {
    assertExactTimeout(relativeFile, 'tag', workflow.jobs.tag, TAG_TIMEOUT_MINUTES);
    assertTagPermissions(relativeFile, workflow.jobs.tag);
    assertExactNeeds(relativeFile, 'tag', workflow.jobs.tag, ['prepare-version-files']);
    assertFailureReportingJob(
      relativeFile,
      workflow.jobs['report-failure'],
      ['queue-gate', 'prepare-version-files', 'tag'],
      manifest.file.startsWith('release') ? 'release' : 'hotfix',
    );
  } else {
    assertExactTimeout(relativeFile, 'prepare-compiled-files', workflow.jobs['prepare-compiled-files'], PREPARE_COMPILED_TIMEOUT_MINUTES);
    assertExactTimeout(relativeFile, 'tag', workflow.jobs.tag, TAG_TIMEOUT_MINUTES);
    assertTagPermissions(relativeFile, workflow.jobs.tag);
    assertExactNeeds(relativeFile, 'prepare-compiled-files', workflow.jobs['prepare-compiled-files'], ['prepare-version-files']);
    assertExactNeeds(relativeFile, 'tag', workflow.jobs.tag, ['prepare-compiled-files']);
    assertFailureReportingJob(
      relativeFile,
      workflow.jobs['report-failure'],
      ['queue-gate', 'prepare-version-files', 'prepare-compiled-files', 'tag'],
      manifest.file.startsWith('release') ? 'release' : 'hotfix',
    );
  }
  assertTransitiveQueueGateAncestry(file, workflow, 'queue-gate', new Set(['report-failure']));
  return true;
}

function assertQueueWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const manifest = QUEUE_WORKFLOW_MANIFEST.find(entry => relativeFile.endsWith(`/${entry.file}`));
  if (!manifest) return;
  assertNoConcurrency(relativeFile, workflow);
  if (assertMutationWorkflow(file, workflow)) return;
  if (workflow.name !== manifest.workflowName) {
    throw new Error(`${relativeFile} must have workflow name ${JSON.stringify(manifest.workflowName)}.`);
  }
  const queueJob = workflow.jobs?.[manifest.jobId];
  if (!queueJob) throw new Error(`${relativeFile} must define queue job ${manifest.jobId}.`);
  const expectedBotGate = FORK_GATED_WORKFLOW_FILES.has(manifest.file)
    ? FORK_SAFE_BOT_GATE_EXPRESSION
    : BOT_GATE_EXPRESSION;
  if (BOT_GATED_WORKFLOW_FILES.has(manifest.file) && queueJob.if !== expectedBotGate) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must use the required bot actor${FORK_GATED_WORKFLOW_FILES.has(manifest.file) ? ' and same-repository PR' : ''} gate.`);
  }
  if (typeof queueJob['timeout-minutes'] !== 'number'
    || queueJob['timeout-minutes'] < MIN_QUEUE_JOB_TIMEOUT_MINUTES) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must have timeout-minutes >= ${MIN_QUEUE_JOB_TIMEOUT_MINUTES}.`);
  }
  if (!(queueJob.steps ?? []).some(isCopilotAction)) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must invoke the Copilot action.`);
  }
  assertIncrementalRangeFetch(relativeFile, manifest.file, queueJob);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (jobId !== manifest.jobId && (job.steps ?? []).some(isCopilotAction)) {
      throw new Error(`${relativeFile} unmanifested job ${jobId} invokes the Copilot action.`);
    }
  }
}

function assertIncrementalRangeFetch(relativeFile, manifestFile, job) {
  const contract = manifestFile === 'copilot_commit.yml'
      ? {
        name: 'Fetch push review range',
        condition: `github.event.after != '${ZERO_OBJECT_ID}'`,
      }
    : manifestFile === 'copilot_pull_request.yml'
      ? { name: 'Fetch incremental review range', condition: "github.event.action == 'synchronize'" }
      : undefined;
  if (!contract) return;
  const checkout = (job.steps ?? []).find(candidate => /^actions\/checkout@/.test(candidate?.uses ?? ''));
  const step = (job.steps ?? []).find(candidate => candidate?.name === contract.name);
  const fetchScript = typeof step?.run === 'string' ? step.run.trim() : '';
  if (!step
    || checkout?.with?.['persist-credentials'] !== false
    || checkout?.with?.['fetch-depth'] !== 0
    || step.if !== contract.condition
    || step.env?.BEFORE_SHA !== '${{ github.event.before }}'
    || step.env?.AFTER_SHA !== '${{ github.event.after }}'
    || (manifestFile === 'copilot_commit.yml' && step.env?.BRANCH_CREATED !== '${{ github.event.created }}')
    || !fetchScript.includes('git cat-file -e "${AFTER_SHA}^{commit}"')
    || !fetchScript.includes(`${manifestFile === 'copilot_commit.yml' ? 'if [ "$BRANCH_CREATED" != "true" ] && ' : 'if '}! git cat-file -e "\${BEFORE_SHA}^{commit}"; then`)) {
    throw new Error(`${relativeFile} must materialize and verify the exact GitHub before/after review range without persisted credentials.`);
  }
}

function assertSequentialMutationWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!QUEUE_WORKFLOW_MANIFEST.some(entry => relativeFile.endsWith(`/${entry.file}`))) return;
  assertNoConcurrency(relativeFile, workflow);
}

function validateWorkflow(file, workflow) {
  if (!workflow || typeof workflow !== 'object') throw new Error('workflow document is empty.');
  assertDirectEventTriggers(file, workflow);
  assertRunner(file, workflow);
  assertSequentialMutationWorkflow(file, workflow);
  assertAgentInputs(file, workflow);
  assertNoJobLevelSecrets(file, workflow);
  assertAgentWorkflowPermissions(file, workflow);
  assertLightweightBranchSyncWorkflow(file, workflow);
  assertQueueWorkflow(file, workflow);
  assertMajorActionReferences(file, workflow);
  assertCopilotActionInputs(file, workflow);
}

function main() {
  const files = workflowDirectories.flatMap(workflowFiles);
  const errors = [];
  for (const file of files) {
    try {
      validateWorkflow(file, yaml.load(readFileSync(file, 'utf8')));
    } catch (error) {
      errors.push(`${relativeWorkflow(file)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`workflow contract validation: PASS (${files.length} workflows, ${QUEUE_WAIT_MINUTES}m queue / ${MIN_QUEUE_JOB_TIMEOUT_MINUTES}m job budget)`);
  }
}

if (require.main === module) main();

module.exports = {
  QUEUE_WAIT_MINUTES,
  MIN_QUEUE_JOB_TIMEOUT_MINUTES,
  QUEUE_GATE_TIMEOUT_MINUTES,
  PREPARE_VERSION_TIMEOUT_MINUTES,
  PREPARE_COMPILED_TIMEOUT_MINUTES,
  TAG_TIMEOUT_MINUTES,
  FAILURE_REPORT_TIMEOUT_MINUTES,
  QUEUE_WORKFLOW_MANIFEST,
  MUTATION_WORKFLOW_MANIFEST,
  BOT_GATED_WORKFLOW_FILES,
  BOT_GATE_EXPRESSION,
  FORK_SAFE_BOT_GATE_EXPRESSION,
  assertMajorActionReferences,
  assertCopilotActionInputs,
  assertAgentInputs,
  assertNoJobLevelSecrets,
  assertAgentWorkflowPermissions,
  assertLightweightBranchSyncWorkflow,
  assertDirectEventTriggers,
  assertMutationWorkflow,
  assertNoConcurrency,
  assertQueueBudget,
  assertExactTimeout,
  assertTagPermissions,
  assertQueueGateJob,
  assertQueueWorkflow,
  assertIncrementalRangeFetch,
  assertRunner,
  assertSequentialMutationWorkflow,
  assertTransitiveQueueGateAncestry,
  validateWorkflow,
};
