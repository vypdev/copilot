#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH = 'src/architecture/github_communication_test_budget.json';
const EXPECTED_BUDGETS = Object.freeze({
  'semantic-github-publication': Object.freeze({
    requiredCases: 128,
    spec: 'specs/semantic-github-publication-and-notification.md',
  }),
  'repository-locale-localization': Object.freeze({
    requiredCases: 136,
    spec: 'specs/repository-locale-and-localization.md',
  }),
});
const TEST_DECLARATION = /^\s*(?:it|test)(?:\.each)?\s*\(/gmu;
const ADDED_TEST_DECLARATION = /^\+\s*(?:it|test)(?:\.each)?\s*\(/gmu;

function readLedger(root = DEFAULT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, LEDGER_PATH), 'utf8'));
}

function validateCommunicationTestBudget(root, ledger) {
  const errors = [];
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return ['communication test-budget ledger must be a JSON object.'];
  }
  if (ledger.version !== 1) errors.push('communication test-budget ledger version must be 1.');
  if (ledger.baseline !== '0bb83b75^') errors.push('communication test-budget baseline must remain 0bb83b75^.');
  if (!gitObjectExists(root, `${ledger.baseline}^{commit}`)) {
    errors.push(`communication test-budget baseline is unavailable: ${String(ledger.baseline)}.`);
  }
  if (!Array.isArray(ledger.budgets)) return [...errors, 'communication test-budget ledger must declare budgets.'];
  if (ledger.budgets.length !== Object.keys(EXPECTED_BUDGETS).length) {
    errors.push(`communication test-budget ledger must contain exactly ${Object.keys(EXPECTED_BUDGETS).length} budgets.`);
  }

  const seenBudgets = new Set();
  const seenFiles = new Set();
  for (const budget of ledger.budgets) {
    const expected = EXPECTED_BUDGETS[budget?.id];
    if (!expected) {
      errors.push(`unknown communication test budget: ${String(budget?.id)}.`);
      continue;
    }
    if (seenBudgets.has(budget.id)) errors.push(`duplicate communication test budget: ${budget.id}.`);
    seenBudgets.add(budget.id);
    if (budget.spec !== expected.spec) errors.push(`${budget.id} must reference ${expected.spec}.`);
    if (budget.requiredCases !== expected.requiredCases) {
      errors.push(`${budget.id} must require exactly ${expected.requiredCases} cases.`);
    }
    const specPath = path.join(root, expected.spec);
    if (!fs.existsSync(specPath)
      || !fs.readFileSync(specPath, 'utf8').includes(`at least **${expected.requiredCases} distinct`)) {
      errors.push(`${budget.id} specification does not declare its ${expected.requiredCases}-case budget.`);
    }
    if (!Array.isArray(budget.files) || budget.files.length === 0) {
      errors.push(`${budget.id} must allocate cases to at least one test file.`);
      continue;
    }
    let allocatedCases = 0;
    for (const entry of budget.files) {
      if (!isTestPath(entry?.path)) {
        errors.push(`${budget.id} has an invalid test path: ${String(entry?.path)}.`);
        continue;
      }
      if (seenFiles.has(entry.path)) {
        errors.push(`${entry.path} is allocated to more than one communication budget.`);
      }
      seenFiles.add(entry.path);
      if (!Number.isSafeInteger(entry.qualifyingCases) || entry.qualifyingCases <= 0) {
        errors.push(`${budget.id} has an invalid qualifying-case count for ${entry.path}.`);
        continue;
      }
      allocatedCases += entry.qualifyingCases;
      const testPath = path.join(root, entry.path);
      if (!fs.existsSync(testPath) || !fs.statSync(testPath).isFile()) {
        errors.push(`${budget.id} test file does not exist: ${entry.path}.`);
        continue;
      }
      const qualifyingDeclarations = countQualifyingDeclarations(root, ledger.baseline, entry.path);
      if (qualifyingDeclarations < entry.qualifyingCases) {
        errors.push(`${entry.path} has ${qualifyingDeclarations} qualifying test declarations since ${ledger.baseline}, below its allocation of ${entry.qualifyingCases}.`);
      }
    }
    if (budget.allocatedCases !== allocatedCases) {
      errors.push(`${budget.id} allocatedCases is ${String(budget.allocatedCases)} but its file allocation totals ${allocatedCases}.`);
    }
    if (allocatedCases < expected.requiredCases) {
      errors.push(`${budget.id} allocates ${allocatedCases} cases, below its required ${expected.requiredCases}.`);
    }
  }
  for (const budgetId of Object.keys(EXPECTED_BUDGETS)) {
    if (!seenBudgets.has(budgetId)) errors.push(`missing communication test budget: ${budgetId}.`);
  }
  return errors;
}

function countQualifyingDeclarations(root, baseline, testPath) {
  if (!gitObjectExists(root, `${baseline}:${testPath}`)) {
    return (fs.readFileSync(path.join(root, testPath), 'utf8').match(TEST_DECLARATION) ?? []).length;
  }
  const diff = execFileSync(
    'git',
    ['diff', baseline, '--unified=0', '--', testPath],
    { cwd: root, encoding: 'utf8' },
  );
  return (diff.match(ADDED_TEST_DECLARATION) ?? []).length;
}

function gitObjectExists(root, object) {
  try {
    execFileSync('git', ['cat-file', '-e', object], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isTestPath(value) {
  return typeof value === 'string'
    && /^src\/.+(?:__tests__\/.+\.test\.ts|\.test\.ts)$/u.test(value)
    && value === path.posix.normalize(value)
    && !value.split('/').includes('..');
}

function main() {
  const ledger = readLedger(DEFAULT_ROOT);
  const errors = validateCommunicationTestBudget(DEFAULT_ROOT, ledger);
  if (errors.length > 0) {
    console.error(errors.map(error => `- ${error}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  const summary = ledger.budgets
    .map(budget => `${budget.id}=${budget.allocatedCases}/${budget.requiredCases}`)
    .join(', ');
  console.log(`GitHub communication test budgets: PASS (${summary}; no file is double-counted)`);
}

if (require.main === module) main();

module.exports = {
  LEDGER_PATH,
  countQualifyingDeclarations,
  readLedger,
  validateCommunicationTestBudget,
};
