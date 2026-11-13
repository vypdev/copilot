'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { isDeepStrictEqual } = require('node:util');
const { git, receipt } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const { VerdictFailure } = require('../coverage-895-contract-audit/verdict.cjs');
const { reference } = require('./manifest.json');

const auditPath = 'quality/bugbot/evidence/issue-950/coverage-895-contract-audit';
const story = 'stories/button.stories.ts';

function verify(ok, code, field) {
    if (!ok) throw new VerdictFailure(code, field);
}

function readPinned(relative) {
    const file = auditPath + '/' + relative;
    const bytes = readFileSync(path.join(__dirname, '../coverage-895-contract-audit', relative));
    const oid = git(__dirname, 'rev-parse', reference + ':' + file).trim();
    const actual = execFileSync('git', ['-C', __dirname, 'hash-object', '--stdin'], { input: bytes, encoding: 'utf8' }).trim();
    verify(actual === oid, 'execution-artifact-hash', 'artifacts.' + relative);
    return bytes;
}

function buildExecution(subject, session, producer, evidence, readArtifact) {
    const { identity } = session;
    const prefix = name => subject + '-' + name;
    const bytes = name => readArtifact(prefix(name));
    const hashed = (source, expected, field) => {
        verify(digest(source) === expected, 'execution-artifact-hash', field);
        return source;
    };
    verify(evidence.head === identity.head, 'execution-head', 'binding.head');
    verify(evidence.tree === identity.tree, 'execution-tree', 'binding.tree');
    verify(evidence.lockBlob === identity.lockBlob, 'execution-lockfile', 'binding.lockBlob');
    verify(isDeepStrictEqual(evidence.resolutions, session.resolutions), 'execution-versions', 'binding.resolutions');
    const lockText = git(session.cwd, 'show', identity.head + ':' + identity.lockPath);
    verify(digest(lockText) === evidence.gitSources[identity.lockPath].sha256, 'execution-lockfile', 'binding.lockSha256');
    const command = JSON.parse(git(session.cwd, 'show', identity.head + ':package.json')).scripts.test;
    verify(command === evidence.command, 'execution-command', 'binding.command');
    const binding = JSON.parse(hashed(bytes('binding.json'), evidence.bindingSha256, 'artifacts.binding'));
    verify(binding.head === identity.head && binding.tree === identity.tree, 'execution-head', 'binding.head');
    verify(binding.lockBlob === identity.lockBlob, 'execution-lockfile', 'binding.lockBlob');
    verify(binding.command === command, 'execution-command', 'binding.command');
    verify(binding.candidate === identity.candidate && binding.operation === identity.operation, 'execution-candidate', 'binding.candidate');
    verify(binding.story === story, 'execution-story', 'observation.target');
    const fullKey = path.join(evidence.cwd, story);
    const reports = {};
    for (const mode of ['baseline', 'observed']) {
        const facts = evidence.artifacts[mode];
        const summary = JSON.parse(hashed(bytes(mode + '-summary.json'), facts.summarySha256, 'artifacts.' + mode + '.summary'));
        const log = hashed(gunzipSync(bytes(mode + '.log.gz')), facts.logSha256, 'artifacts.' + mode + '.log').toString('utf8');
        const status = Number(hashed(bytes(mode + '.status'), facts.statusSha256, 'artifacts.' + mode + '.status').toString('utf8').trim());
        const failures = [
            ...(log.includes('Unexpected coverage file: ' + fullKey) ? ['unexpected-story-key'] : []),
            ...(log.includes('total: incomplete branches coverage') ? ['incomplete-aggregate-branches'] : []),
        ];
        verify(facts.command === command && facts.reportKey === fullKey, 'execution-command', 'artifacts.' + mode + '.command');
        verify(/Test Files\s+\d+ passed/u.test(log) && /Tests\s+\d+ passed/u.test(log), 'execution-incomplete', 'observation.coverageExit');
        verify(status === facts.exit && (status === 0 ? /ℹ pass 1/u.test(log) && failures.length === 0
            : status === 1 && /ℹ fail 1/u.test(log) && failures.includes('unexpected-story-key')),
        'execution-incomplete', 'observation.inventoryExit');
        reports[mode] = { summary, status, failures };
    }
    verify(isDeepStrictEqual(reports.baseline, reports.observed), 'execution-observer-mismatch', 'observation.summary');
    const { summary, status, failures } = reports.baseline;
    const trace = hashed(bytes('trace.jsonl'), evidence.traceSha256, 'artifacts.trace').toString('utf8').trim().split('\n').map(JSON.parse);
    const get = name => trace.find(row => row.event === name);
    const required = ['before-hooks', 'after-hooks', 'provider-options', 'collection', 'tested-filter',
        'untested-candidates', 'untested-merge', 'final-map'];
    for (const name of required) verify(get(name), 'execution-incomplete', 'observation.' + name);
    const order = ['before-hooks', 'after-hooks', 'provider-options', 'collection', 'tested-filter', 'untested-candidates', 'final-map']
        .map(name => trace.indexOf(get(name)));
    verify(order.every((index, i) => !i || index > order[i - 1]), 'execution-order', 'observation.trace');
    const present = Object.hasOwn(summary, fullKey);
    const tested = get('tested-filter').included;
    if (present) {
        const remap = get('tested-remap'), merge = get('tested-merge');
        verify(remap?.inputIsStory === true && merge && trace.indexOf(get('tested-filter')) < trace.indexOf(remap)
            && trace.indexOf(remap) < trace.indexOf(merge) && trace.indexOf(merge) < trace.indexOf(get('untested-candidates')),
        'execution-order', 'observation.testedRoute');
    }
    const remapped = get('tested-remap')?.outputHasStory ?? null;
    const merged = get('tested-merge')?.outputHasStory ?? null;
    verify(present === evidence.artifacts.baseline.present && present === get('final-map').hasStory
        && present === Boolean(get('summary-key')) && (!present || (tested && remapped && merged)),
    'execution-projection', 'observation.summaryKeyPresent');
    const observation = { target: story, report: 'coverage/coverage-summary.json', summaryKeyPresent: present,
        coverageExit: 0, inventoryExit: status, inventoryDiagnostics: failures,
        effectiveExclusion: get('provider-options').exclude, provider: get('provider-options').provider,
        storyProject: get('collection').projects, testedFilterAdmitted: tested, testedRemapHasKey: remapped,
        testedMergeHasKey: merged, untestedListed: get('untested-candidates').listedAsUntested,
        untestedMapHasKey: get('untested-merge').inputHasStory, finalMapHasKey: get('final-map').hasStory };
    const artifact = { producer, binding: { repository: 'vypdev/ha-ui', head: identity.head, tree: identity.tree,
        lockPath: identity.lockPath, lockBlob: identity.lockBlob, lockSha256: digest(lockText), resolutions: session.resolutions,
        command, cwd: evidence.cwd, candidate: identity.candidate, operation: identity.operation, anchor: identity.anchor },
    hashes: { baseline: evidence.artifacts.baseline, observed: evidence.artifacts.observed,
        trace: evidence.traceSha256, observationBinding: evidence.bindingSha256 }, observation };
    return { runId: digest(JSON.stringify({ producer, binding: artifact.binding, hashes: artifact.hashes })), ...artifact };
}

