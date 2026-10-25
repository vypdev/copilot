const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validate, validateFeatures, validateRequests, compiler, readJson } = require('../scripts/validate-browser-extension-specifications.cjs');

const root = path.resolve(__dirname, '..');
const featureSchema = compiler(root, 'feature-catalog.schema.json');
const requestSchema = compiler(root, 'requests-v2.schema.json');
const features = () => readJson(root, 'feature-catalog.v1.json');
const requests = () => readJson(root, 'examples/requests-v2.json');
const names = requests().commands.map(command => command.name);

test('validates the complete proposed catalog, real schemas/fixtures and document ownership', () => {
  assert.deepEqual(validate(root), { features: 150, commands: 21, cases: 803, schemas: 4, positiveFixtures: 5, expectedNegativeFixtures: 1 });
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
