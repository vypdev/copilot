import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
const http = require('node:http') as typeof import('node:http');
import * as yaml from 'js-yaml';

type Outcome = { stdout: string; stderr: string; exitCode: number | null; signal: string | null;
  error?: string; cancelled?: boolean; timedOut?: boolean; truncated?: boolean };
type Ports = Record<string, any>;
const policy = require('../../../scripts/lib/linux-sandbox-diagnostic-policy.cjs') as Ports;
const diagnostic = require('../../../scripts/diagnose-linux-sandbox-prerequisites.cjs') as Ports;
const digest = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const posixDescribe = process.platform === 'win32' ? describe.skip : describe;
const success = (stdout = ''): Outcome => ({ stdout, stderr: '', exitCode: 0, signal: null });

function modeledPorts(): Ports {
  const controller = new AbortController();
  return { signal: controller.signal, controller, identity: { sourceCommit: 'a'.repeat(40) },
    prepare: jest.fn(async () => ({ version: '0.171.0', identity: { executableSha256: 'b'.repeat(64) },
      codex: '/private/owned/codex', node: '/private/owned/node', fixture: '/private/owned/fixture',
      writeTarget: '/private/owned/write', fixtureSha256: 'c'.repeat(64) })),
    execute: jest.fn(async (executable: string, args: string[]) => success(args.includes('-e')
      ? args.some(value => value.includes('owned-write-canary')) ? 'DENIED' : 'c'.repeat(64) : '')),
    writeAbsent: jest.fn(async () => true), project: (value: string) => policy.outputProjection(value, '/private/owned'),
    engine: jest.fn(async () => ({ state: 'unavailable', cause: 'local-engine-unavailable' })),
    release: jest.fn(async () => undefined) };
}

describe('Linux sandbox diagnostic outcome policy', () => {
  it.each([
    ['verified command', success(), undefined, 'pass', 'verified'],
    ['verified assertion', success('expected\n'), 'expected', 'pass', 'verified'],
    ['wrong assertion', success('other'), 'expected', 'fail', 'assertion-mismatch'],
    ['actual nonzero', { ...success(), exitCode: 37 }, undefined, 'fail', 'command-failed'],
    ['signal', { ...success(), exitCode: null, signal: 'SIGHUP' }, undefined, 'fail', 'command-failed'],
    ['unknown status', { ...success(), exitCode: null }, undefined, 'fail', 'command-failed'],
    ['contradictory signal', { ...success(), signal: 'untrusted\ncontent' }, undefined, 'fail', 'command-failed'],
    ['missing tool', { ...success(), exitCode: null, error: 'ENOENT' }, undefined, 'unavailable', 'missing-tool'],
    ['launch error with zero', { ...success(), error: 'EACCES' }, undefined, 'unavailable', 'launch-unavailable'],
    ['cancellation with zero', { ...success(), cancelled: true }, undefined, 'cancelled', 'cancelled'],
    ['timeout with zero', { ...success(), timedOut: true }, undefined, 'fail', 'technical-timeout'],
    ['truncated success', { ...success(), truncated: true }, undefined, 'fail', 'output-incomplete'],
  ])('%s retains its distinct real state', (name, result, expected, state, reason) => {
    expect(policy.observation('codex-path-start', result, expected)).toMatchObject({ state, reason });
  });

  it('fixes the exact official release identities and rejects unknown architecture/probe/input', () => {
    expect(policy.archiveFor('x64')).toMatchObject({ version: '0.171.0', bytes: 122664925,
      sha256: '01baa2e47809f8597be5b2f8abd4e4dfe3fb5bcb6e504c2fbaaad97056c15e8d' });
    expect(policy.archiveFor('arm64').sha256).toBe('bcf50b836385e51bd2976ab2bbe92b1b08a1cbe37712eb8dbe378aa78d24871c');
    expect(() => policy.archiveFor('constructor')).toThrow();
    expect(() => policy.observation('claimed-pass', success())).toThrow();
    expect(() => policy.notRun('codex-path-start', 'already-qualified')).toThrow();
    expect(() => policy.outputProjection('text', '')).toThrow();
  });

  it('projects account/private paths and keeps diagnostic facts distinct from qualification', () => {
    const text = policy.outputProjection('/private/owned/a /home/example/a /Users/example/a EPERM', '/private/owned');
    expect(text).toBe('<diagnostic-root>/a /<account>/a /<account>/a EPERM');
    const summary = policy.renderSummary({ preparation: { state: 'failed' }, probes: [
      policy.notRun('codex-path-start', 'preparation-failed'), policy.observation('codex-empty-start', { ...success(), signal: 'SIGTERM' }),
    ] });
    expect(summary).toContain('not-run (preparation-failed)');
    expect(summary).toContain('| SIGTERM |');
    expect(summary).toContain('credential/oracle denial and qualification remain unverified');
    expect(summary).toContain('Production settings were not changed');
  });
});

