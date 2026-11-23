import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
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

describe('publisher977-C105: UDP package transport fences', () => {
  it.each((['send', 'sendto'] as const).flatMap(operation => [false, true].map(guarded => ({ operation, guarded }))))(
    '$operation guarded=$guarded has a real loopback positive control and cannot send through the guard', async ({ operation, guarded }) => {
      const directory = await mkdtemp(join(tmpdir(), 'publisher-guard-udp-'));
      const receiver = createSocket('udp4');
      let packets = 0;
      let delivered!: () => void;
      const packet = new Promise<void>(resolve => { delivered = resolve; });
      receiver.on('message', bytes => { expect(bytes.toString()).toBe('controlled-fixture'); packets++; delivered(); });
      try {
        await new Promise<void>((resolve, reject) => { receiver.once('error', reject); receiver.bind(0, '127.0.0.1', resolve); });
        const address = receiver.address();
        const report = join(directory, 'guard.json');
        const args = operation === 'send' ? "Buffer.from('controlled-fixture'), port, '127.0.0.1'"
          : "Buffer.from('controlled-fixture'), 0, 18, port, '127.0.0.1'";
        const script = `${guarded ? 'require(' + JSON.stringify(guard) + ');' : ''}
          const socket = require('node:dgram').createSocket('udp4'), port = ${address.port};
          try { socket.${operation}(${args}, error => { if(error) throw error; process.stdout.write('delivered'); socket.close(); }); }
          catch (error) { if(error.message !== 'Packaged publisher negative control attempted an effect.') throw error; process.stdout.write('blocked'); }`;
        const child = spawn(process.execPath, ['-e', script], { cwd: root,
          env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].includes(key))), COPILOT_PUBLISHER_GUARD_REPORT: report }, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
        const terminal = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
          child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
        });
        if (stdout === 'delivered') await packet;
        expect(terminal).toEqual({ code: 0, signal: null }); expect(stderr).toBe('');
        expect(stdout).toBe(guarded ? 'blocked' : 'delivered'); expect(packets).toBe(guarded ? 0 : 1);
        if (guarded) expect(JSON.parse(await readFile(report, 'utf8'))).toEqual({
          networkAttempts: ['datagram.' + operation], filesystemWrites: [], childProcesses: [], listeners: [], undiciRequests: 0, exitCode: 0,
        });
      } finally { receiver.close(); await rm(directory, { recursive: true, force: true }); }
    },
  );
  it.each(['bind', 'connect'] as const)('blocks UDP %s before creating a listener or connected socket', async operation => {
    const directory = await mkdtemp(join(tmpdir(), 'publisher-guard-udp-state-'));
    const report = join(directory, 'guard.json');
    try {
      const script = `require(${JSON.stringify(guard)}); const socket = require('node:dgram').createSocket('udp4');
        try { socket.${operation}(${operation === 'bind' ? 0 : 9}, '127.0.0.1'); throw new Error('not fenced'); }
        catch (error) { if(error.message !== 'Packaged publisher negative control attempted an effect.') throw error; }`;
      const child = spawn(process.execPath, ['-e', script], { cwd: root,
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].includes(key))), COPILOT_PUBLISHER_GUARD_REPORT: report }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = ''; child.stderr.on('data', chunk => { stderr += String(chunk); });
      const terminal = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
      });
      expect(terminal).toEqual({ code: 0, signal: null }); expect(stderr).toBe('');
      const observations = JSON.parse(await readFile(report, 'utf8'));
      expect(observations.networkAttempts).toEqual(operation === 'connect' ? ['datagram.connect'] : []);
      expect(observations.listeners).toEqual(operation === 'bind' ? ['datagram.bind'] : []);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe('publisher977-C116: native DNS package transport fences', () => {
  it.each((['callback', 'promise', 'callback-resolver', 'promise-resolver'] as const)
    .flatMap(surface => [false, true].map(guarded => ({ surface, guarded }))))(
    '$surface guarded=$guarded observes a real local DNS query and denies dispatch through the guard', async ({ surface, guarded }) => {
      const directory = await mkdtemp(join(tmpdir(), 'publisher-guard-dns-'));
      const receiver = createSocket('udp4');
      let packets = 0;
      receiver.on('message', (query, peer) => {
        packets++;
        // Echo the controlled question with NXDOMAIN, without recursion or an
        // upstream server. Native c-ares, rather than JS dgram, sends the query.
        const response = Buffer.from(query);
        response.writeUInt16BE(0x8183, 2);
        response.writeUInt16BE(0, 6); response.writeUInt16BE(0, 8); response.writeUInt16BE(0, 10);
        receiver.send(response, peer.port, peer.address);
      });
      try {
        await new Promise<void>((resolve, reject) => { receiver.once('error', reject); receiver.bind(0, '127.0.0.1', resolve); });
        const report = join(directory, 'guard.json');
        const promise = surface.startsWith('promise');
        const instance = surface.endsWith('resolver');
        const script = `const dns = require(${JSON.stringify(promise ? 'node:dns/promises' : 'node:dns')});
          const resolver = ${instance ? 'new dns.Resolver({timeout: 200, tries: 1})' : 'dns'};
          resolver.setServers([${JSON.stringify(`127.0.0.1:${receiver.address().port}`)}]);
          ${guarded ? `require(${JSON.stringify(guard)});` : ''}
          const complete = error => {
            if(error && error.message === 'Packaged publisher negative control attempted an effect.') process.stdout.write('blocked');
            else if(error && error.code === 'ENOTFOUND') process.stdout.write('delivered');
            else { console.error('Unexpected controlled DNS result', error && error.code); process.exitCode = 2; }
          };
          try { ${promise ? "resolver.resolve4('controlled.invalid').then(() => complete(), complete);" : "resolver.resolve4('controlled.invalid', complete);"} }
          catch (error) { complete(error); }`;
        const child = spawn(process.execPath, ['-e', script], { cwd: root,
          env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].includes(key))), COPILOT_PUBLISHER_GUARD_REPORT: report }, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
        const terminal = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
          child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
        });
        expect(terminal).toEqual({ code: 0, signal: null }); expect(stderr).toBe('');
        expect(stdout).toBe(guarded ? 'blocked' : 'delivered'); expect(packets).toBe(guarded ? 0 : 1);
        if (guarded) expect(JSON.parse(await readFile(report, 'utf8'))).toEqual({
          networkAttempts: [`dns.${surface}.resolve4`], filesystemWrites: [], childProcesses: [], listeners: [], undiciRequests: 0, exitCode: 0,
        });
      } finally { receiver.close(); await rm(directory, { recursive: true, force: true }); }
    },
  );
});
