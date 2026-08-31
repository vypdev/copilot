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
const MIN_QUEUE_JOB_TIMEOUT_MINUTES = 120;
const QUEUE_WORKFLOW_MANIFEST = Object.freeze([
  ['copilot_commit.yml', 'Copilot - Commit', 'copilot-commits'],
  ['copilot_issue.yml', 'Copilot - Issue', 'copilot-issues'],
  ['copilot_issue_comment.yml', 'Copilot - Issue Comment', 'copilot-issues'],
  ['copilot_pull_request.yml', 'Copilot - Pull Request', 'copilot-pull-requests'],
  ['copilot_pull_request_comment.yml', 'Copilot - Pull Request Comment', 'copilot-pull-requests'],
  ['hotfix_workflow.yml', 'Task - Hotfix', 'tag'],
  ['release_workflow.yml', 'Task - Release', 'tag'],
].map(([file, workflowName, jobId]) => ({ file, workflowName, jobId })));
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

function runnerLabels(value) {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function assertRunner(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const expected = relativeFile.startsWith('setup/workflows/')
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
      if (!isCopilotAction(step)) continue;
      const missing = requiredAgentInputs.filter(input => !(input in (step.with ?? {})));
      if (missing.length > 0) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} is missing agent inputs: ${missing.join(', ')}.`);
      }
    }
  }
}

function assertQueueWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const manifest = QUEUE_WORKFLOW_MANIFEST.find(entry => relativeFile.endsWith(`/${entry.file}`));
  if (!manifest) return;
  if (workflow.name !== manifest.workflowName) {
    throw new Error(`${relativeFile} must have workflow name ${JSON.stringify(manifest.workflowName)}.`);
  }
  const queueJob = workflow.jobs?.[manifest.jobId];
  if (!queueJob) throw new Error(`${relativeFile} must define queue job ${manifest.jobId}.`);
  if (typeof queueJob['timeout-minutes'] !== 'number'
    || queueJob['timeout-minutes'] < MIN_QUEUE_JOB_TIMEOUT_MINUTES) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must have timeout-minutes >= ${MIN_QUEUE_JOB_TIMEOUT_MINUTES}.`);
  }
  if (workflow.concurrency !== undefined || queueJob.concurrency !== undefined) {
    throw new Error(`${relativeFile} must not define workflow or queue-job concurrency.`);
  }
  if (!(queueJob.steps ?? []).some(isCopilotAction)) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must invoke the Copilot action.`);
  }
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (jobId !== manifest.jobId && (job.steps ?? []).some(isCopilotAction)) {
      throw new Error(`${relativeFile} unmanifested job ${jobId} invokes the Copilot action.`);
    }
  }
}

function assertSequentialMutationWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!QUEUE_WORKFLOW_MANIFEST.some(entry => relativeFile.endsWith(`/${entry.file}`))) return;
  if (workflow.concurrency !== undefined) {
    throw new Error(`${relativeFile} must not define GitHub concurrency.`);
  }
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
  QUEUE_WORKFLOW_MANIFEST,
  assertAgentInputs,
  assertQueueWorkflow,
  assertRunner,
  assertSequentialMutationWorkflow,
  validateWorkflow,
};
