'use strict';

// Test-only observation for the retained CI journal waits. Never record
// arguments, file paths, contents, tokens or environment values, and never
// change completion, retries, timers or product filesystem behavior.
const filesystem = require('node:fs/promises');
const { performance } = require('node:perf_hooks');

function installJournalIoDiagnostics() {
    const { beforeEach, afterEach, afterAll } = globalThis;
    const originals = new Map();
    let rows = [], omitted = 0, testOrdinal = 0;
    const active = new Set();
    const retain = row => {
        if (rows.length === 128) { rows.shift(); omitted += 1; }
        rows.push(row);
    };
    const wrap = (target, key, label, shared) => {
        const original = target[key];
        const wrapped = async function (...args) {
            const row = { method: label, testOrdinal, started: performance.now() };
            retain(row); active.add(row);
            try {
                const result = await original.apply(this, args);
                if (key === 'open') for (const method of ['writeFile', 'sync', 'close']) wrap(result, method, `handle.${method}`, false);
                row.ok = true;
                return result;
            } catch (error) {
                row.ok = false;
                row.failure = ['EACCES', 'EEXIST', 'ENOENT', 'EIO', 'EPERM'].includes(error?.code) ? error.code : 'other';
                throw error;
            } finally {
                row.ms = performance.now() - row.started;
                active.delete(row);
            }
        };
        if (shared) originals.set(key, { original, wrapped });
        target[key] = wrapped;
    };
    for (const method of ['mkdir', 'lstat', 'open', 'readFile', 'rename', 'unlink']) wrap(filesystem, method, `fs.${method}`, true);
    beforeEach(() => { testOrdinal += 1; rows = []; omitted = 0; });
    afterEach(() => {
        const now = performance.now();
        const evidence = [...new Set([...rows.filter(row => row.ms >= 250), ...active])];
        if (!evidence.length) return;
        // One bounded diagnostic per slow/unfinished test, without imposing
        // an elapsed-time stop. Pending rows remain identified as pending.
        console.warn('Journal I/O observation', JSON.stringify({
            observationOnly: true, testOrdinal, retained: rows.length, omitted,
            pending: active.size,
            phases: evidence.slice(-32).map(row => ({ method: row.method, testOrdinal: row.testOrdinal,
                ms: Math.round(row.ms ?? now - row.started),
                state: row.ms === undefined ? 'pending' : row.ok ? 'completed' : 'rejected',
                ...(row.failure ? { failure: row.failure } : {}) })),
        }));
    });
    afterAll(() => {
        for (const [method, { original, wrapped }] of originals) if (filesystem[method] === wrapped) filesystem[method] = original;
    });
}

module.exports = { installJournalIoDiagnostics };
