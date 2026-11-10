'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync, realpathSync, statSync } = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { load, JSON_SCHEMA } = require('js-yaml');
const { git, receipt, validate, dryRunPorts } = require('../on-demand/contract.cjs');
const { selectAnchor } = require('../tree-search/contract.cjs');
const { sourceLimits } = require('../packet-audit/git-evidence.cjs');
const { sourceReader, lineRead } = require('../detector-verifier-diagnostic/runner.cjs');
const { byteLength, digest, limits } = require('../v4/verification.cjs');
const subjects = require('./subjects.lock.json');

const packages = [
    { name: '@storybook/addon-vitest', version: '10.6.5', archive: 'storybook-addon-vitest-10.6.5.tgz',
        specifier: '@storybook/addon-vitest/vitest-plugin', entry: 'dist/vitest-plugin/index.js', links: [],
        slices: [
            ['pattern-normalization', 'dist/vitest-plugin/index.js', 2631, 2636],
            ['storybook-test-include', 'dist/vitest-plugin/index.js', 2683, 2689],
        ] },
    { name: 'vitest', version: '5.1.0', archive: 'vitest-5.1.0.tgz', specifier: 'vitest/node', entry: 'dist/node.js',
        links: [['dist/node.js', './chunks/index.Di8au7q4.js'], ['dist/node.js', './chunks/cli-api.COfZo8lK.js'],
            ['dist/node.js', './chunks/coverage.jGCktcGP.js']],
        dispatch: ['dist/chunks/coverage.jGCktcGP.js', 'v8: "@vitest/coverage-v8"'],
        slices: [
            ['shared-coverage', 'dist/chunks/index.Di8au7q4.js', 8802, 8805],
            ['append-project-include', 'dist/chunks/index.Di8au7q4.js', 8993, 9004],
            ['exclude-tested-and-untested', 'dist/chunks/cli-api.COfZo8lK.js', 6999, 7041],
        ] },
    { name: '@vitest/coverage-v8', version: '5.1.0', archive: 'vitest-coverage-v8-5.1.0.tgz',
        specifier: '@vitest/coverage-v8', entry: 'dist/index.js',
        links: [['dist/index.js', './load-provider-CdgAx3rL.js'], ['dist/load-provider-CdgAx3rL.js', './provider.js']],
        slices: [
            ['v8-source-filter', 'dist/provider.js', 284, 293],
            ['v8-remap-tested-file', 'dist/provider.js', 305, 306],
            ['v8-merge-tested-and-untested', 'dist/provider.js', 65, 79],
            ['report-from-coverage-map', 'dist/provider.js', 97, 112],
        ] },
    { name: '@vitest/istanbul-lib-report', version: '2.1.0', archive: 'vitest-istanbul-lib-report-2.1.0.tgz',
        specifier: '@vitest/istanbul-lib-report', entry: 'dist/index.mjs',
        parent: '@vitest/coverage-v8', parentFile: 'dist/provider.js',
        links: [['dist/index.mjs', './reports/json-summary/index.mjs']],
        dispatch: ['dist/index.mjs', '"json-summary": c'],
        slices: [
            ['summary-writer', 'dist/reports/json-summary/index.mjs', 3, 19],
        ] },
];

function resolved(cwd, specifier, parent) {
    const script = 'console.log(import.meta.resolve(process.argv[1], process.argv[2] || undefined))';
    const result = execFileSync(process.execPath, ['--experimental-import-meta-resolve', '--input-type=module',
        '-e', script, specifier, parent ? pathToFileURL(parent).href : ''], { cwd, timeout: 2000, encoding: 'utf8' }).trim();
    return fileURLToPath(result);
}

