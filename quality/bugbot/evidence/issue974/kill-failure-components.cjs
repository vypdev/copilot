'use strict';
// Real Unix HTTP transport and owned wait/attachment closures; Engine state is modeled.
// No Docker, CLI, SDK or model execution is established by these controls.
const assert = require('node:assert/strict');
const { withEngineFixture } = require('./engine-transport-components.cjs');
async function exerciseKillFailure() {
    const rows = [];
    for (const lostReply of [false, true]) {
        const name = lostReply ? 'lost SIGKILL response' : 'rejected SIGKILL request';
        try {
            await withEngineFixture({ ignoreLifetimeEof: true, escalateOnWait: true,
                ...(lostReply ? { lostKillReply: true } : { httpFailure: '/containers/' + 'f'.repeat(64) + '/kill?signal=SIGKILL' }) }, async f => {
                const scope = await f.create(); await scope.start();
                const stopped = scope.stop('cancelled'); void stopped.catch(() => undefined);
                assert.equal(scope.stop('failed'), stopped, 'failed cancellation must not replay termination');
                let timer;
                // Fixture dispatches the existing force timer immediately. This deadline
                // bounds this model-free assertion only, not research or production work.
                const bound = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('stop remained pending after the failed SIGKILL response')), 1000); });
                try { await assert.rejects(Promise.race([stopped, bound]), lostReply ? /socket hang up|ECONNRESET/u : /Owned engine request failed: HTTP 500/u); }
                finally { clearTimeout(timer); }
                assert.equal(f.running, true); assert.equal(f.removed, false);
                assert.equal(f.events.some(e => e.event === 'scope-stopped' || e.event === 'scope-removed'), false);
                await assert.rejects(scope.remove(), /confirm stopped/u);
                assert.equal(f.requests.filter(q => q.route.includes('/kill?')).length, 1);
                assert.equal(f.requests.filter(q => q.method === 'DELETE').length, 0);
                assert.equal(f.activeClientRequests, 0, 'owned wait requests must be quiescent');
                assert.equal(f.ownerChannelClosed, true, 'owner lifetime channel must be closed');
            });
            rows.push({ name, passed: true });
        } catch (error) { rows.push({ name, passed: false, message: error.message }); }
    }
    const result = { kind: 'modeled Engine failed-force cancellation controls', rows,
        passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length,
        nativeAcceptance: false, scientificCalls: 0 };
    console.log(JSON.stringify(result)); assert.equal(result.failed, 0); return result;
}
module.exports = { exerciseKillFailure };
if (require.main === module) exerciseKillFailure().catch(error => { console.error(error.message); process.exitCode = 1; });