describe('fixed diagnostic orchestration', () => {
  it('retains all seven commands and actual read/denial checks without inheriting command inputs', async () => {
    const ports = modeledPorts(); const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes.map((row: any) => row.id)).toEqual(policy.PROBE_IDS);
    expect(receipt.probes.every((row: any) => row.state === 'pass')).toBe(true);
    expect(ports.execute).toHaveBeenCalledTimes(7); expect(ports.release).toHaveBeenCalledTimes(1);
    const calls = ports.execute.mock.calls;
    expect(calls[3][1]).toEqual(expect.arrayContaining(['shell_environment_policy.inherit="none"']));
    expect(calls[4][1]).toEqual(expect.arrayContaining(['shell_environment_policy.include_only=["PATH"]']));
    expect(calls.flat(3)).not.toContain('exec');
    expect(receipt).toMatchObject({ qualificationModelCalls: 0, evaluatedPilotWrites: 0, actualSdkOrModelToolAcceptance: false });
  });

  it('keeps a startup failure negative even when a write-denial result was expected', async () => {
    const ports = modeledPorts(); ports.execute.mockResolvedValue({ ...success(), exitCode: 37, stderr: 'EPERM' });
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes).toHaveLength(7);
    expect(receipt.probes.every((row: any) => row.state === 'fail' && row.exitCode === 37)).toBe(true);
    expect(ports.writeAbsent).toHaveBeenCalledTimes(1);
  });

  it('requires independent post-command absence rather than a denial string alone', async () => {
    const ports = modeledPorts(); ports.writeAbsent.mockResolvedValue(false);
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes[6]).toMatchObject({ state: 'fail', reason: 'unexpected-write', exitCode: 0 });
  });

  it.each(['missing', 'version', 'download', 'cancelled'])('retains preparation %s and cleans owned resources', async failure => {
    const ports = modeledPorts();
    if (failure === 'version') ports.prepare.mockResolvedValue({ version: '0.160.0' });
    else ports.prepare.mockImplementation(async () => {
      if (failure === 'cancelled') ports.controller.abort();
      throw Object.assign(new Error('private failure text'), { code: failure === 'missing' ? 'ENOENT' : 'ERR', diagnosticBoundary: 'official-download' });
    });
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.preparation.state).toBe(failure === 'cancelled' ? 'cancelled' : 'failed');
    expect(receipt.probes.every((row: any) => row.state === 'not-run')).toBe(true);
    expect(ports.execute).not.toHaveBeenCalled(); expect(ports.release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(receipt)).not.toContain('private failure text');
  });

  it('settles partial execution, observer failure and cleanup uncertainty separately', async () => {
    const ports = modeledPorts(); ports.execute.mockImplementationOnce(async () => success()).mockRejectedValue(new Error('observer unavailable'));
    ports.engine.mockRejectedValue(new Error('engine observation failed')); ports.release.mockRejectedValue(new Error('cleanup failed'));
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.preparation.state).toBe('observed'); expect(receipt.executionIncomplete).toBe(true);
    expect(receipt.probes[0].state).toBe('pass'); expect(receipt.probes[1].reason).toBe('observation-unavailable');
    expect(receipt.cleanup).toBe('failed'); expect(receipt.engine.state).toBe('unavailable');
  });

  it('preserves actual cancellation and admits no later probe', async () => {
    const ports = modeledPorts(); ports.execute.mockImplementationOnce(async () => { ports.controller.abort(); return { ...success(), cancelled: true }; });
    const receipt = await diagnostic.diagnose(ports);
    expect(ports.execute).toHaveBeenCalledTimes(1); expect(receipt.probes[0].state).toBe('cancelled');
    expect(receipt.probes.slice(1).every((row: any) => row.reason === 'cancelled')).toBe(true);
  });
});

