const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate, validateFeatures, validateFeatureTraceability, validateRequests, compiler, readJson, loadFeatureCatalog } = require('../scripts/validate-browser-extension-specifications.cjs');

const root = path.resolve(__dirname, '..');
const featureSchema = compiler(root, 'feature-catalog.schema.json');
const requestSchema = compiler(root, 'requests-v2.schema.json');
const features = () => loadFeatureCatalog(root);
const requests = () => readJson(root, 'examples/requests-v2.json');
const names = requests().commands.map(command => command.name);

test('validates the complete proposed catalog, real schemas/fixtures and document ownership', () => {
  assert.deepEqual(validate(root), { features: 150, commands: 21, cases: 803, schemas: 5, positiveFixtures: 6, expectedNegativeFixtures: 1 });
});

test('rejects catalog references outside the fixed local family directory', () => {
  const index = readJson(root, 'feature-catalog.v1.json'); index.families[0].file = '../../outside.json';
  assert.throws(() => loadFeatureCatalog(root, index), /feature index violates its JSON schema/);
});

test('rejects swapping a valid family path into another family slot', () => {
  const index = readJson(root, 'feature-catalog.v1.json'); index.families[0].file = index.families[1].file;
  assert.throws(() => loadFeatureCatalog(root, index), /family path mismatch/);
});

test('rejects duplicate capabilities instead of counting the same feature twice', () => {
  const value = features(); value.families[0].features[1] = structuredClone(value.families[0].features[0]);
  assert.throws(() => validateFeatures(value, featureSchema), /feature IDs must be unique/);
});

test('rejects reused case identities despite an unchanged total', () => {
  const value = features(); value.families[0].features[0].tests[1].id = value.families[0].features[0].tests[0].id;
  assert.throws(() => validateFeatures(value, featureSchema), /feature case IDs must be unique/);
});

test('rejects reclassifying a required product function as deferred', () => {
  const value = features(); value.families[0].features[0].delivery = 'future';
  assert.throws(() => validateFeatures(value, featureSchema), /JSON schema/);
});

test('rejects dropping Safari from a registered function', () => {
  const value = features(); value.families[0].features[0].browsers = ['chrome', 'firefox'];
  assert.throws(() => validateFeatures(value, featureSchema), /JSON schema/);
});

test('rejects credential-shaped unknown metadata in the closed catalog', () => {
  const value = features(); value.families[0].features[0].token = 'fixture-only-not-a-credential';
  assert.throws(() => validateFeatures(value, featureSchema), /JSON schema/);
});

test('rejects a feature detached from its family requirement', () => {
  const value = features(); value.families[0].features[0].requirements = ['CAT-CODE'];
  assert.throws(() => validateFeatures(value, featureSchema), /requirement mismatch/);
});

test('rejects replacing write-risk cases with a lower allocation', () => {
  const value = features(); const item = value.families.flatMap(family => family.features).find(feature => feature.mode === 'write'); item.tests.pop();
  assert.throws(() => validateFeatures(value, featureSchema), /risk-case allocation mismatch/);
});

test('rejects stale per-family case counts in readable requirement traceability', () => {
  const text = fs.readFileSync(path.join(root, 'specs/github-browser-extension-functional-catalog.md'), 'utf8');
  const stale = text.replace(/(\| CAT-NOTIFY \|[^\n]+\| )32 explicit cases/, (_, prefix) => `${prefix}29 explicit cases`);
  assert.notEqual(stale, text);
  assert.throws(() => validateFeatureTraceability(features(), stale), /CAT-NOTIFY case traceability mismatch/);
});

for (const suffix of ['', ' with conflicting cells']) {
  test(`rejects duplicate feature traceability rows${suffix}`, () => {
    const text = fs.readFileSync(path.join(root, 'specs/github-browser-extension-functional-catalog.md'), 'utf8');
    const row = text.split('\n').find(line => line.startsWith('| CAT-NOTIFY |') && line.includes('explicit cases'));
    const duplicate = suffix ? row.replace('32 explicit cases in the JSON test inventory', 'unavailable cases') : row;
    const duplicated = text.replace('## 18. Implementation sequence', `${duplicate}\n\n## 18. Implementation sequence`);
    assert.throws(() => validateFeatureTraceability(features(), duplicated), /CAT-NOTIFY must have exactly one/);
  });
}

for (const outerPipes of [true, false]) {
  test(`rejects conflicting compact Markdown rows with outer pipes ${outerPipes}`, () => {
    const text = fs.readFileSync(path.join(root, 'specs/github-browser-extension-functional-catalog.md'), 'utf8');
    const row = text.split('\n').find(line => line.startsWith('| CAT-NOTIFY |') && line.includes('explicit cases'));
    let compact = row.replace(/\s*\|\s*/g, '|').replace('32 explicit cases', '29 explicit cases');
    if (!outerPipes) compact = compact.slice(1, -1);
    const duplicated = text.replace('## 18. Implementation sequence', `${compact}\n\n## 18. Implementation sequence`);
    assert.throws(() => validateFeatureTraceability(features(), duplicated), /CAT-NOTIFY must have exactly one/);
  });
}

test('rejects weakening finding-dismissal actor authorization', () => {
  const value = requests(); value.commands.find(command => command.name === 'dismiss').requiresWriteActor = false;
  assert.throws(() => validateRequests(value, requestSchema, names), /write-actor guard/);
});

test('rejects a fabricated command outside the reviewed grammar', () => {
  const value = requests(); value.commands[0].name = 'deploy-now';
  assert.throws(() => validateRequests(value, requestSchema, names), /JSON schema/);
});

test('rejects broadening file-changing command routes in the fixture', () => {
  const value = requests(); value.commands.find(command => command.name === 'implement').contexts.push('conversation');
  assert.throws(() => validateRequests(value, requestSchema, names), /authoritative route/);
});

test('rejects classifying a model-running command as model-free', () => {
  const value = requests(); value.commands.find(command => command.name === 'findings').agent = 'never';
  assert.throws(() => validateRequests(value, requestSchema, names), /agent classification mismatch/);
});
