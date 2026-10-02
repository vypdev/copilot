const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { relativeJestSuitePath } = require('./setup-acceptance-path.cjs');

const root = resolve(__dirname, '..');
const ledger = JSON.parse(readFileSync(join(root, 'specs/local-web-setup-assistant-acceptance.json'), 'utf8'));
const jestResultPath = process.argv[2];
const jestResults = jestResultPath ? JSON.parse(readFileSync(resolve(jestResultPath), 'utf8')) : undefined;
const executedTests = new Map();
for (const suite of jestResults?.testResults ?? []) {
  const file = relativeJestSuitePath(root, suite.name);
  for (const test of suite.assertionResults ?? []) executedTests.set(`${file}::${test.fullName}`, test.status);
}
const counts = { P: 48, S: 54, A: 40, C: 37, U: 101, I: 42, X: 28 };
const expected = Object.entries(counts).flatMap(([prefix, count]) => Array.from({ length: count }, (_, index) =>
  `${prefix}${String(index + 1).padStart(3, '0')}`));
const actual = ledger.cases.map(item => item.id);
const errors = [];
if (actual.length !== 350) errors.push(`expected 350 cases, found ${actual.length}`);
if (new Set(actual).size !== actual.length) errors.push('case IDs are not unique');
for (const id of expected) if (!actual.includes(id)) errors.push(`missing ${id}`);
for (const id of actual) if (!expected.includes(id)) errors.push(`unexpected ${id}`);
const evidenceKeys = new Set();
for (const item of ledger.cases) {
  if (typeof item.assertion !== 'string' || item.assertion.length < 20) errors.push(`${item.id}: assertion is too vague`);
  if (!['pass', 'open'].includes(item.status)) errors.push(`${item.id}: invalid status`);
  if (item.evidence?.kind === 'jest') {
    if (typeof item.evidence.file !== 'string' || !existsSync(join(root, item.evidence.file))) errors.push(`${item.id}: missing test file`);
    if (typeof item.evidence.test !== 'string' || item.evidence.test.length < 15) errors.push(`${item.id}: missing test name`);
    const key = `${item.evidence.file}::${item.evidence.test}`;
    if (evidenceKeys.has(key)) errors.push(`${item.id}: duplicate test evidence`);
    evidenceKeys.add(key);
    if (item.status === 'pass' && jestResults && executedTests.get(key) !== 'passed') {
      errors.push(`${item.id}: named Jest assertion did not pass in ${jestResultPath}`);
    }
    if (item.status === 'open' && (typeof item.evidence.reason !== 'string' || item.evidence.reason.length < 20)) {
      errors.push(`${item.id}: open Jest evidence needs a concrete blocking reason`);
    }
  } else if (item.evidence?.kind === 'command') {
    if (typeof item.evidence.command !== 'string' || !/^pnpm run (?:build|validate:npm-package|smoke:npm-package)$/u.test(item.evidence.command)) {
      errors.push(`${item.id}: invalid package validation command`);
    }
    if (item.status === 'pass' && (!item.evidence.date || !item.evidence.observation || item.evidence.observation.startsWith('Awaiting'))) {
      errors.push(`${item.id}: command pass lacks dated observed evidence`);
    }
  } else if (item.evidence?.kind === 'human') {
    if (item.status === 'pass' && (!item.evidence.reviewer || !item.evidence.date || !item.evidence.environment || !item.evidence.observation)) {
      errors.push(`${item.id}: human pass lacks recorded reviewer, date, environment or observation`);
    }
    if (typeof item.evidence.checklist !== 'string' || item.evidence.checklist.length < 20) errors.push(`${item.id}: human checklist is missing`);
  } else errors.push(`${item.id}: invalid evidence kind`);
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
const passed = ledger.cases.filter(item => item.status === 'pass').length;
console.log(`Setup acceptance ledger: ${passed}/350 passed; ${350 - passed} explicitly open.`);