posixDescribe('real owned diagnostic processes and archives', () => {
  it('preserves an actual exit37 with stdout/stderr and closes the process', async () => {
    const result = await diagnostic.execute(process.execPath, ['-e', 'process.stdout.write("out");process.stderr.write("err");process.exitCode=37'],
      { cwd: process.cwd(), env: { PATH: path.dirname(process.execPath) }, signal: new AbortController().signal });
    expect(result).toMatchObject({ exitCode: 37, stdout: 'out', stderr: 'err', signal: null });
  });

  it('cancels the actual owned process and handles already-aborted preparation without spawn', async () => {
    const controller = new AbortController();
    const operation = diagnostic.execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
      { cwd: process.cwd(), env: {}, signal: controller.signal });
    controller.abort(); const result = await operation;
    expect(result.cancelled).toBe(true); expect(result.signal).toBe('SIGTERM');
    expect(await diagnostic.execute('/missing/never-run', [], { signal: controller.signal })).toMatchObject({ cancelled: true });
  });

  it('retains missing executable, bounded output and technical timeout as separate failures', async () => {
    const options = { cwd: process.cwd(), env: {}, signal: new AbortController().signal };
    expect(await diagnostic.execute('/missing/diagnostic-executable', [], options)).toMatchObject({ error: 'ENOENT', exitCode: -2 });
    expect(await diagnostic.execute(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'], options)).toMatchObject({ truncated: true });
    expect(await diagnostic.execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { ...options, timeout: 10 })).toMatchObject({ timedOut: true });
  });

  it('checks complete archive bytes/digest and rejects wrong, oversized or unavailable payloads', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sandbox-diagnostic-download-'));
    const original = global.fetch; const bytes = Buffer.from('owned archive bytes');
    const archive = { url: 'https://example.invalid/fixed', bytes: bytes.length, sha256: digest(bytes) };
    try {
      global.fetch = jest.fn(async () => new Response(bytes)) as typeof fetch;
      await diagnostic.downloadArchive(archive, path.join(directory, 'ok'), new AbortController().signal);
      expect(readFileSync(path.join(directory, 'ok'))).toEqual(bytes);
      await expect(diagnostic.downloadArchive({ ...archive, sha256: 'a'.repeat(64) }, path.join(directory, 'wrong'), new AbortController().signal)).rejects.toThrow('digest');
      await expect(diagnostic.downloadArchive({ ...archive, bytes: 1 }, path.join(directory, 'large'), new AbortController().signal)).rejects.toThrow('length');
      global.fetch = jest.fn(async () => new Response(null, { status: 503 })) as typeof fetch;
      await expect(diagnostic.downloadArchive(archive, path.join(directory, 'missing'), new AbortController().signal)).rejects.toThrow('unavailable');
    } finally { global.fetch = original; rmSync(directory, { recursive: true, force: true }); }
  });

  it('waits for rejected HTTP body cancellation before reporting download failure', async () => {
    const original = global.fetch; let release: () => void; let cancelled = false, settled = false;
    const closed = new Promise<void>(resolve => { release = resolve; });
    const body = new ReadableStream({ cancel: () => { cancelled = true; return closed; } });
    global.fetch = jest.fn(async () => new Response(body, { status: 503 })) as typeof fetch;
    try {
      const result = diagnostic.downloadArchive({ url: 'https://example.invalid/fixed' }, '/not-opened', new AbortController().signal)
        .then(() => { settled = true; }, (error: Error) => { settled = true; throw error; });
      await new Promise(resolve => setImmediate(resolve)); expect(cancelled).toBe(true); expect(settled).toBe(false);
      release!(); await expect(result).rejects.toThrow('unavailable');
    } finally { release!(); global.fetch = original; }
  });
});