function loadExecutions(sessions) {
    const audit = JSON.parse(readPinned('audit.json'));
    const producer = { kind: 'local-evaluator', commit: reference, environment: audit.environment,
        replaySha256: digest(readPinned('replay.sh')), observerSha256: digest(readPinned('observe.cjs')),
        auditSha256: digest(readPinned('audit.cjs')), environmentArtifacts: audit.artifactHashes };
    for (const [file, hash] of Object.entries(producer.environmentArtifacts)) {
        verify(digest(readPinned('execution/' + file)) === hash, 'execution-artifact-hash', 'producer.environment');
    }
    return Object.fromEntries(Object.entries(sessions).map(([subject, session]) => [subject,
        buildExecution(subject, session, producer, audit.cases[subject], file => readPinned('execution/' + file))]));
}

function validateExecution(actual, expected) {
    const check = (value, referenceValue, field) => {
        if (referenceValue !== null && typeof referenceValue === 'object' && !Array.isArray(referenceValue)) {
            verify(value !== null && typeof value === 'object' && !Array.isArray(value), 'execution-incomplete', field);
            for (const [key, child] of Object.entries(referenceValue)) {
                verify(Object.hasOwn(value, key), 'execution-incomplete', field + '.' + key);
                check(value[key], child, field + '.' + key);
            }
            verify(Object.keys(value).length === Object.keys(referenceValue).length, 'execution-additional-field', field);
        } else {
            const codes = { 'execution.binding.head': 'execution-head', 'execution.binding.tree': 'execution-tree',
                'execution.binding.lockBlob': 'execution-lockfile', 'execution.binding.lockSha256': 'execution-lockfile',
                'execution.binding.command': 'execution-command' };
            verify(isDeepStrictEqual(value, referenceValue), codes[field] ?? 'execution-integrity', field);
        }
    };
    check(actual, expected, 'execution');
}

function proofFor(session, artifact) {
    return receipt(session.identity, { kind: 'execution', runId: artifact.runId,
        text: JSON.stringify(artifact) });
}

module.exports = { buildExecution, loadExecutions, validateExecution, proofFor, readPinned };