function verifyArchive(cwd, archives, config, lock, prepared, binding) {
    const { name, version, specifier, entry, archive, parent, parentFile } = config;
    const key = name + '@' + version;
    const snapshot = parent
        ? lock.snapshots[prepared[parent].snapshot].dependencies[name]
        : lock.importers['.'].devDependencies[name].version;
    assert(snapshot === version || snapshot.startsWith(version + '('));
    assert(lock.snapshots[name + '@' + snapshot], 'resolved-snapshot-missing');
    assert(!Object.hasOwn(lock.patchedDependencies ?? {}, key), 'unattested-package-patch');
    const integrity = lock.packages[key].resolution.integrity;
    const tarball = path.join(archives, archive);
    assert(statSync(tarball).size <= 1024 * 1024, 'fixture-archive-bound');
    const actual = 'sha512-' + createHash('sha512').update(readFileSync(tarball)).digest('base64');
    assert.equal(actual, integrity, 'lock-integrity');

    const installed = resolved(cwd, specifier, parent && path.join(prepared[parent].root, parentFile));
    assert(installed.endsWith('/' + entry));
    const root = installed.slice(0, -(entry.length + 1));
    assert(root.startsWith(path.join(cwd, 'node_modules/.pnpm') + '/'));
    const files = new Map();
    function member(filename) {
        if (!files.has(filename)) {
            const bytes = execFileSync('tar', ['-xOf', tarball, 'package/' + filename], { timeout: 2000, maxBuffer: 1024 * 1024 });
            assert.deepEqual(bytes, readFileSync(path.join(root, filename)), 'installed-archive-mismatch');
            files.set(filename, bytes);
        }
        return files.get(filename);
    }
    const manifest = JSON.parse(member('package.json'));
    assert.deepEqual([manifest.name, manifest.version], [name, version], 'package-identity');
    member(entry);
    for (const [file, imported] of config.links) {
        assert(member(file).includes(Buffer.from(imported)), 'resolved-import-missing');
        member(path.posix.join(path.posix.dirname(file), imported));
    }
    if (config.dispatch) assert(member(config.dispatch[0]).includes(Buffer.from(config.dispatch[1])), 'report-dispatch-missing');
    if (parent) assert(readFileSync(path.join(prepared[parent].root, parentFile), 'utf8').includes("'" + specifier + "'"));
    const proofs = config.slices.map(([link, file, start, end]) => {
        const bytes = member(file);
        const lines = bytes.toString('utf8').split(/\r?\n/u);
        assert(start > 0 && start <= end && end <= lines.length && end - start + 1 <= sourceLimits.lines);
        const text = lines.slice(start - 1, end).join('\n');
        assert(byteLength(text) <= sourceLimits.fragmentBytes);
        return receipt(binding, { kind: 'dependency', link, package: name, version, integrity, specifier, entry,
            file, fileSha256: digest(bytes), lockPath: binding.lockPath, lockBlob: binding.lockBlob, start, end, text });
    });
    return { root, snapshot: name + '@' + snapshot, integrity, proofs };
}

function admit(proof, binding, expected) {
    assert.equal(proof.head, binding.head, 'dependency-revision');
    assert.equal(proof.tree, binding.tree, 'dependency-tree');
    assert.equal(proof.lockBlob, binding.lockBlob, 'dependency-lock');
    assert.equal(proof.version, expected.version, 'dependency-version');
    assert.deepEqual(proof, expected, 'dependency-artifact');
    assert.deepEqual(receipt(binding, proof), proof, 'dependency-receipt');
}

function gitRead(reader, target, start, end) {
    const result = reader.read(lineRead(target, start, end), false);
    assert.equal(result.status, 'provided');
    assert.equal(result.receipts.length, 1);
    return result.receipts[0];
}

function project(candidate, excerpt, binding, resolutions, proofs) {
    const sources = proofs.map(proof => {
        const { id, kind, start, end, text } = proof;
        return kind === 'dependency'
            ? { id, kind, package: proof.package, file: proof.file, start, end, text }
            : { id, kind, path: proof.path, blob: proof.blob, start, end, text };
    });
    const { operation, head, tree, lockPath, lockBlob } = binding;
    return { candidate, excerpt, provenance: { operation, head, tree, lockPath, lockBlob, resolutions }, sources };
}

