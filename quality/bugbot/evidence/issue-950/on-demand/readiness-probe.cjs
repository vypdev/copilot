'use strict';

// Evaluator-only probe against the installed, lock-authenticated v4 package.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { utils } = require(path.join(path.resolve(process.argv[2]), 'playwright-core/lib/coreBundle.js'));
const { URL } = require('node:url');

async function main() {
    let status;
    const server = http.createServer((_req, res) => { res.writeHead(status); res.end(); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    try {
        const observed = [];
        for (status of [502, 503, 200]) {
            observed.push(await utils.isURLAvailable(new URL(`http://127.0.0.1:${server.address().port}/__fixture__/ready`), false, () => {}, () => {}));
        }
        assert.deepEqual(observed, [false, false, true]);
        console.log('Playwright readiness 502/503/200:', observed);
    } finally {
        server.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
