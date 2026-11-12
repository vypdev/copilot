'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [repository, ledger = path.join(__dirname, 'trials.jsonl')] = process.argv.slice(2);
assert(repository, 'usage: node audit.cjs <local-domus-object-store> [ledger.jsonl]');
const hash = value => createHash('sha256').update(value).digest('hex');
const planBytes = fs.readFileSync(path.join(__dirname, 'plan.json'));
const plan = JSON.parse(planBytes);
const events = fs.readFileSync(ledger, 'utf8').trimEnd().split('\n').map(JSON.parse);
assert.equal(events[0].planSha256, hash(planBytes));
const git = (...args) => execFileSync('git', ['--no-optional-locks', '--no-replace-objects', '-C', repository, ...args], { encoding: 'utf8' });
assert.equal(git('rev-parse', plan.head + '^{tree}').trim(), plan.tree);
assert.equal(git('rev-parse', plan.base + '^{tree}').trim(), plan.baseTree);
const outcomes = events.filter(event => event.event === 'result');
assert.deepEqual(outcomes.map(row => row.candidate).sort(), plan.cases.map(item => item.candidateId).sort());
const results = outcomes.map(({ candidate, wallMs, result }) => {
    const turns = events.filter(row => row.event === 'provider-turn' && row.candidate === candidate);
    assert(turns.length);
    for (const { invocation, reportedModel } of turns) {
        if (!invocation) continue;
        assert.deepEqual(invocation, { model: 'gpt-6.1-sol', modelProvider: 'openai', reasoningEffort: 'xhigh', sandbox: 'read-only' });
        if (reportedModel) assert.equal(reportedModel, invocation.model);
    }
    let validCitations = 0;
    for (const citation of result.citations ?? []) {
        const delivery = result.investigation.evidence.flatMap(entry => entry.delivered)
            .find(entry => entry.receipt === citation.receipt && entry.sha === citation.sha && entry.path === citation.path
                && entry.first <= citation.first && entry.last >= citation.last);
        assert(delivery, 'citation outside delivered evidence');
        assert.equal(citation.kind, 'git');
        assert.equal(citation.sha, plan.head);
        const lines = git('show', citation.sha + ':' + citation.path).replace(/\n$/u, '').split(/\r?\n/u);
        assert.equal(hash(lines.slice(citation.first - 1, citation.last).join('\n')), citation.textSha256);
        validCitations++;
    }
    return { candidate, status: result.status, verdict: result.verdict, wallMs, turns: turns.length,
        validCitations, reportedModel: result.reportedModel ?? null };
});
assert.deepEqual(events.at(-1), { event: 'finished', checkoutUnchanged: true, githubMutationPorts: 0, githubWriteAttempts: 0 });
console.log(JSON.stringify(results, null, 2));