function run(lab, archives) {
    const records = {};
    const bySubject = {};
    const writes = [];
    const blockedPorts = dryRunPorts(operation => writes.push(operation));
    for (const [subject, lock] of Object.entries(subjects)) {
        const cwd = realpathSync(path.join(lab, subject));
        assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), lock.head);
        assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), lock.tree);
        assert.equal(git(cwd, 'rev-parse', lock.head + ':' + lock.lockPath).trim(), lock.lockBlob);
        assert.equal(git(cwd, 'remote'), '');
        assert.equal(git(cwd, 'status', '--porcelain'), '');
        const patch = git(cwd, '-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-textconv',
            '--no-renames', '--unified=3', lock.base, lock.head, '--', lock.anchor.path);
        assert.equal(digest(patch), lock.anchorDiffSha256);
        const hunk = patch.slice(patch.indexOf('@@ '));
        assert.deepEqual(selectAnchor(lock.anchor, hunk).selected, lock.anchor);
        const [header, ...lines] = hunk.split('\n');
        assert.match(header, /^@@ -0,0 \+1,/u);
        const excerpt = [header, '[excerpt near the candidate anchor]', ...lines.slice(lock.anchor.line - 4, lock.anchor.line + 4)].join('\n');
        const candidate = { id: 'c-895', anchor: lock.anchor, hypothesis: 'The effective coverage configuration admits a Storybook CSF definition to the JSON summary, causing the runtime inventory check to fail.' };
        const binding = { ...lock, operation: digest(JSON.stringify([lock.head, lock.tree, candidate])), candidate: candidate.id, scopes: [''] };
        const yaml = load(git(cwd, 'show', lock.head + ':' + lock.lockPath), { schema: JSON_SCHEMA });
        const prepared = {};
        for (const pkg of packages) prepared[pkg.name] = verifyArchive(cwd, archives, pkg, yaml, prepared, binding);

        const source = sourceReader({ cwd }, { head: binding });
        const dependencies = Object.values(prepared).flatMap(pkg => pkg.proofs);
        for (const proof of dependencies) admit(proof, binding, proof);
        // Initial packet mirrors the proposed next diagnostic. The active Vitest project config is withheld.
        const initial = [...dependencies, gitRead(source, '.storybook/main.ts', 2, 5),
            gitRead(source, 'tooling/coverage.mjs', 33, 41), gitRead(source, 'tests/coverage-evidence.test.mjs', 6, 11)];
        const delivered = [...initial, gitRead(source, 'vitest.config.ts', 1, subject === 'original' ? 15 : 24)];
        const resolutions = Object.fromEntries(packages.map(({ name, version }) =>
            [name, { version, integrity: prepared[name].integrity }]));
        const firstPacket = project(candidate, excerpt, binding, resolutions, initial);
        const packet = { ...project(candidate, excerpt, binding, resolutions, delivered),
            retrieval: { status: 'provided', targets: [{ status: 'provided' }] } };
        const initialBytes = byteLength(JSON.stringify(firstPacket));
        const deliveredBytes = byteLength(JSON.stringify(packet));
        assert(initialBytes < deliveredBytes && deliveredBytes <= limits.packetBytes, 'full-packet-budget ' + deliveredBytes);
        const { elapsedMs, ...gitUsage } = source.usage();
        assert(gitUsage.accounted && elapsedMs <= sourceLimits.sourceWallMs);
        assert.equal(gitUsage.openedFiles, 4);
        const dependencyBytes = byteLength(JSON.stringify({ provenance: packet.provenance,
            sources: packet.sources.filter(proof => proof.kind === 'dependency') }));
        assert(dependencyBytes <= sourceLimits.evidenceBytes, 'dependency-packet-budget ' + dependencyBytes);

        // The fake verifier gets serialized source, with shared provenance and no evaluator inputs.
        function fakeVerifier(wire) {
            const input = JSON.parse(wire);
            assert.deepEqual(input.candidate.anchor, lock.anchor);
            for (const proof of input.sources.filter(item => item.kind === 'dependency')) {
                const checked = delivered.find(item => item.id === proof.id);
                assert(checked);
                assert.equal(input.provenance.resolutions[proof.package].version, checked.version);
                assert.equal(input.provenance.lockBlob, checked.lockBlob);
                assert.equal(input.provenance.head, checked.head);
                assert.equal(input.provenance.tree, checked.tree);
                assert.equal(input.provenance.operation, checked.operation);
                assert.equal(proof.text, checked.text);
                assert.equal(proof.file, checked.file);
            }
            return { candidate: input.candidate.id, kind: 'verdict', verdict: 'inconclusive',
                citations: input.sources.map(proof => proof.id), reason: 'Simulated receipt delivery control.',
                nextStep: 'Inspect the complete material evidence in a separate model pilot.', request: null };
        }
        const answer = validate(fakeVerifier(JSON.stringify(packet)), binding, delivered, false);
        assert.deepEqual(answer.citations, delivered.map(proof => proof.id));
        const [proof] = dependencies;
        const forged = receipt(binding, { ...proof, version: '0.0.0' });
        assert.throws(() => admit(forged, binding, proof), /dependency-version/u);
        const forgedLock = receipt(binding, { ...proof, lockBlob: '0'.repeat(40) });
        assert.throws(() => admit(forgedLock, binding, proof), /dependency-lock/u);
        const forgedFile = receipt(binding, { ...proof, file: 'unattested.js' });
        assert.throws(() => admit(forgedFile, binding, proof), /dependency-artifact/u);
        assert.throws(() => validate({ ...answer, citations: [forged.id] }, binding, delivered, false), /citation-integrity/u);

        bySubject[subject] = { binding, delivered, answer, proof };
        records[subject] = { head: lock.head, tree: lock.tree, lockBlob: lock.lockBlob, anchor: lock.anchor,
            initialBytes, deliveredBytes, dependencyBytes, gitUsage, dependencyReceipts: dependencies.map(({ text, ...proof }) => ({ ...proof, bytes: byteLength(text) })),
            citationsAccepted: answer.citations, initialSources: initial.map(item => item.id), recoveredSource: delivered.at(-1).id,
            resolutions: Object.fromEntries(Object.entries(prepared).map(([name, pkg]) => [name, { snapshot: pkg.snapshot, integrity: pkg.integrity }])) };
    }

    const { binding, delivered, answer, proof } = bySubject.original;
    const foreign = bySubject.mutant.proof;
    assert.notEqual(foreign.id, proof.id);
    assert.throws(() => admit(foreign, binding, proof), /dependency-revision/u);
    assert.throws(() => validate({ ...answer, citations: [foreign.id] }, binding, [...delivered, foreign], false), /citation-integrity/u);
    assert.deepEqual(writes, []);
    assert.throws(() => blockedPorts.publishReview(), /dry-run-write-port/u);
    assert.deepEqual(writes, ['publishReview']);
    return { cases: records, guards: ['wrong-version', 'wrong-lock', 'wrong-file', 'foreign-citation', 'wrong-revision', 'write-trap'],
        modelCalls: 0, writeAttemptsDuringDelivery: 0 };
}

if (require.main === module) {
    console.log(JSON.stringify(run(path.resolve(process.argv[2]), path.resolve(process.argv[3])), null, 2));
}