posixDescribe('native adapter with modeled release/process ports and real private files', () => {
  function fixture(options: { downloadError?: boolean; listing?: string; extractionError?: boolean; symlink?: boolean;
    missingBinary?: boolean; version?: Outcome } = {}): Ports {
    const events: Ports = { root: null, environment: null, calls: [] };
    const downloadArchive = jest.fn(async (archive: any, target: string) => {
      events.root = path.dirname(target);
      expect(archive.url).toContain('/rust-v0.171.0/');
      if (options.downloadError) throw new Error('controlled download failure');
      writeFileSync(target, 'controlled archive substitute');
    });
    const execute = jest.fn(async (executable: string, args: string[], context: Ports) => {
      events.environment = context.env; events.calls.push({ executable, args });
      if (args[0] === '-tzf') return success(options.listing ?? 'codex-x86_64-unknown-linux-musl\n');
      if (args[0] === '-xzf') {
        if (options.extractionError) return { ...success(), exitCode: 37 };
        const binary = path.join(context.cwd, 'codex-x86_64-unknown-linux-musl');
        if (options.symlink) { writeFileSync(path.join(context.cwd, 'target'), 'owned'); symlinkSync('target', binary); }
        else if (!options.missingBinary) writeFileSync(binary, 'controlled non-executable model', { mode: 0o700 });
        return success();
      }
      return options.version ?? success('codex-cli 0.171.0\n');
    });
    const ports = diagnostic.nativePorts(new AbortController().signal, { platform: 'linux', architecture: 'x64', downloadArchive, execute });
    return { ports, events, downloadArchive, execute };
  }

  it('binds exact observed bytes, uses a credential-free HOME and removes its owned fixture', async () => {
    const previous = process.env.CONTROL_DIAGNOSTIC_SECRET; process.env.CONTROL_DIAGNOSTIC_SECRET = 'not-a-real-credential';
    const source = process.env.GITHUB_SHA; process.env.GITHUB_SHA = 'a'.repeat(40);
    const f = fixture();
    try {
      const runtime = await f.ports.prepare();
      expect(f.ports.identity.sourceCommit).toBe('a'.repeat(40));
      expect(runtime.identity.executableSha256).toBe(digest('controlled non-executable model'));
      expect(runtime.identity.nodeSha256).toBe(digest(readFileSync(process.execPath)));
      expect(runtime.identity.fixtureSha256).toBe(digest(readFileSync(runtime.fixture)));
      expect(lstatSync(f.events.root).mode & 0o777).toBe(0o700);
      expect(f.events.environment.CONTROL_DIAGNOSTIC_SECRET).toBeUndefined();
      expect(f.events.environment.HOME).toBe(path.join(f.events.root, 'home'));
      expect(f.events.environment.CODEX_HOME).toBe(path.join(f.events.root, 'home', '.codex'));
      expect(await f.ports.writeAbsent()).toBe(true); writeFileSync(runtime.writeTarget, 'owned');
      expect(await f.ports.writeAbsent()).toBe(false);
      expect(f.ports.project(f.events.root)).toBe('<diagnostic-root>');
    } finally {
      await f.ports.release(); expect(existsSync(f.events.root)).toBe(false);
      if (previous === undefined) delete process.env.CONTROL_DIAGNOSTIC_SECRET; else process.env.CONTROL_DIAGNOSTIC_SECRET = previous;
      if (source === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = source;
    }
  });

  it.each([
    ['download', { downloadError: true }, 'official-download'],
    ['traversal inventory', { listing: '../outside\n' }, 'archive-inventory'],
    ['extraction', { extractionError: true }, 'extraction'],
    ['symlink executable', { symlink: true }, 'executable-identity'],
    ['missing executable', { missingBinary: true }, 'executable-identity'],
    ['wrong version', { version: success('codex-cli 0.160.0') }, 'version'],
    ['failed version', { version: { ...success(), exitCode: 37 } }, 'version'],
    ['signaled version', { version: { ...success(), signal: 'SIGTERM' } }, 'version'],
    ['truncated version', { version: { ...success(), truncated: true } }, 'version'],
  ])('rejects %s before probes and retains the failed boundary', async (name, options, boundary) => {
    const f = fixture(options as any);
    try { await expect(f.ports.prepare()).rejects.toMatchObject({ diagnosticBoundary: boundary }); }
    finally { await f.ports.release(); if (f.events.root) expect(existsSync(f.events.root)).toBe(false); }
  });

  it('rejects unsupported host/architecture without any fake installation override in the entrypoint', () => {
    expect(() => diagnostic.nativePorts(new AbortController().signal, { platform: 'win32' })).toThrow('Linux');
    expect(() => diagnostic.nativePorts(new AbortController().signal, { platform: 'linux', architecture: 'unsupported' })).toThrow('architecture');
  });

  it('uses the actual private child environment and closes an aborted optional Engine observation', async () => {
    const previous = process.env.CONTROL_DIAGNOSTIC_SECRET; process.env.CONTROL_DIAGNOSTIC_SECRET = 'component-only';
    const controller = new AbortController(); const ports = diagnostic.nativePorts(controller.signal, { platform: 'linux' });
    let home: string | undefined;
    try {
      const result = await ports.execute(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({secret:process.env.CONTROL_DIAGNOSTIC_SECRET||null,home:process.env.HOME}))']);
      const observed = JSON.parse(result.stdout); home = observed.home;
      expect(result.exitCode).toBe(0); expect(observed.secret).toBeNull(); expect(existsSync(observed.home)).toBe(true);
      controller.abort(); expect(await ports.engine()).toEqual({ state: 'unavailable', cause: 'cancelled' });
    } finally {
      await ports.release(); if (home) expect(existsSync(home)).toBe(false);
      if (previous === undefined) delete process.env.CONTROL_DIAGNOSTIC_SECRET; else process.env.CONTROL_DIAGNOSTIC_SECRET = previous;
    }
  });

  it('keeps the native download path fixed and records failed transport before extraction', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('controlled transport failure'));
    const ports = diagnostic.nativePorts(new AbortController().signal, { platform: 'linux' });
    try {
      await expect(ports.prepare()).rejects.toMatchObject({ diagnosticBoundary: 'official-download' });
      expect(fetch.mock.calls[0][0]).toBe(policy.archiveFor(process.arch).url);
    } finally { await ports.release(); fetch.mockRestore(); }
  });

  it('checks the actual host before creating native resources in the default composition', async () => {
    if (process.platform === 'linux') {
      const ports = diagnostic.nativePorts(new AbortController().signal); await ports.release();
    } else expect(() => diagnostic.nativePorts(new AbortController().signal)).toThrow('Linux');
  });
});

