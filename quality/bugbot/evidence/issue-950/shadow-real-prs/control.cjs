'use strict';

const assert = require('node:assert/strict');
const { git, blob, makeBroker } = require('./broker.cjs');
const { investigate, preflight, subjects } = require('./run.cjs');
const { assertStrictOutputSchema } = require('../../../../../src/application/policies/agent_execution/strict_output_schema_policy.ts');
const schema = require('./schema.cjs');
const { dryRunPorts } = require('../on-demand/contract.cjs');

const query = (op, target, extra = {}) => ({ op, target, revision: 'head', scope: null, first: null, last: null,
    version: null, basis: null, query: null, why: 'Resolve the tracked premise.', ...extra });

async function control(lab) {
    assertStrictOutputSchema(schema);
    const checks = preflight(lab);
    const { subject, finding } = subjects.find(x => x.finding.id === '4452825495');
    const finder = makeBroker(lab, subject, finding);
    assert.equal(finder.inspect(query('search', 'toBeEnabled')).status, 'matches');
    assert.equal(finder.inspect(query('read', '.git/config')).status, 'path-denied');
    assert.equal(finder.inspect(query('read', '../local')).status, 'path-denied');
    assert.equal(finder.inspect(query('search', 'abc', { scope: '/etc' })).status, 'scope-denied');
    assert.equal(finder.inspect(query('read', 'pnpm-lock.yaml', { revision: 'base' })).status, 'base-denied');
    assert.equal(finder.inspect(query('official', 'playwright', { version: '1.64.1', query: 'toBeEnabled' })).status,
        'official-version-not-proven');
    const lock = finder.inspect(query('read', 'pnpm-lock.yaml', { first: 33, last: 35 })).sources[0];
    const docs = finder.inspect(query('official', 'playwright', { version: '1.64.1', basis: lock.receipt, query: 'toBeEnabled' }));
    assert.equal(docs.status, 'provided');
    assert.deepEqual(new Set(docs.sources.map(s => s.sourceKind)), new Set(['versioned-docs', 'release-source']));
    assert.equal(finder.inspect(query('official', 'playwright', { version: '1.0.0', basis: lock.receipt, query: 'toBeEnabled' })).status,
        'official-source-unavailable');
    assert.throws(() => finder.cite({ receipt: lock.receipt, first: 34, last: 36 }), /citation-unavailable-or-out-of-range/);
    assert.equal(finder.cite({ receipt: lock.receipt, first: 33, last: 35 }).sha, subject.head);
    const other = makeBroker(lab, subject, { ...finding, id: 'other' });
    assert.throws(() => other.cite({ receipt: lock.receipt, first: 33, last: 35 }), /citation-unavailable-or-out-of-range/);

    const allowed = subjects.find(x => x.finding.allowBase);
    const base = makeBroker(lab, allowed.subject, allowed.finding)
        .inspect(query('read', 'specs/household-administration.md', { revision: 'base', first: 1, last: 1 }));
    assert.equal(base.sources[0].sha, allowed.subject.base);
    const touched = [];
    const writes = dryRunPorts(name => touched.push(name));
    assert.throws(() => writes.publishReview(), /dry-run-write-port/);
    assert.deepEqual(touched, ['publishReview']);

    let turns = 0;
    const result = await investigate(lab, subject, finding, null, async request => {
        turns++;
        const fact = { failure: null, usage: { input_tokens: 40, output_tokens: 10 }, wallMs: 0 };
        if (turns === 1) {
            assert(!request.threadId);
            assert(!/suggested.fix|explicitly dismissed|potential problems/iu.test(request.prompt));
            return { threadId: 'same-finding-thread', fact, response: { action: 'investigate',
                requests: [query('read', 'pnpm-lock.yaml', { first: 33, last: 35 })],
                verdict: null, citations: [], reason: null, missing: null } };
        }
        assert.equal(request.threadId, 'same-finding-thread');
        const { observations } = JSON.parse(request.prompt.split('\n').at(-1));
        const source = observations[0].result.sources[0];
        return { threadId: request.threadId, fact, response: { action: 'finish', requests: [], verdict: 'refuted',
            citations: [{ receipt: source.receipt, first: 33, last: 35 }], reason: 'Simulated complete transport.', missing: null } };
    }, () => {});
    assert.equal(result.status, 'completed');
    assert.equal(result.answer.anchor.line, finding.detectorLocation.line);
    assert.equal(result.answer.citations[0].sha, subject.head);
    assert.deepEqual(result.writes, []);
    assert.equal(turns, 2);

    const domus = lab + '/domus.git';
    const doc = allowed.subject;
    const owner = blob(domus, doc.base, 'specs/household-administration.md');
    const reference = blob(domus, doc.head, allowed.finding.detectorLocation.path).lines[41];
    const mentioned = /Git blob `([a-f0-9]+)`/u.exec(reference)[1];
    assert.notEqual(mentioned, owner.blob);
    assert.equal(git(domus, ['cat-file', '-t', owner.blob]).trim(), 'blob');
    const roadmap = subjects.find(x => x.finding.id === '4500071416').subject;
    const corrected = 'e222212cda04890fb60831c9c3fad22ff04f8a2b';
    assert.match(blob(domus, roadmap.head, 'docs/roadmap.md').lines[25], /not yet wired into maintenance/u);
    assert.match(blob(domus, corrected, 'docs/roadmap.md').lines[25], /wires fixed and relative maintenance/u);
    const composition = 'backend/src/domus/composition/recurrence.py';
    assert.equal(blob(domus, roadmap.head, composition).blob, blob(domus, corrected, composition).blob);
    assert.match(blob(domus, roadmap.head, composition).lines.slice(38, 52).join('\n'), /relative=RelativeRunServices\([\s\S]*?\)\.tick\(/u);
    return { ...checks, zeroModelCalls: true, simulatedWrites: result.writes.length, intentionalWriteTrapCanary: touched,
        toolControls: ['whole-tree search', 'authorized base', 'denied base', 'protected paths', 'official version',
            'foreign and out-of-range citations', 'same-thread turn continuation', 'fixed anchor'],
        independentGitControls: { docBlob: { cited: mentioned, actual: owner.blob }, roadmap: { corrected, unchangedCompositionBlob: blob(domus, roadmap.head, composition).blob } } };
}
control(process.argv[2]).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {
    console.error(error); process.exitCode = 1;
});
