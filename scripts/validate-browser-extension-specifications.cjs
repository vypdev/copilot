#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const ROOT = path.resolve(__dirname, '..');
const DATA = 'specs/browser-extension';
const MODES = { local: 3, settings: 4, read: 4, draft: 5, write: 7, setup: 7, monitor: 7 };
const WRITE_ACTOR = new Set(['fix', 'dismiss', 'implement', 'remember', 'sync-branch']);
const BRANCH = new Set(['fix', 'implement', 'remember', 'sync-branch']);
const NO_AGENT = new Set(['help', 'status', 'sdd-diff', 'doctor', 'history', 'dismiss', 'remember']);
const DOCUMENTS = [
  'github-browser-extension.md', 'github-browser-extension-action-integration.md',
  'github-browser-extension-platforms-and-delivery.md',
  'github-browser-extension-functional-catalog.md',
  'github-browser-extension-control-center-and-setup.md',
];

function readJson(root, filename) {
  return JSON.parse(fs.readFileSync(path.join(root, DATA, filename), 'utf8'));
}

function compiler(root, filename) {
  const ajv = new Ajv({ allErrors: true, strictKeywords: true, strictDefaults: true });
  return ajv.compile(readJson(root, filename));
}

function requireSchema(validate, value, name) {
  assert(validate(value), `${name} violates its JSON schema: ${JSON.stringify(validate.errors)}`);
}

function unique(values, name) {
  assert.equal(new Set(values).size, values.length, `${name} must be unique`);
}

function validateFeatures(catalog, schema) {
  requireSchema(schema, catalog, 'feature catalog');
  unique(catalog.families.map(family => family.id), 'family IDs');
  const features = catalog.families.flatMap(family => {
    for (const feature of family.features) {
      assert.equal(feature.family, family.id, `${feature.id} family mismatch`);
      assert(feature.id.startsWith(`BEX-${family.id}-`), `${feature.id} ID namespace mismatch`);
      assert.deepEqual(feature.requirements, [`CAT-${family.id}`], `${feature.id} requirement mismatch`);
      assert.equal(feature.tests.length, MODES[feature.mode], `${feature.id} risk-case allocation mismatch`);
      for (const item of feature.tests) {
        assert(item.id.startsWith(`bexp-${family.id}${feature.id.slice(-2)}-C`), `${item.id} case namespace mismatch`);
      }
    }
    return family.features;
  });
  unique(features.map(feature => feature.id), 'feature IDs');
  const cases = features.flatMap(feature => feature.tests);
  unique(cases.map(item => item.id), 'feature case IDs');
  unique(cases.map(item => item.scenario), 'feature scenarios');
  assert.equal(features.length, 150, 'The full product requires its 150 registered capabilities');
  assert.equal(cases.length, 659, 'Feature risk inventory must contain 659 distinct cases');
  return { features, featureCases: cases.length };
}

function validateRequests(descriptor, schema, knownNames) {
  requireSchema(schema, descriptor, 'request catalog');
  unique(descriptor.commands.map(command => command.name), 'command names');
  assert.deepEqual(descriptor.commands.map(command => command.name).sort(), [...knownNames].sort(), 'Command catalog must match the documented contract');
  for (const command of descriptor.commands) {
    assert.equal(command.requiresWriteActor, WRITE_ACTOR.has(command.name), `${command.name} write-actor guard mismatch`);
    assert.equal(command.requiresVerifiedBranch, BRANCH.has(command.name), `${command.name} branch guard mismatch`);
    const effect = BRANCH.has(command.name) ? 'files' : command.name === 'dismiss' ? 'finding-state'
      : command.name === 'description' ? 'pr-description' : 'publication';
    assert.equal(command.effect, effect, `${command.name} effect classification mismatch`);
    const agent = NO_AGENT.has(command.name) ? 'never' : command.name === 'sync-branch' ? 'conditional' : 'may-run';
    assert.equal(command.agent, agent, `${command.name} agent classification mismatch`);
    if (['fix', 'implement'].includes(command.name)) {
      assert.deepEqual(command.contexts, ['review-thread'], `${command.name} cannot broaden the example's authoritative route`);
    }
  }
}

function validate(root = ROOT) {
  const catalog = readJson(root, 'feature-catalog.v1.json');
  const result = validateFeatures(catalog, compiler(root, 'feature-catalog.schema.json'));
  const commandReference = fs.readFileSync(path.join(root, 'docs/issues/comment-commands.mdx'), 'utf8');
  const names = [...commandReference.matchAll(/^\| `\/copilot ([a-z-]+)/gm)].map(match => match[1]);
  unique(names, 'documented command names');
  validateRequests(readJson(root, 'examples/requests-v2.json'), compiler(root, 'requests-v2.schema.json'), names);
  const manifest = compiler(root, 'manifest-v1.schema.json');
  const status = compiler(root, 'status-v1.schema.json');
  requireSchema(manifest, readJson(root, 'examples/manifest-v1.json'), 'manifest fixture');
  for (const filename of ['status-pr-v1.json', 'status-issue-v1.json']) {
    requireSchema(status, readJson(root, `examples/${filename}`), filename);
  }
  assert.equal(status(readJson(root, 'examples/status-invalid-head-v1.json')), false, 'Invalid-head negative fixture must reject');
  const texts = new Map(DOCUMENTS.map(name => [name, fs.readFileSync(path.join(root, 'specs', name), 'utf8')]));
  for (const [name, text] of texts) {
    assert(!/\bMVP\b/i.test(text), `${name} must express the complete product contract`);
    for (let section = 1; section <= 20; section++) {
      assert.equal([...text.matchAll(new RegExp(`^## ${section}\\. `, 'gm'))].length, 1, `${name} must have one section ${section}`);
    }
    assert(/\b803\b/.test(text), `${name} must agree on the complete 803-case budget`);
  }
  const primary = texts.get(DOCUMENTS[0]);
  const core = [...primary.matchAll(/^\| (bex-[A-Z]-C\d+) \|/gm)].map(match => match[1]);
  const center = [...texts.get(DOCUMENTS[4]).matchAll(/^\| (bexhub-[A-Z]+-C\d+) \|/gm)].map(match => match[1]);
  unique([...core, ...center], 'cross-cutting case IDs');
  assert.equal(core.length, 96, 'Retain all 96 core cases');
  assert.equal(center.length, 48, 'Retain all 48 center/setup integration cases');
  assert.equal(core.length + center.length + result.featureCases, 803);
  assert(primary.includes('| specs/github-browser-extension.md | create |'), 'PR publication inventory must classify the new primary as create');
  const catalogText = texts.get(DOCUMENTS[3]);
  for (const feature of result.features) assert(catalogText.includes(`| ${feature.id} — `), `${feature.id} missing from the readable catalog`);
  const capability = JSON.parse(fs.readFileSync(path.join(root, 'specs/catalog.json'), 'utf8')).capabilities.find(item => item.id === 'github-browser-extension');
  assert.equal(catalog.runtimeVerified, false, 'Specification inventory must not claim runtime evidence');
  for (const name of DOCUMENTS) assert(capability.specs.includes(`specs/${name}`), `${name} missing from capability ownership`);
  return { features: result.features.length, commands: names.length, cases: 803, schemas: 4, positiveFixtures: 5, expectedNegativeFixtures: 1 };
}

if (require.main === module) {
  try { console.log(`Browser-extension specification contract: PASS ${JSON.stringify(validate())}`); }
  catch (error) { console.error(`Browser-extension specification contract: FAIL ${error.message}`); process.exitCode = 1; }
}

module.exports = { validate, validateFeatures, validateRequests, compiler, readJson };
