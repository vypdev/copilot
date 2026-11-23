'use strict';

// The image-bound init reaps adopted children; its direct Node child owns the
// outer lifetime/IPC. Worker/model stdout is never authority.
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');

function runSupervisor() {
    assert.equal(process.platform, 'linux');
    assert(process.pid > 1, 'qualification supervisor requires the image-bound init');
    assert.equal(process.ppid, 1, 'qualification supervisor must be the init primary child');
    assert.equal(process.getuid(), 0, 'supervisor identity must be separate from the worker');
    assert.equal(process.execPath, '/usr/local/bin/node');
    assert.equal(process.argv.length, 4);
    const workerUid = Number(process.argv[2]), workerGid = Number(process.argv[3]);
    assert(Number.isSafeInteger(workerUid) && workerUid > 0 && Number.isSafeInteger(workerGid) && workerGid > 0);
    assert.deepEqual(fs.readFileSync('/proc/1/cmdline', 'utf8').split('\0').filter(Boolean),
        ['/usr/bin/tini', '--', '/usr/local/bin/node', '/qualification-supervisor.cjs', String(workerUid), String(workerGid)]);
    let terminal = false, ready;
    const end = code => {
        if (terminal) return;
        terminal = true;
        // Exiting its primary child makes the image-bound tini exit; Linux then
        // terminates EVERY namespace member, including escaped descendants.
        // The outer owner still requires actual init-exit/stop confirmation.
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
            if (ready || Object.keys(message).length !== 2 || typeof message.correlation !== 'string'
                || !/^[a-f0-9]{64}$/u.test(message.correlation)) return end(1);
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
