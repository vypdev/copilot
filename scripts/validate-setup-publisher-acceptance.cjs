'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { relativeJestSuitePath } = require('./setup-acceptance-path.cjs');

const root = resolve(__dirname, '..');
const ledger = JSON.parse(readFileSync(join(root, 'specs/setup-publisher-installation-acceptance.json'), 'utf8'));
const specification = readFileSync(join(root, 'specs/setup-bugbot-publisher-manifest-route.md'), 'utf8');
const published = new Map(specification.split('\n').filter(line => line.startsWith('| publisher977-C')).map(line => {
  const [id, area, requirements, assertion] = line.slice(1, -1).split('|').map(cell => cell.trim());
  return [id, { area, requirements: requirements.split(', '), assertion }];
}));
const reportPath = process.argv[2];
const reportSupplied = reportPath !== undefined;
const report = reportSupplied ? JSON.parse(readFileSync(resolve(reportPath), 'utf8')) : undefined;
if (reportSupplied && (report === null || typeof report !== 'object' || Array.isArray(report)
  || !Array.isArray(report.testResults))) {
  console.error('Publisher acceptance: supplied report must contain a testResults array.');
  process.exit(1);
}
const executed = new Map();
for (const suite of report?.testResults ?? []) {
  const file = relativeJestSuitePath(root, suite.name);
  for (const assertion of suite.assertionResults ?? []) {
    const key = `${file}::${assertion.fullName}`;
    const statuses = executed.get(key) ?? []; statuses.push(assertion.status); executed.set(key, statuses);
  }
}
const errors = [], evidenceOwners = new Map();
const expected = Array.from({ length: 64 }, (_, index) => `publisher977-C${String(index + 1).padStart(2, '0')}`);
if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.cases) || ledger.cases.length !== 64) errors.push('Expected closed v1 ledger with 64 cases.');
const cases = Array.isArray(ledger.cases) ? ledger.cases : [];
if (JSON.stringify(cases.map(item => item.id)) !== JSON.stringify(expected)) errors.push('Case IDs/order must retain C01–C64 exactly once.');
let jestCases = 0;
for (const item of cases) {
  const contract = published.get(item.id);
  if (!contract || item.area !== contract.area || item.assertion !== contract.assertion
    || JSON.stringify(item.requirements) !== JSON.stringify(contract.requirements)) errors.push(`${item.id}: differs from the selected SDD contract.`);
  const packaged = ['publisher977-C55', 'publisher977-C56', 'publisher977-C57', 'publisher977-C58'].includes(item.id);
  if (item.gate !== (packaged ? 'npm-package-smoke' : 'jest')) errors.push(`${item.id}: incorrect execution boundary.`);
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) { errors.push(`${item.id}: no executable evidence.`); continue; }
  if (!packaged) jestCases += 1;
  for (const evidence of item.evidence) {
    if (typeof evidence.file !== 'string' || evidence.file.includes('..') || evidence.file.startsWith('/')
      || !existsSync(join(root, evidence.file)) || typeof evidence.test !== 'string' || evidence.test.length < 15) {
      errors.push(`${item.id}: missing or unsafe evidence.`); continue;
    }
    const key = `${evidence.file}::${evidence.test}`;
    if (evidenceOwners.has(key)) errors.push(`${item.id}: evidence already counted by ${evidenceOwners.get(key)}.`);
    evidenceOwners.set(key, item.id);
    if (packaged && (evidence.file !== 'scripts/smoke-packaged-setup-publisher.cjs' || evidence.test !== item.id)) errors.push(`${item.id}: wrong package smoke control.`);
    if (!packaged && (!evidence.file.startsWith('src/') || !evidence.file.endsWith('.test.ts'))) errors.push(`${item.id}: wrong Jest boundary.`);
    if (!packaged && reportSupplied && (!executed.has(key) || executed.get(key).some(status => status !== 'passed'))) {
      errors.push(`${item.id}: named assertion absent, failed or skipped in the supplied run: ${key}`);
    }
  }
}
if (jestCases !== 60) errors.push('Exactly 60 cases must use Jest; four require the extracted package.');
if (errors.length) { errors.forEach(error => console.error(error)); process.exitCode = 1; }
else if (reportSupplied) console.log('Publisher acceptance: 60/60 mapped Jest cases passed. C55–C58 require the separate extracted npm-package smoke gate.');
else console.log('Publisher acceptance: 64 cases registered; execution is not established by ledger validation.');
