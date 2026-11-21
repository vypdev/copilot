'use strict';

if (require.main === module) throw new Error('Use the independently reviewed immutable bootstrap; direct qualification runners are unsupported.');

const { spawnQualificationDriver } = require('../execution-provenance.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { requirePassingCorpus } = require('./launch-full-review.cjs');
const { qualificationProvenance, selectedPlanProvenance } = require('./implementation.cjs');

const plan = require('./configuration.cjs');
const concurrency = 3;

async function run(campaign) {
    require('../execution-provenance.cjs').requireBootstrapAdmission(path.resolve(__dirname, '../../../../..'));
    campaign = requirePassingCorpus(campaign);
    const provenance = qualificationProvenance(plan);
    const implementation = provenance.implementation;
    const preregistration = selectedPlanProvenance();
    const output = path.join(campaign, 'full-review');
    const score = path.join(campaign, 'corpus-v3/corpus-score.json');
    const checkouts = path.join(campaign, 'fixtures/full-review');
    fs.mkdirSync(output);
    const ledger = path.join(output, 'slots.jsonl');
    const record = plan.schemaVersion === 2 ? require('../../issue974/attempt-ledger.cjs').createDurableRecorder(ledger)
        : row => fs.appendFileSync(ledger, JSON.stringify(row) + '\n', { mode: 0o600 });
    const slots = Array.from({ length: plan.repositoryCohort.repetitions }, (_, index) =>
        plan.repositoryCohort.order.map(id => ({ id, repetition: index + 1 }))).flat();
    const blocked = () => fs.existsSync(score) && JSON.parse(fs.readFileSync(score, 'utf8')).passed === false;
    const running = new Set();
    let interrupted = false, failed = false;
    const scopeCancel = new AbortController();
    let next = 0;
    const cancel = () => {
        interrupted = true;
        scopeCancel.abort();
        for (const child of running) child.kill('SIGTERM');
    };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
        record({ event: 'start', at: new Date().toISOString(), planned: slots.length, concurrency, implementation, provenance,
            plan: preregistration.sha256, preregistration });
        for (const slot of slots) record({ event: 'slot-planned', ...slot, status: 'not-started' });
        async function worker() {
            while (next < slots.length && !scopeCancel.signal.aborted && !blocked()) {
                const slot = slots[next++];
                const name = slot.id + '-' + slot.repetition;
                const destination = path.join(output, name + '.jsonl');
                const log = fs.openSync(path.join(output, name + '.log'), 'wx', 0o600);
                try {
                    record({ event: 'slot-start', ...slot });
                    if (plan.containment) {
                        const exit = await runContainedReview(campaign, slot, destination, record, scopeCancel.signal);
                        if (exit.code !== 0) { failed = true; scopeCancel.abort(); }
                        record({ event: 'slot-finish', ...slot, exit });
                        continue;
                    }
                    const child = spawnQualificationDriver('review', [path.join(checkouts, slot.id),
                        slot.id, String(slot.repetition), destination], { stdio: ['ignore', log, log] });
                    running.add(child);
                    const exit = await new Promise(resolve => {
                        child.once('error', error => resolve({ error: error.code ?? error.name }));
                        child.once('close', (code, signal) => resolve({ code, signal }));
                    });
                    running.delete(child);
                    if (exit.code !== 0 || exit.signal || exit.error) failed = true;
                    record({ event: 'slot-finish', ...slot, exit });
                } finally { fs.closeSync(log); }
            }
        }
        // A collector/copy failure cannot let the outer owner return while a
        // sibling operation is still alive. Abort all owned scopes and settle
        // every dispatched worker before removing cancellation listeners.
        await Promise.allSettled(Array.from({ length: concurrency }, () => worker().catch(error => {
            failed = true; scopeCancel.abort();
            record({ event: 'collector-failure', reason: error?.code ?? error?.name ?? 'unknown' });
        })));
        for (const slot of slots.slice(next)) record({ event: 'not-started', ...slot,
            reason: interrupted ? 'explicit-cancellation' : failed ? 'operation-or-evidence-failed' : 'independent-corpus-gate-failed' });
        record({ event: 'finish', admitted: next, unstarted: slots.length - next, interrupted, failed });
        return interrupted ? 130 : failed ? 1 : 0;
    } finally {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
    }
}

async function runContainedReview(campaign, slot, output, record, signal) {
    const root = path.resolve(__dirname, '../../../../..');
    const sidecar = require('../../issue974/attempt-ledger.cjs').createDurableRecorder(output + '.scopes.jsonl');
    const directory = output + '.operation'; let stopped = false;
    try {
        const terminal = await require('../../issue974/operation-containment.cjs').runContainedOperation({
            root, plan, mode: 'review', slot: { subjectId: slot.id, repetition: slot.repetition },
            outputDirectory: directory, campaign, signal,
            async record(event) {
                await record({ ...event, slot }); await sidecar(event);
                if (event.event === 'scope-stopped' && event.namespaceInitStopped === true) stopped = true;
            },
        });
        return { code: terminal.interrupted ? 130 : terminal.exitCode, signal: null, namespaceInitStopped: terminal.namespaceInitStopped };
    } catch { return { code: signal.aborted ? 130 : 1, signal: null, namespaceInitStopped: stopped,
        error: stopped ? 'contained-operation-failed' : 'owned-scope-unconfirmed' }; }
    finally {
        if (stopped) {
            const inner = path.join(directory, 'review.jsonl');
            if (fs.existsSync(inner)) fs.copyFileSync(inner, output, fs.constants.COPYFILE_EXCL);
            for (const suffix of ['.attempts', '.verifier-attempts']) if (fs.existsSync(inner + suffix)) {
                fs.cpSync(inner + suffix, output + suffix, { recursive: true, verbatimSymlinks: true, dereference: false });
            }
        }
    }
}

module.exports = { run };
