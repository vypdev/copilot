'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const schema = require('./schema.cjs');
const { git, hash } = require('./git.cjs');
const { makeBroker } = require('./broker.cjs');
const { investigateBugbotShadow } = require('../../../application/usecases/steps/commit/bugbot/investigate_bugbot_shadow.cjs');

const instructions = require('./prompt.cjs');
const ajv = new Ajv();
const validateLegacy = ajv.compile(schema);
const validateLifecycle = ajv.compile(schema.lifecycle);

const legacyOfficialInstruction = 'Use a cited source for every dependency in requiredOfficial, derived from the prepared claim and its anchored file, and for any dependency you name in the conclusion. Obtain the scoped version and source early enough to finish. If a dependency is required, the conclusion needs its cited source even when the repository text already refutes the hypothesis.';
assert(instructions.includes(legacyOfficialInstruction), 'legacy-official-instruction-missing');
const lifecycleInstructions = instructions.replace(legacyOfficialInstruction,
    'For a material premise that depends on a tool or package behavior, cite the matching official source in that premise and list its package, revision and one-based premise index in dependencies. Use dependencies=[] in investigation turns and when all premises are repository-local. The requiredOfficial list marks dependencies already named in the hypothesis. A filename, incidental technology mention or an exploratory lookup alone does not make a dependency material.') +
    '\nA tracked version basis may resolve a release directly when the application has accredited the exact pinned source range. ' +
    'For recall use the revision of the original receipt. Use the short evidence reference shown as receipt for citations, lookup basis and recall. Start with a concrete question that would establish or refute the hypothesis and use why to tie each read to that question.';

function checkTree(repo, subject, allowBase) {
    assert(git(repo, ['rev-parse', subject.head + '^{tree}']).trim() === subject.tree, 'pinned-head-tree-mismatch');
    if (allowBase) {
        assert(git(repo, ['rev-parse', subject.base + '^{tree}']).trim() === subject.baseTree, 'pinned-base-tree-mismatch');
    }
}


/** Bind Git, source and provider adapters to the application investigation. */
function investigate(source, subject, finding, cwd, transport, log, signal, { lifecycle = false, sharedRead, stateless } = {}) {
    return investigateBugbotShadow({
        broker: makeBroker(source, subject, finding, sharedRead), subject, finding, log, signal, lifecycle, stateless,
        transport: request => transport({ ...request, cwd }),
        officialPackages: [...new Set((source.catalog ?? []).map(entry => entry.package))],
        instructions: lifecycle ? lifecycleInstructions : instructions,
        schema: lifecycle ? schema.lifecycle : schema,
        validate: lifecycle ? validateLifecycle : validateLegacy,
        checkRevision: () => checkTree(source.repo, subject, finding.allowBase),
        fingerprint: hash,
    });
}

module.exports = { investigate };
