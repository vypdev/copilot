#!/usr/bin/env node
/* Build an isolated consumer fixture using the ordinary issue and comment workflows. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { renderCatalog } = require('../../src/infrastructure/specification_catalog_validator.cjs');

const destination = process.argv[2];
const pin = process.argv[3];
if (!destination || !/^[a-f0-9]{40}$/u.test(pin ?? '') || fs.existsSync(destination)) {
  console.error('Usage: node quality/sdd/qualification-763.cjs <new-output-directory> <exact-sdk-sha>');
  process.exit(1);
}
const root = path.resolve(__dirname, '../..');
const put = (location, body) => {
  const file = path.join(destination, location);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
const copy = (source, target, transform = body => body) => put(target, transform(fs.readFileSync(path.join(root, source), 'utf8')));
const sdkPin = body => body.replace(/(vypdev\/copilot(?:\/[A-Za-z0-9_./-]+)?)@v3\b/gu, '$1@' + pin);
const labels = '["self-hosted","codex","Linux"]';
copy('setup/workflows/copilot_issue.yml', 'repo/.github/workflows/copilot_issue.yml', body =>
  sdkPin(body).replace('    runs-on: ubuntu-latest\n    timeout-minutes: 120', '    runs-on: ' + labels + '\n    timeout-minutes: 120'));
copy('setup/workflows/copilot_issue_comment.yml', 'repo/.github/workflows/copilot_issue_comment.yml', body =>
  sdkPin(body).replace('"ubuntu-latest"', labels));
copy('setup/ISSUE_TEMPLATE/feature_request.yml', 'repo/.github/ISSUE_TEMPLATE/feature_request.yml');
copy('specs/_template.md', 'repo/specs/_template.md');
copy('specs/README.md', 'repo/specs/README.md');
put('repo/docs/fixture.md', '# Payment matrix\n\nThis fixture records verification expectations for a simulated payment ledger.\n');

const table = (head, rows) => [head, head.map(() => '---'), ...rows].map(row => '| ' + row.join(' | ') + ' |').join('\n');
const requirements = [
  ['PAY-01', 'Preserve the exact payment amount and currency across reconciliation.'],
  ['PAY-02', 'Report the observable status of every settlement without double counting.'],
];
const currencies = ['EUR', 'GBP', 'USD', 'CAD', 'JPY'];
const status = ['open', 'held', 'settled', 'reversed', 'expired', 'refunded'];
const amounts = [1, 2, 5, 10, 20, 25, 50, 80, 100, 250, 500, 1000, 1200, 1500, 2000, 2500, 5000, 7500, 10000, 50000];
const cases = currencies.flatMap(currency => status.flatMap(state => amounts.map(amount => ({ currency, state, amount }))));
const testRows = (namespace, count) => cases.slice(0, count).map(({ currency, state, amount }, i) => [
  namespace + '-C' + (i + 1), 'Reconciliation', 'PAY-01, PAY-02',
  'Verify ' + amount + ' ' + currency + ' remains ' + state + ' in the ledger and settlement totals remain correct.',
]);
const requirementsHeader = ['Requirement', 'Behavior'];
const casesHeader = ['Case ID', 'Area', 'Requirements', 'Scenario'];
const pathsHeader = ['Path', 'Change'];
const ownerPath = 'specs/payment-ledger.md';
const pathRows = [[ownerPath, 'update'], ['docs/fixture.md', 'reference']];
function document(title, namespace, count, owner = false) {
  const rows = testRows(namespace, count);
  return ['# ' + title, '- Status: Draft', '- Catalog capability: payment-ledger',
    '## 1. Executive summary\n\nDocument and verify the observable payment settlement matrix for the selected source.',
    '## 4. Goals\n\n' + table(requirementsHeader, requirements),
    '## 8. Clean Architecture design\n\nThe simulation records payments independently from their presentation and the reviewer inspects the immutable ledger evidence.',
    '## 14. Testing strategy\n\n' + table(['Area', 'Minimum distinct cases', 'Behaviors/risks covered'],
      [['Reconciliation', String(count), 'Independent observed amount and settlement combinations.'], ['Total', String(count), 'Exact fixture inventory.']])
      + '\n\n' + table(casesHeader, rows),
    '## 15. Documentation and discoverability\n\n' + table(pathsHeader, pathRows),
    '## 16. Acceptance scenarios\n\nThe exact amounts, currencies and states in the matrix are observable independently and the owner remains immutable.',
    '## 17. Requirements traceability\n\n' + table(['Requirement', 'Cases'], requirements.map(([id]) => [id, rows.map(row => row[0]).join(', ')])),
    owner ? '## 20. References and decisions\n\nRetained immutable fixture evidence.\n' : '',
  ].filter(Boolean).join('\n\n') + '\n';
}
const owner = document('Payment ledger baseline', 'baseline', cases.length, true);
const seed = document('Payment ledger seed', 'seed-review', 12);
if (owner.length <= 70_000) throw new Error('The immutable owner must exceed the old publication limit.');
const catalog = { version: 1, capabilities: [{
  id: 'payment-ledger', title: 'Payment ledger', status: 'proposed', scope: 'Payment and settlement fixture',
  owner: 'Maintainers', lastVerified: '2026-11-05', specs: [ownerPath], workflows: [], entrypoints: [], code: [], tests: [],
  documentation: ['docs/fixture.md'],
}] };
put('repo/' + ownerPath, owner);
put('repo/specs/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
put('repo/specs/CATALOG.md', renderCatalog(catalog));

function issueBody(namespace, count, optionalSeed) {
  const scope = [
    '### Description of the idea or improvement',
    'Append a proposed change to the existing payment-ledger capability at specs/payment-ledger.md. Ownership and acceptance are decided.',
    'Retain the full baseline. Record each resolved scenario below as an independently executable test. Use the checkout evidence in docs/fixture.md as a reference.',
    table(requirementsHeader, requirements),
    table(casesHeader, testRows(namespace, count)),
    table(pathsHeader, pathRows),
    '### Current limitations or challenges',
    'The fixture already has a large immutable owner; the proposed change must preserve every existing case.',
    '### Expected impact',
    'Publication preserves the exact prefix and proves all the new cases and reciprocal requirement edges.',
  ].join('\n\n') + '\n';
  if (!optionalSeed) return scope;
  return scope + '\n<!-- copilot:sdd-seed -->\n' + optionalSeed + '<!-- /copilot:sdd-seed -->\n';
}
const largeCount = 400;
const bodies = [
  ['autonomous', issueBody('auto-review', 12), 12],
  ['seed', issueBody('seed-review', 12, seed), 12],
  ['large', issueBody('large-review', largeCount), largeCount],
];
for (const [route, body] of bodies) {
  if (body.length > 60_000) throw new Error('Qualification issue body exceeds the fixture envelope.');
  put('requests/' + route + '.md', body);
}
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const reviewSeed = 'SDD Q1: review seed ' + hash(seed);
put('requests/manifest.json', JSON.stringify({ sdk: pin, ownerPath, ownerUtf8: Buffer.byteLength(owner), ownerSha256: hash(owner),
  reviewSeed, cases: bodies.map(([route, body, count]) => ({ route, count, issueBodySha256: hash(body) })) }, null, 2) + '\n');
console.log(JSON.stringify({ directory: destination, ownerUtf8: Buffer.byteLength(owner), largeIssueCharacters: bodies[2][1].length, reviewSeed }));
