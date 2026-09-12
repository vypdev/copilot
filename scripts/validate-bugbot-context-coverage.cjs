#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const summary = JSON.parse(readFileSync(path.join(repositoryRoot, 'coverage', 'coverage-summary.json'), 'utf8'));
const normalize = (value) => value.replaceAll('\\', '/');
const entryByPath = new Map(
  Object.entries(summary).map(([file, coverage]) => [normalize(path.relative(repositoryRoot, file)), coverage]),
);

const purePolicies = [
  'src/domain/bugbot/context.ts',
  'src/application/policies/bounded_concurrency_policy.ts',
  'src/application/policies/bugbot_resolution_eligibility_policy.ts',
  'src/application/usecases/steps/commit/bugbot/bugbot_previous_findings_context.ts',
  'src/application/usecases/steps/commit/bugbot/bugbot_review_context.ts',
];
const changedPath = [
  ...purePolicies,
  'src/application/usecases/steps/commit/bugbot/bugbot_context_request.ts',
  'src/application/usecases/steps/commit/bugbot/load_bugbot_context_use_case.ts',
  'src/application/usecases/steps/commit/bugbot/bugbot_review_telemetry.ts',
  'src/data/repository/issue/bugbot_issue_comment_query_repository.ts',
  'src/infrastructure/composition/bugbot_context_port_factory.ts',
];

for (const file of changedPath) {
  if (!entryByPath.has(file)) throw new Error(`Missing Bugbot context coverage entry for ${file}.`);
}

const failures = [];
for (const file of purePolicies) {
  const coverage = entryByPath.get(file);
  for (const metric of ['lines', 'statements', 'branches', 'functions']) {
    if (coverage[metric].pct !== 100) failures.push(`${file} ${metric} ${coverage[metric].pct}% < 100%`);
  }
}

const thresholds = { lines: 95, statements: 95, branches: 90, functions: 90 };
const changedEntries = changedPath.map((file) => entryByPath.get(file));
for (const [metric, minimum] of Object.entries(thresholds)) {
  const total = changedEntries.reduce(
    (result, coverage) => ({
      covered: result.covered + coverage[metric].covered,
      total: result.total + coverage[metric].total,
    }),
    { covered: 0, total: 0 },
  );
  const percentage = total.total === 0 ? 100 : (total.covered / total.total) * 100;
  if (percentage < minimum) failures.push(`changed path ${metric} ${percentage.toFixed(2)}% < ${minimum}%`);
}

if (failures.length > 0) throw new Error(`Bugbot context coverage failed: ${failures.join(', ')}`);
console.log('bugbot context coverage: PASS (pure policies 100%; changed path 95% lines/statements, 90% branches/functions)');
