#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const summary = JSON.parse(readFileSync(path.join(repositoryRoot, 'coverage', 'coverage-summary.json'), 'utf8'));
const normalize = (value) => value.replaceAll('\\', '/');
const entryByPath = new Map(
  Object.entries(summary).map(([file, coverage]) => [normalize(path.relative(repositoryRoot, file)), coverage]),
);

const exhaustivePolicies = [
  'src/domain/agent_execution_plan.ts',
  'src/application/policies/agent_executable_policy.ts',
  'src/application/policies/agent_execution/provider_execution_policy.ts',
  'src/application/policies/agent_execution/agent_execution_policy_dispatcher.ts',
  'src/application/policies/agent_execution/codex_execution_plan_policy.ts',
  'src/application/policies/agent_execution/opencode_execution_plan_policy.ts',
  'src/application/policies/agent_execution/cursor_execution_plan_policy.ts',
  'src/infrastructure/agents/agent_runtime_manifest.ts',
];
const changedRuntimeModules = [
  'src/data/repository/agent_cli_execution.ts',
  'src/data/repository/agent_cli_provisioner.ts',
  'src/infrastructure/agents/agent_execution_planner.ts',
];
const requiredFiles = [...exhaustivePolicies, ...changedRuntimeModules];
for (const file of requiredFiles) {
  if (!entryByPath.has(file)) throw new Error(`Missing agent execution coverage entry for ${file}.`);
}

const failures = [];
for (const file of exhaustivePolicies) {
  const coverage = entryByPath.get(file);
  for (const metric of ['lines', 'statements', 'branches', 'functions']) {
    if (coverage[metric].pct !== 100) failures.push(`${file} ${metric} ${coverage[metric].pct}% < 100%`);
  }
}

const thresholds = { lines: 95, statements: 95, branches: 90, functions: 90 };
for (const file of changedRuntimeModules) {
  const coverage = entryByPath.get(file);
  for (const [metric, minimum] of Object.entries(thresholds)) {
    if (coverage[metric].pct < minimum) failures.push(`${file} ${metric} ${coverage[metric].pct}% < ${minimum}%`);
  }
}

if (failures.length > 0) throw new Error(`Agent execution coverage failed: ${failures.join(', ')}`);
console.log('agent execution coverage: PASS (exhaustive policies 100%; each runtime module 95% lines/statements, 90% branches/functions)');