describe('independent local Engine observation with controlled HTTP events', () => {
  function fixture(action: (response: any, request: any) => void, holdClose = false): Ports {
    const request = new EventEmitter() as any; const response = new EventEmitter() as any;
    response.statusCode = 200; let callback: (value: any) => void; let closed = false;
    const close = () => { if (!closed) { closed = true; response.emit('close'); request.emit('close'); } };
    request.destroy = jest.fn(() => { if (!holdClose) queueMicrotask(close); });
    response.destroy = jest.fn(() => { if (!holdClose) queueMicrotask(close); });
    request.end = jest.fn(() => { callback(response); action(response, request); });
    const mock = jest.spyOn(http, 'request').mockImplementation(((options: any, cb: any) => {
      expect(options).toMatchObject({ socketPath: '/var/run/docker.sock', path: '/version', method: 'GET' });
      callback = cb; return request;
    }) as any);
    return { request, response, close, mock };
  }

  it('requires valid metadata and actual closure before returning an Engine presence observation', async () => {
    const f = fixture(response => { response.emit('data', Buffer.from('{"Version":"29.8.2","ApiVersion":"1.56"}')); response.emit('end'); }, true);
    try {
      let settled = false; const result = diagnostic.engineObservation(new AbortController().signal).then((value: any) => { settled = true; return value; });
      await new Promise(resolve => setImmediate(resolve)); expect(settled).toBe(false);
      f.close(); expect(await result).toEqual({ state: 'observed', version: '29.8.2', apiVersion: '1.56', workloadExecuted: false });
    } finally { f.close(); f.mock.mockRestore(); }
  });

  it.each(['invalid', 'oversized', 'aborted', 'error', 'request-error', 'timeout', 'http-error'])('retains %s as unavailable rather than Engine acceptance', async fault => {
    const f = fixture((response, request) => {
      if (fault === 'invalid') { response.emit('data', Buffer.from('invalid')); response.emit('end'); }
      if (fault === 'oversized') response.emit('data', Buffer.alloc(8193));
      if (fault === 'aborted') response.emit('aborted');
      if (fault === 'error') response.emit('error', new Error('controlled transport'));
      if (fault === 'request-error') request.emit('error', new Error('controlled missing socket'));
      if (fault === 'timeout') request.emit('timeout');
      if (fault === 'http-error') { response.statusCode = 503; response.emit('data', Buffer.from('{}')); response.emit('end'); }
    });
    try { expect((await diagnostic.engineObservation(new AbortController().signal)).state).toBe('unavailable'); }
    finally { f.close(); f.mock.mockRestore(); }
  });

  it('closes a pending request on cancellation and creates none for an already-aborted signal', async () => {
    const f = fixture(() => undefined); const controller = new AbortController();
    try {
      const result = diagnostic.engineObservation(controller.signal); controller.abort();
      expect(await result).toEqual({ state: 'unavailable', cause: 'cancelled' });
      f.mock.mockClear(); expect(await diagnostic.engineObservation(controller.signal)).toEqual({ state: 'unavailable', cause: 'cancelled' });
      expect(f.mock).not.toHaveBeenCalled();
    } finally { f.close(); f.mock.mockRestore(); }
  });

  it('settles a synchronous request-construction error without waiting for a nonexistent close callback', async () => {
    const mock = jest.spyOn(http, 'request').mockImplementation(() => { throw new Error('controlled constructor'); });
    try {
      const value = await Promise.race([diagnostic.engineObservation(new AbortController().signal), new Promise(resolve => setImmediate(() => resolve('pending')))]);
      expect(value).toEqual({ state: 'unavailable', cause: 'local-engine-unavailable' });
    } finally { mock.mockRestore(); }
  });
});

