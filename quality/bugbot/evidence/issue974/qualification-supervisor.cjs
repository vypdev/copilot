'use strict';

// This immutable image entrypoint is namespace PID1. Only its outer owner's
// attached stdin controls lifetime; worker/model stdout is never authority.
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');

function runSupervisor() {
    assert.equal(process.platform, 'linux');
    assert.equal(process.pid, 1, 'qualification supervisor must own its PID namespace');
    assert.equal(process.getuid(), 0, 'supervisor identity must be separate from the worker');
    assert.equal(process.execPath, '/usr/local/bin/node');
    assert.equal(process.argv.length, 4);
    const workerUid = Number(process.argv[2]), workerGid = Number(process.argv[3]);
    assert(Number.isSafeInteger(workerUid) && workerUid > 0 && Number.isSafeInteger(workerGid) && workerGid > 0);
    let terminal = false, ready;
    const end = code => {
        if (terminal) return;
        terminal = true;
        // Linux terminates EVERY member when namespace init exits, including
        // setsid/double-fork/reparented children with inherited or ignored pipes.
        // The outer owner still has to inspect/wait for stopped confirmation.
        process.exit(code);
    };
    process.stdin.once('end', () => end(143));
    process.stdin.once('error', () => end(143));
    process.stdin.once('data', () => end(1));
    process.stdin.resume();
    process.once('SIGTERM', () => end(143));
    process.once('SIGINT', () => end(130));
    const worker = fork('/qualification-bootstrap.cjs', [], {
        cwd: '/sdk', env: { PATH: '/opt/codex/node_modules/.bin:/usr/local/bin:/usr/bin:/bin', BUGBOT_VERIFICATION_MODE: 'disabled' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    worker.stdout.pipe(process.stdout); worker.stderr.pipe(process.stderr);
    worker.once('error', () => end(1));
    // Do not wait for close: an escaped descendant can retain these pipes.
    worker.once('exit', () => end(1));
    worker.on('message', message => {
        if (!message || typeof message !== 'object' || Array.isArray(message)) return end(1);
        if (message.kind === 'scope-ready') {
            if (ready || Object.keys(message).length !== 2 || !/^[a-f0-9]{64}$/u.test(message.correlation)) return end(1);
            ready = message.correlation;
            worker.send({ kind: 'scope-ready-accepted', correlation: ready });
            return;
        }
        if (!ready || message.correlation !== ready || Object.keys(message).length !== 3) return end(1);
        if (message.kind === 'scope-stop' && ['failed', 'cancelled'].includes(message.reason)) {
            return end(message.reason === 'cancelled' ? 130 : 1);
        }
        if (message.kind === 'scope-complete' && message.reason === 'completed') return end(0);
        return end(1);
    });
    // This OS-owner selection travels only over the private fork IPC. The
    // bootstrap must independently authenticate its whole immutable input and
    // drop supplementary groups/gid/uid before importing application code.
    worker.send({ kind: 'scope-owner', workerUid, workerGid });
}

module.exports = { runSupervisor };
if (require.main === module) {
    try { runSupervisor(); } catch { process.exitCode = 1; }
}
