#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const summary = JSON.parse(readFileSync(path.join(repositoryRoot, 'coverage', 'coverage-summary.json'), 'utf8'));
const normalize = (value) => value.replaceAll('\\', '/');
const entryByPath = new Map(
  Object.entries(summary).map(([file, coverage]) => [normalize(path.relative(repositoryRoot, file)), coverage]),
);

const changedPath = [
  'src/application/usecases/issue_workflow_context.ts',
  'src/application/usecases/pull_request_workflow_context.ts',
  'src/application/usecases/steps/issue/prepare_branches_use_case.ts',
  'src/application/usecases/steps/issue/prepare_hotfix_branch.ts',
  'src/application/usecases/steps/issue/prepare_managed_branch.ts',
  'src/application/usecases/steps/issue/prepare_release_branch.ts',
  'src/application/usecases/steps/pull_request/link_pull_request_issue_workflow.ts',
  'src/application/usecases/steps/pull_request/update_pull_request_description_workflow.ts',
  'src/infrastructure/composition/lifecycle_capability_port_binding.ts',
];

for (const file of changedPath) {
  if (!entryByPath.has(file)) throw new Error(`Missing issue/PR context coverage entry for ${file}.`);
}

const thresholds = { lines: 95, statements: 95, branches: 90, functions: 90 };
const changedEntries = changedPath.map((file) => entryByPath.get(file));
const failures = [];
for (const [metric, minimum] of Object.entries(thresholds)) {
  const total = changedEntries.reduce(
    (result, coverage) => ({
      covered: result.covered + coverage[metric].covered,
      total: result.total + coverage[metric].total,
    }),
    { covered: 0, total: 0 },
  );
  const percentage = total.total === 0 ? 100 : (total.covered / total.total) * 100;
  if (percentage < minimum) failures.push(`${metric} ${percentage.toFixed(2)}% < ${minimum}%`);
}

if (failures.length > 0) {
  throw new Error(`Issue/PR context coverage failed: ${failures.join(', ')}`);
}
console.log('issue/PR context coverage: PASS (changed path 95% lines/statements, 90% branches/functions)');
