#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const summary = JSON.parse(readFileSync(path.join(repositoryRoot, 'coverage', 'coverage-summary.json'), 'utf8'));
const normalize = (value) => value.replaceAll('\\', '/');
const entryByPath = new Map(
  Object.entries(summary).map(([file, coverage]) => [normalize(path.relative(repositoryRoot, file)), coverage]),
);

const setupContextPath = [
  'src/actions/setup_execution_boundary.ts',
  'src/application/usecases/execution/execution_issue_number_policy.ts',
  'src/application/usecases/execution/resolve_execution_issue_number.ts',
  'src/application/usecases/execution/setup_execution_use_case.ts',
  'src/application/usecases/execution/setup_execution_workflow.ts',
  'src/application/usecases/execution/execution_branch_version_resolver.ts',
  'src/application/usecases/steps/common/get_release_version_use_case.ts',
  'src/application/usecases/steps/common/get_release_type_use_case.ts',
  'src/application/usecases/steps/common/get_hotfix_version_use_case.ts',
  'src/infrastructure/composition/execution_setup_composition_root.ts',
];

for (const file of setupContextPath) {
  if (!entryByPath.has(file)) throw new Error(`Missing setup execution coverage entry for ${file}.`);
}

const thresholds = { lines: 95, statements: 95, branches: 90, functions: 90 };
const failures = [];
for (const file of setupContextPath) {
  const coverage = entryByPath.get(file);
  for (const [metric, minimum] of Object.entries(thresholds)) {
    if (coverage[metric].pct < minimum) failures.push(`${file} ${metric} ${coverage[metric].pct}% < ${minimum}%`);
  }
}

if (failures.length > 0) throw new Error(`Setup execution coverage failed: ${failures.join(', ')}`);
console.log('setup execution coverage: PASS (each context-path module 95% lines/statements, 90% branches/functions)');
