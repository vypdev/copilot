#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const summaryPath = path.join(repositoryRoot, 'coverage', 'coverage-summary.json');
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const handlerSegment = 'src/application/usecases/actions/deployment_handlers/';
const entries = Object.entries(summary)
  .filter(([file]) => file.replaceAll('\\', '/').includes(handlerSegment));

if (entries.length !== 6) {
  throw new Error(`Expected coverage for exactly 6 deployment handler files, received ${entries.length}.`);
}

const thresholds = Object.freeze({
  lines: 95,
  statements: 95,
  branches: 90,
  functions: 90,
});

const failures = [];
for (const [metric, minimum] of Object.entries(thresholds)) {
  const totals = entries.reduce(
    (result, [, coverage]) => ({
      covered: result.covered + coverage[metric].covered,
      total: result.total + coverage[metric].total,
    }),
    { covered: 0, total: 0 },
  );
  const percentage = totals.total === 0 ? 100 : (totals.covered / totals.total) * 100;
  if (percentage < minimum) failures.push(`${metric} ${percentage.toFixed(2)}% < ${minimum}%`);
}

if (failures.length > 0) {
  throw new Error(`Deployment handler coverage failed: ${failures.join(', ')}`);
}

console.log('deployment handler coverage: PASS (95% lines/statements, 90% branches/functions)');
