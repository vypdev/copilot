#!/usr/bin/env node

const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const repositoryRoot = path.resolve(__dirname, '..');
const workflowDirectories = [
  path.join(repositoryRoot, '.github', 'workflows'),
  path.join(repositoryRoot, 'setup', 'workflows'),
];
const requiredAgentInputs = [
  'agent-provider',
  'agent-model-provider',
  'agent-model',
  'agent-effort',
  'agent-command',
  'findings-provider',
  'findings-model-provider',
  'findings-model',
  'findings-effort',
  'findings-command',
  'fixer-provider',
  'fixer-model-provider',
  'fixer-model',
  'fixer-effort',
  'fixer-command',
];

function workflowFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join(directory, name));
}

function isCopilotAction(step) {
  return typeof step?.uses === 'string'
    && (step.uses === './' || /(?:^|\/)copilot@/.test(step.uses));
}

function runnerLabels(value) {
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function assertRunner(file, workflow) {
  const relativeFile = path.relative(repositoryRoot, file);
  const expected = relativeFile.startsWith('setup/workflows/')
    ? ['ubuntu-latest']
    : relativeFile === '.github/workflows/repowise.yml'
      ? ['self-hosted', 'coolify']
      : ['self-hosted', 'codex'];

  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const labels = runnerLabels(job['runs-on']);
    if (expected.length === 1 ? labels[0] !== expected[0] : expected.some((label) => !labels.includes(label))) {
      throw new Error(`${relativeFile} job ${jobId} must use runs-on ${expected.join(', ')}.`);
    }
  }
}

function assertSequentialMutationWorkflow(file, workflow) {
  const relativeFile = path.relative(repositoryRoot, file);
  if (!/\.github\/workflows\/(?:copilot_|hotfix_workflow|release_workflow)/.test(relativeFile)) return;
  if (workflow.concurrency !== undefined) {
    throw new Error(`${relativeFile} must not define GitHub concurrency: it can discard intermediate mutation runs.`);
  }
}

function assertAgentInputs(file, workflow) {
  const relativeFile = path.relative(repositoryRoot, file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!isCopilotAction(step)) continue;
      const missing = requiredAgentInputs.filter((input) => !(input in (step.with ?? {})));
      if (missing.length > 0) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} is missing agent inputs: ${missing.join(', ')}.`);
      }
    }
  }
}

const files = workflowDirectories.flatMap(workflowFiles);
const errors = [];
for (const file of files) {
  try {
    const workflow = yaml.load(readFileSync(file, 'utf8'));
    if (!workflow || typeof workflow !== 'object') throw new Error('workflow document is empty.');
    assertRunner(file, workflow);
    assertSequentialMutationWorkflow(file, workflow);
    assertAgentInputs(file, workflow);
  } catch (error) {
    errors.push(`${path.relative(repositoryRoot, file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`workflow contract validation: PASS (${files.length} workflows)`);
}

module.exports = { assertAgentInputs, assertRunner, assertSequentialMutationWorkflow };
