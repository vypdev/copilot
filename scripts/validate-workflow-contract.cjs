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
const MIN_QUEUE_JOB_TIMEOUT_MINUTES = QUEUE_GATE_TIMEOUT_MINUTES;

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
const ZERO_OBJECT_ID = '0000000000000000000000000000000000000000';

const requiredAgentInputs = [
  'agent-provider', 'agent-model-provider', 'agent-model', 'agent-effort', 'agent-command',
  'findings-provider', 'findings-model-provider', 'findings-model', 'findings-effort', 'findings-command',
  'fixer-provider', 'fixer-model-provider', 'fixer-model', 'fixer-effort', 'fixer-command',
];

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

function assertTransitiveQueueGateAncestry(file, workflow, gateJobId) {
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
    assertNoUnsafeCondition(relativeFile, jobId, job);
    if (jobId !== gateJobId && !reachesGate(jobId)) {
      throw new Error(`${relativeFile} job ${jobId} is not a transitive descendant of ${gateJobId}.`);
    }
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
    ? ['queue-gate', 'prepare-version-files', 'tag']
    : ['queue-gate', 'prepare-version-files', 'prepare-compiled-files', 'tag'];
  const actualJobs = Object.keys(workflow.jobs ?? {});
  if (actualJobs.length !== expectedJobs.length || expectedJobs.some(jobId => !actualJobs.includes(jobId))) {
    throw new Error(`${relativeFile} must define the exact gate-first job graph.`);
  }
  assertNoConcurrency(relativeFile, workflow);
  assertQueueGateJob(file, workflow, setup ? 'vypdev/copilot@v3' : './');
  assertExactTimeout(relativeFile, 'queue-gate', workflow.jobs['queue-gate'], QUEUE_GATE_TIMEOUT_MINUTES);
  assertExactTimeout(relativeFile, 'prepare-version-files', workflow.jobs['prepare-version-files'], PREPARE_VERSION_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, 'queue-gate', workflow.jobs['queue-gate'], []);
  assertExactNeeds(relativeFile, 'prepare-version-files', workflow.jobs['prepare-version-files'], ['queue-gate']);
  if (setup) {
    assertExactTimeout(relativeFile, 'tag', workflow.jobs.tag, TAG_TIMEOUT_MINUTES);
    assertTagPermissions(relativeFile, workflow.jobs.tag);
    assertExactNeeds(relativeFile, 'tag', workflow.jobs.tag, ['prepare-version-files']);
  } else {
    assertExactTimeout(relativeFile, 'prepare-compiled-files', workflow.jobs['prepare-compiled-files'], PREPARE_COMPILED_TIMEOUT_MINUTES);
    assertExactTimeout(relativeFile, 'tag', workflow.jobs.tag, TAG_TIMEOUT_MINUTES);
    assertTagPermissions(relativeFile, workflow.jobs.tag);
    assertExactNeeds(relativeFile, 'prepare-compiled-files', workflow.jobs['prepare-compiled-files'], ['prepare-version-files']);
    assertExactNeeds(relativeFile, 'tag', workflow.jobs.tag, ['prepare-compiled-files']);
  }
  assertTransitiveQueueGateAncestry(file, workflow, 'queue-gate');
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
  if (BOT_GATED_WORKFLOW_FILES.has(manifest.file) && queueJob.if !== BOT_GATE_EXPRESSION) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must use the generic COPILOT_BOT_LOGIN actor gate.`);
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
        condition: `github.event.before != '${ZERO_OBJECT_ID}' && github.event.after != '${ZERO_OBJECT_ID}'`,
      }
    : manifestFile === 'copilot_pull_request.yml'
      ? { name: 'Fetch incremental review range', condition: "github.event.action == 'synchronize'" }
      : undefined;
  if (!contract) return;
  const step = (job.steps ?? []).find(candidate => candidate?.name === contract.name);
  if (!step
    || step.if !== contract.condition
    || step.env?.BEFORE_SHA !== '${{ github.event.before }}'
    || step.env?.AFTER_SHA !== '${{ github.event.after }}'
    || step.run !== 'git fetch --no-tags --depth=1 origin "$BEFORE_SHA" "$AFTER_SHA"') {
    throw new Error(`${relativeFile} must fetch the exact GitHub before/after review range before invoking Copilot.`);
  }
}

function assertSequentialMutationWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!QUEUE_WORKFLOW_MANIFEST.some(entry => relativeFile.endsWith(`/${entry.file}`))) return;
  assertNoConcurrency(relativeFile, workflow);
}

function validateWorkflow(file, workflow) {
  if (!workflow || typeof workflow !== 'object') throw new Error('workflow document is empty.');
  assertRunner(file, workflow);
  assertSequentialMutationWorkflow(file, workflow);
  assertAgentInputs(file, workflow);
  assertQueueWorkflow(file, workflow);
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
  QUEUE_WORKFLOW_MANIFEST,
  MUTATION_WORKFLOW_MANIFEST,
  BOT_GATED_WORKFLOW_FILES,
  BOT_GATE_EXPRESSION,
  assertAgentInputs,
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
