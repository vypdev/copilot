'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createInstalledOfficialReader } = require('../../../../../src/infrastructure/bugbot/shadow/installed_official.cjs');

const hash = data => createHash('sha256').update(data).digest('hex');
const planBytes = readFileSync(path.join(__dirname, '../installed-profile/plan.json'));
const plan = JSON.parse(planBytes);
const reader = createInstalledOfficialReader();
const sources = new Map();

async function verify(repository, ledger) {
    assert(repository && ledger, 'usage: node audit.cjs <local-domus-object-store> <ledger.jsonl>');
    const git = (...args) => execFileSync('git', ['--no-optional-locks', '--no-replace-objects', '-C', repository, ...args], { encoding: 'utf8' });
    const events = readFileSync(ledger, 'utf8').trimEnd().split('\n').map(JSON.parse);
    assert.equal(events[0].planSha256, hash(planBytes));
    assert.deepEqual(events.at(-1), { event: 'finished', checkoutUnchanged: true, githubMutationPorts: 0, githubWriteAttempts: 0 });
    assert.equal(git('rev-parse', plan.head + '^{tree}').trim(), plan.tree);
    assert.equal(git('rev-parse', plan.base + '^{tree}').trim(), plan.baseTree);
    const rows = [];
    for (const { candidate, wallMs, result } of events.filter(event => event.event === 'result')) {
        const counts = { git: 0, official: 0, ci: 0 };
        for (const citation of result.citations ?? []) {
            const delivery = result.investigation.evidence.flatMap(entry => entry.delivered).find(proof =>
                proof.receipt === citation.receipt && proof.sha === citation.sha && proof.path === citation.path
                && proof.url === citation.url && proof.first <= citation.first && proof.last >= citation.last);
            assert(delivery, 'citation outside delivered evidence');
            assert([plan.head, plan.base].includes(citation.sha), 'foreign revision');
            if (citation.kind === 'git') {
                const lines = git('show', citation.sha + ':' + citation.path).replace(/\n$/u, '').split(/\r?\n/u);
                assert.equal(hash(lines.slice(citation.first - 1, citation.last).join('\n')), citation.textSha256);
            } else if (citation.kind === 'official') {
                const key = citation.package + '@' + citation.version;
                if (!sources.has(key)) sources.set(key, reader.sources(citation.package, citation.version));
                const documents = await sources.get(key);
                const document = documents.find(item => item.url === citation.url && item.sha256 === citation.sha256);
                assert(document, 'unverified official origin');
                assert.equal(hash(document.lines.slice(citation.first - 1, citation.last).join('\n')), citation.textSha256);
                if (citation.lockfile) assert.equal(git('rev-parse', citation.sha + ':' + citation.lockfile).trim(), citation.lockBlob);
            } else {
                assert.equal(citation.kind, 'ci');
                assert.equal(citation.sha, plan.head);
                const { jobs } = JSON.parse(execFileSync('gh', ['api',
                    `repos/${plan.repository}/actions/runs/${citation.runId}/attempts/${citation.attempt}/jobs`], { encoding: 'utf8' }));
                const job = jobs.find(item => item.id === citation.jobId);
                assert(job && job.head_sha === citation.sha && job.run_attempt === citation.attempt);
                const step = job.steps.find(item => item.number === citation.stepNumber);
                assert(step && step.name === citation.step);
                assert.deepEqual([citation.first, citation.last], [4, 4]);
                assert.equal(hash(`Step ${step.number} ${step.name}: ${step.status}, conclusion ${step.conclusion ?? 'pending'}.`), citation.textSha256);
            }
            counts[citation.kind]++;
        }
        const turns = events.filter(row => row.event === 'provider-turn' && row.candidate === candidate);
        assert(turns.every(turn => !turn.invocation || (turn.invocation.model === 'gpt-6.1-sol'
            && turn.invocation.reasoningEffort === 'xhigh' && turn.invocation.sandbox === 'read-only')));
        rows.push({ candidate, wallMs, verdict: result.verdict ?? null, status: result.status, turns: turns.length, counts });
    }
    assert.equal(rows.length, events[0].mode === 'controlled-ci' ? 1 : plan.cases.length);
    console.log(JSON.stringify(rows, null, 2));
}

verify(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
