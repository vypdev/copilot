import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const guard = join(root, 'test-support/setup-publisher-package-guard.cjs');

describe('publisher package guard before Undici socket dispatch', () => {
  it.each((['native-fetch', 'dependency-undici'] as const).flatMap(transport =>
    [false, true].map(guarded => ({ transport, guarded }))))(
    '$transport guarded=$guarded uses a real loopback positive control and denies connections before dispatch', async ({ transport, guarded }) => {
      const directory = await mkdtemp(join(tmpdir(), 'publisher-guard-transport-'));
      let connections = 0, requests = 0;
      const server = createServer((_request, response) => { requests++; response.end('controlled-fixture'); });
      server.on('connection', () => { connections++; });
      try {
        await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing controlled loopback address.');
        const report = join(directory, 'guard.json');
        // Capture native fetch before preload to bypass the guard's global-fetch
        // replacement deliberately. Both transports must still hit its socket fence.
        // Resolve inside the native child. Jest also replaces createRequire
        // resolution and maps @actions/github to its provider fake in this host.
        const script = `const nativeFetch = globalThis.fetch;
          const { createRequire } = require('node:module');
          const github = createRequire(require.resolve('@actions/github'));
          const core = createRequire(github.resolve('@octokit/core'));
          const request = createRequire(core.resolve('@octokit/request'));
          const undici = request.resolve('undici');
          ${guarded ? `require(${JSON.stringify(guard)});` : ''}
          const fetch = ${transport === 'native-fetch' ? 'nativeFetch' : 'require(undici).fetch'};
          fetch(${JSON.stringify(`http://127.0.0.1:${address.port}/controlled`)}).then(async response => {
            if (await response.text() !== 'controlled-fixture') process.exitCode = 2;
            else process.stdout.write('delivered');
          }, () => process.stdout.write('blocked'));`;
        const env = Object.fromEntries(Object.entries(process.env)
          .filter(([key]) => ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].includes(key)));
        const child = spawn(process.execPath, ['-e', script], { cwd: root,
          env: { ...env, COPILOT_PUBLISHER_GUARD_REPORT: report }, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
        const terminal = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
          child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
        });
        expect(terminal).toEqual({ code: 0, signal: null }); expect(stderr).toBe('');
        expect(stdout).toBe(guarded ? 'blocked' : 'delivered');
        expect(connections).toBe(guarded ? 0 : 1); expect(requests).toBe(guarded ? 0 : 1);
        if (guarded) {
          expect(JSON.parse(await readFile(report, 'utf8'))).toEqual({ networkAttempts: ['socket.connect'],
            filesystemWrites: [], childProcesses: [], listeners: [], undiciRequests: 1, exitCode: 0 });
        }
      } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
        await rm(directory, { recursive: true, force: true });
      }
    });
});
