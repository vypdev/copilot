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
  'src/application/usecases/comment_automation_action_workflow.ts',
  'src/application/usecases/comment_automation_command_workflow.ts',
  'src/application/usecases/comment_automation_completion_workflow.ts',
  'src/application/usecases/comment_automation_context.ts',
  'src/application/usecases/comment_automation_decision_workflow.ts',
  'src/application/usecases/comment_automation_natural_language_workflow.ts',
  'src/application/usecases/comment_automation_use_case.ts',
  'src/application/usecases/steps/common/check_permissions_workflow.ts',
  'src/application/usecases/steps/common/comment_language_translation_workflow.ts',
  'src/application/usecases/steps/common/project_content_link_workflow.ts',
  'src/application/usecases/steps/common/publish_resume_workflow.ts',
  'src/application/usecases/steps/common/store_configuration_use_case.ts',
  'src/application/usecases/steps/common/think_workflow.ts',
  'src/application/usecases/steps/common/update_title_workflow.ts',
  'src/infrastructure/composition/shared_capability_port_binding.ts',
];

for (const file of changedPath) {
  if (!entryByPath.has(file)) throw new Error(`Missing shared capability context coverage entry for ${file}.`);
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
  throw new Error(`Shared capability context coverage failed: ${failures.join(', ')}`);
}
console.log('shared capability context coverage: PASS (changed path 95% lines/statements, 90% branches/functions)');
