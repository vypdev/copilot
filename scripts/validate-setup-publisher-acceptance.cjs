'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { relativeJestSuitePath } = require('./setup-acceptance-path.cjs');

const root = resolve(__dirname, '..');
const ledger = JSON.parse(readFileSync(join(root, 'specs/setup-publisher-installation-acceptance.json'), 'utf8'));
const publicationErrors = [], published = new Map();
for (const path of ['specs/setup-bugbot-publisher-manifest-route.md', 'specs/organization-configuration-reuse-and-batch-setup.md']) {
  for (const line of readFileSync(join(root, path), 'utf8').split('\n').filter(line => line.startsWith('| publisher977-C'))) {
    const [id, area, requirements, assertion] = line.slice(1, -1).split('|').map(cell => cell.trim());
    if (published.has(id)) publicationErrors.push(`${id}: duplicate published contract.`);
    published.set(id, { area, requirements: requirements.split(', '), assertion });
  }
}
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
const errors = [...publicationErrors], evidenceOwners = new Map();
const baselineCount = 111;
if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.cases) || ledger.cases.length < baselineCount) errors.push(`Expected v1 ledger with at least ${baselineCount} cases.`);
for (let index = 1; index <= baselineCount; index += 1) {
  const id = `publisher977-C${String(index).padStart(2, '0')}`;
  if (!published.has(id)) errors.push(`${id}: missing required published contract.`);
}
const cases = Array.isArray(ledger.cases) ? ledger.cases : [];
const expected = Array.from({ length: cases.length }, (_, index) => `publisher977-C${String(index + 1).padStart(2, '0')}`);
if (JSON.stringify(cases.map(item => item.id)) !== JSON.stringify(expected)) errors.push('Case IDs/order must retain C01–C64 exactly once and append contiguous additional IDs.');
if ([...published.keys()].some(id => !cases.some(item => item.id === id))) errors.push('Every selected SDD and owning appendix case must remain registered.');
const areas = new Set([...published.values()].map(item => item.area));
const requirements = new Set([...published.values()].flatMap(item => item.requirements));
let jestCases = 0;
for (const item of cases) {
  const contract = published.get(item.id);
  if (contract ? item.area !== contract.area || item.assertion !== contract.assertion
    || JSON.stringify(item.requirements) !== JSON.stringify(contract.requirements)
    : !areas.has(item.area) || typeof item.assertion !== 'string' || item.assertion.trim().length < 15
      || !Array.isArray(item.requirements) || item.requirements.length === 0
      || new Set(item.requirements).size !== item.requirements.length
      || item.requirements.some(requirement => !requirements.has(requirement))) errors.push(`${item.id}: differs from the selected SDD contract.`);
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
if (jestCases !== cases.length - 4) errors.push('Every case except C55–C58 must use Jest; those four require the extracted package.');
if (errors.length) { errors.forEach(error => console.error(error)); process.exitCode = 1; }
else if (reportSupplied) console.log(`Publisher acceptance: ${jestCases}/${jestCases} mapped Jest cases passed. C55–C58 require the separate extracted npm-package smoke gate.`);
else console.log(`Publisher acceptance: ${cases.length} cases registered; execution is not established by ledger validation.`);
