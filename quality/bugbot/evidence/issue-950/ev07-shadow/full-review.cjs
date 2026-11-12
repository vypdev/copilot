'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const plan = require('./plan.json');
const concurrency = 3;

async function run(campaign) {
    assert(campaign, 'usage: node full-review.cjs <campaign directory>');
    campaign = path.resolve(campaign);
    const output = path.join(campaign, 'full-review');
    const score = path.join(campaign, 'corpus-v3/corpus-score.json');
    const checkouts = path.join(campaign, 'fixtures/full-review');
    fs.mkdirSync(output);
    const ledger = path.join(output, 'slots.jsonl');
    const record = row => fs.appendFileSync(ledger, JSON.stringify(row) + '\n', { mode: 0o600 });
    const slots = Array.from({ length: plan.repositoryCohort.repetitions }, (_, index) =>
        plan.repositoryCohort.order.map(id => ({ id, repetition: index + 1 }))).flat();
    const blocked = () => fs.existsSync(score) && JSON.parse(fs.readFileSync(score, 'utf8')).passed === false;
    const running = new Set();
    let interrupted = false;
    let next = 0;
    const cancel = () => {
        interrupted = true;
        for (const child of running) child.kill('SIGTERM');
    };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    record({ event: 'start', at: new Date().toISOString(), planned: slots.length, concurrency, implementation: plan.implementation });
    try {
        async function worker() {
            while (next < slots.length && !interrupted && !blocked()) {
                const slot = slots[next++];
                const name = slot.id + '-' + slot.repetition;
                const destination = path.join(output, name + '.jsonl');
                const log = fs.openSync(path.join(output, name + '.log'), 'wx', 0o600);
                record({ event: 'slot-start', ...slot });
                try {
                    const child = spawn(process.execPath, [path.join(__dirname, 'review.cjs'), path.join(checkouts, slot.id),
                        slot.id, String(slot.repetition), destination], { stdio: ['ignore', log, log] });
                    running.add(child);
                    const exit = await new Promise(resolve => {
                        child.once('error', error => resolve({ error: error.code ?? error.name }));
                        child.once('close', (code, signal) => resolve({ code, signal }));
                    });
                    running.delete(child);
                    record({ event: 'slot-finish', ...slot, exit });
                } finally { fs.closeSync(log); }
            }
        }
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        for (const slot of slots.slice(next)) record({ event: 'not-started', ...slot,
            reason: interrupted ? 'explicit-cancellation' : 'independent-corpus-gate-failed' });
        record({ event: 'finish', admitted: next, unstarted: slots.length - next, interrupted });
    } finally {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
    }
}

run(process.argv[2]).catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