describe('actual receipt and summary publication with modeled command ports', () => {
  it.each([true, false])('retains immutable receipt, restores cancellation listeners and leaves source credentials untouched (summary=%s)', async withSummary => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sandbox-diagnostic-main-'));
    const originalArgv = process.argv, originalExit = process.exitCode;
    const names = ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'RUNNER_TEMP', 'GITHUB_STEP_SUMMARY'];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const termListeners = process.listenerCount('SIGTERM'), intListeners = process.listenerCount('SIGINT');
    try {
      process.argv = [process.execPath, 'diagnostic.cjs'];
      Object.assign(process.env, { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: directory });
      if (withSummary) process.env.GITHUB_STEP_SUMMARY = path.join(directory, 'summary'); else delete process.env.GITHUB_STEP_SUMMARY;
      const ports = modeledPorts(); await diagnostic.main({ nativePorts: () => ports });
      const receiptPath = path.join(directory, 'copilot-linux-sandbox-123-1.json');
      expect(JSON.parse(readFileSync(receiptPath, 'utf8')).probes).toHaveLength(7);
      expect(process.exitCode).toBe(0);
      if (process.platform !== 'win32') expect(lstatSync(receiptPath).mode & 0o777).toBe(0o600);
      else expect(lstatSync(receiptPath).isFile()).toBe(true);
      if (withSummary) expect(readFileSync(path.join(directory, 'summary'), 'utf8')).toContain('remain unverified');
      await expect(diagnostic.main({ nativePorts: () => modeledPorts() })).rejects.toMatchObject({ code: 'EEXIST' });
      expect(process.listenerCount('SIGTERM')).toBe(termListeners); expect(process.listenerCount('SIGINT')).toBe(intListeners);
    } finally {
      process.argv = originalArgv; process.exitCode = originalExit; output.mockRestore();
      for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('records negative preparation with exit1 and rejects absent native run identity before ports', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sandbox-diagnostic-main-negative-'));
    const originalArgv = process.argv, originalExit = process.exitCode;
    const names = ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'RUNNER_TEMP', 'GITHUB_STEP_SUMMARY'];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      process.argv = [process.execPath, 'diagnostic.cjs'];
      delete process.env.GITHUB_RUN_ID; delete process.env.GITHUB_RUN_ATTEMPT;
      const factory = jest.fn(() => modeledPorts());
      await expect(diagnostic.main({ nativePorts: factory })).rejects.toThrow('native run identity'); expect(factory).not.toHaveBeenCalled();
      process.env.GITHUB_RUN_ID = '123';
      await expect(diagnostic.main({ nativePorts: factory })).rejects.toThrow('native run identity');
      Object.assign(process.env, { GITHUB_RUN_ATTEMPT: '2', RUNNER_TEMP: directory }); delete process.env.GITHUB_STEP_SUMMARY;
      const ports = modeledPorts(); ports.prepare.mockRejectedValue(new Error('controlled preparation'));
      await diagnostic.main({ nativePorts: () => ports }); expect(process.exitCode).toBe(1);
      expect(JSON.parse(readFileSync(path.join(directory, 'copilot-linux-sandbox-123-2.json'), 'utf8')).preparation.state).toBe('failed');
      process.argv = [process.execPath, 'diagnostic.cjs', '--unsupported'];
      await expect(diagnostic.main()).rejects.toThrow('accepts no arguments');
    } finally {
      process.argv = originalArgv; process.exitCode = originalExit; output.mockRestore();
      for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('manual Linux diagnostic workflow', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/copilot_runner_diagnostics.yml', 'utf8')) as Ports;
  it('retains only manual Linux placement, contents read and unchanged technical bound', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']); expect(Object.keys(workflow.jobs)).toEqual(['linux']);
    expect(workflow.jobs.linux['runs-on']).toEqual(['self-hosted', 'codex', 'Linux']);
    expect(workflow.permissions).toEqual({ contents: 'read' }); expect(workflow.jobs.linux['timeout-minutes']).toBe(5);
  });
  it('prepares Node in the actual diagnostic job and launches only the fixed argument-free driver', () => {
    const steps = workflow.jobs.linux.steps;
    expect(steps[0].name).toBe('Report bounded Linux resource counters');
    expect(steps[1]).toMatchObject({ uses: 'actions/checkout@v5', with: { 'persist-credentials': false } });
    expect(steps[2]).toMatchObject({ uses: 'actions/setup-node@v7', with: { 'node-version': '24.21.0' } });
    expect(steps[3].run).toBe('node scripts/diagnose-linux-sandbox-prerequisites.cjs');
    expect(steps[3].run).not.toContain('|| true'); expect(JSON.stringify(steps)).not.toContain('secrets.');
  });
  it('retains the exact native run receipt even for negative preparation without claiming acceptance', () => {
    const upload = workflow.jobs.linux.steps[4];
    expect(upload).toMatchObject({ if: 'always()', uses: 'actions/upload-artifact@v4',
      with: { name: 'linux-sandbox-prerequisites', 'if-no-files-found': 'error', 'retention-days': 1 } });
    expect(upload.with.path).toBe('${{ runner.temp }}/copilot-linux-sandbox-${{ github.run_id }}-${{ github.run_attempt }}.json');
  });
});
