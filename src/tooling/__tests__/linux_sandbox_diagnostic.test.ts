import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
const http = require('node:http') as typeof import('node:http');
const nativeFs = require('node:fs') as typeof import('node:fs');
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
    execute: jest.fn(async (executable: string, args: string[]) => ['unshare-user-network', 'bwrap-user-network', 'bwrap-root-user-network'].includes(args.at(-1) ?? '')
      ? success(args.at(-1)) : args.some(value => value.includes('process.exitCode=37'))
        ? { ...success(args.at(-2)), stderr: args.at(-1), exitCode: 37 }
        : success(args.includes('-e') ? args.some(value => value.includes('owned-write-canary')) ? 'DENIED' : 'c'.repeat(64) : '')),
    writeAbsent: jest.fn(async () => true), project: (value: string) => policy.outputProjection(value, '/private/owned'),
    engine: jest.fn(async () => ({ state: 'unavailable', cause: 'local-engine-unavailable' })),
    release: jest.fn(async () => undefined) };
}

describe('bounded diagnostic child output capture', () => {
  async function capture(stdout: Buffer[], stderr: Buffer[] = []) {
    // Explicitly modeled child delivery exposes chunk boundaries deterministically;
    // the existing native process tests separately exercise real pipes and close.
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    const operation = diagnostic.execute('/modeled/child', [], { signal: new AbortController().signal }, () => child);
    child.emit('spawn');
    stdout.forEach(chunk => child.stdout.emit('data', chunk));
    stderr.forEach(chunk => child.stderr.emit('data', chunk));
    child.emit('close', 0, null);
    return operation;
  }

  it.each(['stdout', 'stderr'])('decodes split UTF8 once across %s chunks', async channel => {
    const bytes = Buffer.from('prefix–€😀suffix');
    const chunks = [...bytes].map(byte => Buffer.from([byte]));
    const result = await capture(channel === 'stdout' ? chunks : [], channel === 'stderr' ? chunks : []);
    expect(result[channel]).toBe(bytes.toString('utf8'));
    expect(result.truncated).toBe(false);
  });

  it.each(['stdout', 'stderr'])('retains a contiguous bounded %s prefix after oversized and later chunks', async channel => {
    const chunks = [Buffer.alloc(50 * 1024, 65), Buffer.alloc(20 * 1024, 66), Buffer.from('late')];
    const bytes = Buffer.concat(chunks), prefix = bytes.subarray(0, 65536);
    const result = await capture(channel === 'stdout' ? chunks : [], channel === 'stderr' ? chunks : []);
    expect(Buffer.byteLength(result[channel])).toBe(prefix.length);
    expect(digest(result[channel])).toBe(digest(prefix));
    expect(result.truncated).toBe(true);
    expect(result.outputCapture[channel]).toEqual({ observedBytes: bytes.length, retainedBytes: 65536,
      observedSha256: digest(bytes), retainedSha256: digest(prefix) });
  });

  it('hashes original malformed UTF8 bytes separately from the decoded text view', async () => {
    const bytes = Buffer.from([0xff, 0x61, 0xc3]);
    const result = await capture([bytes]);
    expect(result.stdout).toBe(bytes.toString('utf8'));
    expect(result.outputCapture).toMatchObject({ textEncoding: 'utf8-replacement', limitBytesPerChannel: 65536,
      stdout: { observedBytes: 3, retainedBytes: 3, observedSha256: digest(bytes), retainedSha256: digest(bytes) } });
    expect(digest(result.stdout)).not.toBe(result.outputCapture.stdout.observedSha256);
  });

  it('identifies a byte-limited UTF8 tail without changing the raw prefix digest', async () => {
    const bytes = Buffer.concat([Buffer.alloc(65535, 65), Buffer.from('€')]);
    const result = await capture([bytes]);
    expect(digest(result.stdout)).toBe(digest(bytes.subarray(0, 65536).toString('utf8')));
    expect(result.outputCapture.stdout).toMatchObject({ retainedBytes: 65536,
      observedSha256: digest(bytes), retainedSha256: digest(bytes.subarray(0, 65536)) });
    expect(result.truncated).toBe(true);
  });

  it('keeps channel budgets independent and accounts for bytes observed before close', async () => {
    const bytes = Buffer.alloc(65537, 65), stderr = Buffer.from('other channel');
    const result = await capture([bytes, Buffer.from('after-overflow')], [stderr]);
    expect(result.stdout.length).toBe(65536); expect(digest(result.stdout)).toBe(digest('A'.repeat(65536)));
    expect(result.stderr).toBe('other channel');
    expect(result.outputCapture.stdout.observedBytes).toBe(65537 + Buffer.byteLength('after-overflow'));
    expect(result.outputCapture.stderr).toEqual({ observedBytes: stderr.length, retainedBytes: stderr.length,
      observedSha256: digest(stderr), retainedSha256: digest(stderr) });
    expect(policy.observation('codex-path-start', result).reason).toBe('output-incomplete');
  });

  it('accepts exactly the byte limit without marking output incomplete', async () => {
    const bytes = Buffer.alloc(65536, 65), result = await capture([bytes]);
    expect(result.stdout).toBe(bytes.toString('utf8')); expect(result.truncated).toBe(false);
    expect(result.outputCapture.stdout).toEqual({ observedBytes: 65536, retainedBytes: 65536,
      observedSha256: digest(bytes), retainedSha256: digest(bytes) });
  });

  it('retains raw byte identities alongside projected text in the receipt', async () => {
    const bytes = Buffer.from('/private/owned/canary'), result = await capture([bytes]);
    expect(result.outputCapture).toBeDefined();
    const ports = modeledPorts(); ports.execute.mockResolvedValue(result);
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes[0]).toMatchObject({ stdout: '<diagnostic-root>/canary', stdoutSha256: digest(bytes),
      outputCapture: result.outputCapture });
    expect(receipt.outputTextEncoding).toBe('utf8-replacement');
  });
});

posixDescribe('diagnostic command startup evidence', () => {
  const unavailable = { stdout: null, stderr: null, outputCapture: null };
  it('retains unavailable output when cancellation prevents a spawn', async () => {
    const controller = new AbortController(); controller.abort(); const spawn = jest.fn();
    const result = await diagnostic.execute('/missing/never-run', [], { signal: controller.signal }, spawn);
    expect(spawn).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ...unavailable, cancelled: true, exitCode: null, signal: null });
  });

  it('retains unavailable output for an actual missing executable', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'diagnostic-no-spawn-'));
    try {
      const result = await diagnostic.execute(path.join(directory, 'absent'), [],
        { cwd: directory, env: {}, signal: new AbortController().signal });
      expect(result).toMatchObject({ ...unavailable, error: 'ENOENT', exitCode: -2, signal: null });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('projects a never-started command as null channels, digests and capture metadata', async () => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    const pending = diagnostic.execute('/modeled/missing', [], { signal: new AbortController().signal }, () => child);
    child.emit('error', Object.assign(new Error('controlled launch failure'), { code: 'ENOENT' }));
    child.emit('close', -2, null);
    const result = await pending, ports = modeledPorts(); ports.execute.mockResolvedValueOnce(result);
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes[0]).toMatchObject({ ...unavailable, stdoutSha256: null, stderrSha256: null,
      state: 'unavailable', reason: 'missing-tool' });
    expect(ports.release).toHaveBeenCalledTimes(1);
  });

  it('distinguishes real empty output after a successful spawn from unavailable output', async () => {
    const result = await diagnostic.execute(process.execPath, ['-e', ''],
      { cwd: process.cwd(), env: {}, signal: new AbortController().signal });
    const empty = { observedBytes: 0, retainedBytes: 0, observedSha256: digest(''), retainedSha256: digest('') };
    expect(result).toMatchObject({ stdout: '', stderr: '', exitCode: 0, signal: null,
      outputCapture: { stdout: empty, stderr: empty } });
  });

  it('retains captured output when an error occurs after the child actually spawned', async () => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    const pending = diagnostic.execute('/modeled/started', [], { signal: new AbortController().signal }, () => child);
    child.emit('spawn'); child.stdout.emit('data', Buffer.from('started'));
    child.emit('error', Object.assign(new Error('controlled later error'), { code: 'EIO' }));
    child.emit('close', 1, null);
    const result = await pending;
    expect(result).toMatchObject({ stdout: 'started', stderr: '', error: 'EIO', exitCode: 1,
      outputCapture: { stdout: { observedBytes: 7, observedSha256: digest('started') } } });
  });
});

describe('Linux sandbox diagnostic outcome policy', () => {
  it.each([
    ['verified command', success(), undefined, 'pass', 'verified'],
    ['verified assertion', success('expected'), 'expected', 'pass', 'verified'],
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
    ['absent stdout', { ...success(), stdout: undefined }, undefined, 'fail', 'assertion-mismatch'],
    ['absent stderr', { ...success(), stderr: undefined }, undefined, 'fail', 'assertion-mismatch'],
    ['absent signal', { ...success(), signal: undefined }, undefined, 'fail', 'command-failed'],
  ])('%s retains its distinct real state', (name, result, expected, state, reason) => {
    expect(policy.observation('codex-path-start', result, expected)).toMatchObject({ state, reason });
  });

  it('fixes the exact official release identities and rejects unknown architecture/probe/input', () => {
    expect(policy.PROBE_IDS).toEqual(['unshare-user-network', 'bwrap-user-network', 'bwrap-root-user-network',
      'codex-empty-start', 'codex-path-start', 'node-execution-transport', 'bwrap-execution-transport',
      'codex-path-execution-transport', 'codex-fixture-read', 'codex-write-denial']);
    expect(policy.archiveFor('x64')).toMatchObject({ version: '0.171.0', bytes: 197763180,
      sha256: '8391d67757496bfd14893eca6cbf0c96994bf2627566ff1f018f70600c9ef6b3' });
    expect(policy.archiveFor('arm64').sha256).toBe('d8c43bee6cf11b01eb18b95f4d7961092bc40228180808859e70dabb7784c1c9');
    expect(() => policy.archiveFor('constructor')).toThrow();
    expect(() => policy.observation('claimed-pass', success())).toThrow();
    expect(() => policy.notRun('codex-path-start', 'already-qualified')).toThrow();
    expect(() => policy.outputProjection('text', '')).toThrow();
  });

  it.each([
    ['exact controlled failure', { ...success('out'), stderr: 'err', exitCode: 37 }, 'out', 'err', 'pass'],
    ['silent zero', success(), 'out', 'err', 'fail'],
    ['missing stdout witness', { ...success(), stderr: 'err', exitCode: 37 }, 'out', 'err', 'fail'],
    ['missing stderr witness', { ...success('out'), exitCode: 37 }, 'out', 'err', 'fail'],
    ['no stdout expectation', { ...success('out'), stderr: 'err', exitCode: 37 }, undefined, 'err', 'fail'],
    ['empty stdout expectation', { ...success('out'), stderr: 'err', exitCode: 37 }, '', 'err', 'fail'],
    ['no stderr expectation', { ...success('out'), stderr: 'err', exitCode: 37 }, 'out', undefined, 'fail'],
    ['empty stderr expectation', { ...success('out'), stderr: 'err', exitCode: 37 }, 'out', '', 'fail'],
    ['wrong stdout type', { ...success(), stdout: 37, stderr: 'err', exitCode: 37 }, 'out', 'err', 'fail'],
    ['signal despite expected code', { ...success('out'), stderr: 'err', exitCode: 37, signal: 'SIGTERM' }, 'out', 'err', 'fail'],
  ])('requires complete execution transport proof: %s', (name, result, out, err, state) => {
    for (const id of policy.TRANSPORT_IDS) expect(policy.observation(id, result, out, err)).toMatchObject({ state, expectedExitCode: 37, kind: 'execution-transport' });
    expect(policy.observation('codex-fixture-read', { ...success('out'), stderr: 'err', exitCode: 37 }, 'out', 'err'))
      .toMatchObject({ state: 'fail', expectedExitCode: 0 });
  });

  it.each([
    ['leading stdout space', ' out', 'err'],
    ['trailing stdout newline', 'out\n', 'err'],
    ['leading stdout tab', '\tout', 'err'],
    ['leading stderr nonbreaking space', 'out', '\u00a0err'],
    ['trailing stderr CRLF', 'out', 'err\r\n'],
    ['extra bytes on both channels', ' out\n', '\terr '],
  ])('rejects non-exact marker bytes: %s', (_name, stdout, stderr) => {
    for (const id of policy.TRANSPORT_IDS) {
      expect(policy.observation(id, { ...success(stdout), stderr, exitCode: 37 }, 'out', 'err'))
        .toMatchObject({ state: 'fail', reason: 'assertion-mismatch' });
    }
    expect(policy.observation('codex-fixture-read', { ...success(stdout), stderr }, 'out', 'err'))
      .toMatchObject({ state: 'fail', reason: 'assertion-mismatch' });
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
    expect(summary).toContain('Payload transport: **node-fd-write-sync**. Node stream compatibility: **not measured**.');
    expect(policy.renderSummary({ preparation: { state: 'observed' }, probes: [policy.notRun('node-execution-transport', 'cancelled')] }))
      .toContain('| node-execution-transport | not-run (cancelled) | 37 | unknown | none |');
    expect(policy.renderSummary({ preparation: { state: 'observed' }, probes: [], executionIncomplete: true, cleanup: 'completed' }))
      .toContain('Collection: **incomplete**. Cleanup: **completed**.');
  });
});

const PACKAGE_LISTING = "bin/\nbin/codex\nbin/codex-code-mode-host\nbin/codex-exec-server\ncodex-package.json\ncodex-path/\ncodex-path/rg\ncodex-resources/\ncodex-resources/bwrap\ncodex-resources/voice/\ncodex-resources/voice/NOTICE.md\ncodex-resources/voice/bin/\ncodex-resources/voice/bin/codex-voice-host\ncodex-resources/voice/lib/\ncodex-resources/voice/lib/gstreamer-1.0/\ncodex-resources/voice/lib/gstreamer-1.0/libgstapp.so\ncodex-resources/voice/lib/gstreamer-1.0/libgstaudioconvert.so\ncodex-resources/voice/lib/gstreamer-1.0/libgstaudioresample.so\ncodex-resources/voice/lib/gstreamer-1.0/libgstcoreelements.so\ncodex-resources/voice/lib/gstreamer-1.0/libgstopus.so\ncodex-resources/voice/lib/gstreamer-1.0/libgstrtp.so\ncodex-resources/voice/lib/gstreamer-1.0/libgstrtpmanager.so\ncodex-resources/voice/lib/libffi.so.8\ncodex-resources/voice/lib/libgio-2.0.so.0\ncodex-resources/voice/lib/libglib-2.0.so.0\ncodex-resources/voice/lib/libgmodule-2.0.so.0\ncodex-resources/voice/lib/libgobject-2.0.so.0\ncodex-resources/voice/lib/libgstallocators-1.0.so.0\ncodex-resources/voice/lib/libgstapp-1.0.so.0\ncodex-resources/voice/lib/libgstaudio-1.0.so.0\ncodex-resources/voice/lib/libgstbase-1.0.so.0\ncodex-resources/voice/lib/libgstnet-1.0.so.0\ncodex-resources/voice/lib/libgstpbutils-1.0.so.0\ncodex-resources/voice/lib/libgstreamer-1.0.so.0\ncodex-resources/voice/lib/libgstrtp-1.0.so.0\ncodex-resources/voice/lib/libgsttag-1.0.so.0\ncodex-resources/voice/lib/libgstvideo-1.0.so.0\ncodex-resources/voice/lib/libintl.so.8\ncodex-resources/voice/lib/libopus.so.0\ncodex-resources/voice/lib/libpcre2-8.so.0\ncodex-resources/voice/lib/libz.so.1\ncodex-resources/voice/licenses/\ncodex-resources/voice/licenses/LGPL-2.1.txt\ncodex-resources/voice/licenses/Opus.txt\ncodex-resources/voice/licenses/PCRE2.md\ncodex-resources/voice/licenses/libffi.txt\ncodex-resources/voice/licenses/proxy-libintl.txt\ncodex-resources/voice/licenses/sljit.txt\ncodex-resources/voice/licenses/zlib.txt\ncodex-resources/voice/manifest.json\ncodex-resources/voice/runtime.json\ncodex-resources/voice/sources.json\n";
const PACKAGE_MANIFEST = { layoutVersion: 1, version: '0.171.0', target: 'x86_64-unknown-linux-musl',
  variant: 'codex', entrypoint: 'bin/codex', execServer: 'bin/codex-exec-server', resourcesDir: 'codex-resources', pathDir: 'codex-path' };

describe('fixed diagnostic orchestration', () => {
  it.each(['unshare-user-network', 'bwrap-user-network', 'bwrap-root-user-network'])('does not certify namespace payload execution from silent zero: %s', async id => {
    const ports = modeledPorts(); ports.execute.mockResolvedValue(success());
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes.find((row: any) => row.id === id)).toMatchObject({ state: 'fail', reason: 'assertion-mismatch', exitCode: 0 });
  });

  it('uses the pinned CLI root configuration grammar before the host sandbox command', async () => {
    const ports = modeledPorts(), runtime = await ports.prepare();
    const rows = diagnostic.probeCommands(runtime).filter((row: any[]) => row[1] === runtime.codex);
    expect(rows).toHaveLength(5);
    for (const [, , args] of rows) {
      const boundary = args.indexOf('sandbox'); expect(boundary).toBeGreaterThan(0);
      expect(args.slice(boundary, boundary + 2)).toEqual(['sandbox', '--']);
      const configuration = args.slice(0, boundary);
      expect(configuration.length % 2).toBe(0);
      for (let index = 0; index < configuration.length; index += 2) {
        expect(configuration[index]).toBe('--config');
        expect(configuration[index + 1]).toMatch(/^(?:sandbox_mode="read-only"|shell_environment_policy\.(?:inherit="(?:none|core)"|ignore_default_excludes=false|include_only=\["PATH"\]))$/u);
      }
      expect(configuration).toContain('sandbox_mode="read-only"');
      expect(args).not.toEqual(expect.arrayContaining(['--ignore-user-config']));
      expect(args).not.toEqual(expect.arrayContaining(['--ignore-rules']));
    }
  });

  it('retains ten fixed observations and actual read/denial checks without inheriting command inputs', async () => {
    const ports = modeledPorts(); const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes.map((row: any) => row.id)).toEqual(policy.PROBE_IDS);
    expect(receipt.probes.every((row: any) => row.state === 'pass')).toBe(true);
    expect(ports.execute).toHaveBeenCalledTimes(10); expect(ports.release).toHaveBeenCalledTimes(1);
    const calls = ports.execute.mock.calls;
    expect(calls[3][1]).toEqual(expect.arrayContaining(['shell_environment_policy.inherit="none"']));
    expect(calls[4][1]).toEqual(expect.arrayContaining(['shell_environment_policy.include_only=["PATH"]']));
    expect(calls.flat(3)).not.toContain('exec');
    const node = '/private/owned/node', direct = [node, ...calls[5][1]];
    expect(calls[6][1].slice(calls[6][1].indexOf(node))).toEqual(direct);
    expect(calls[7][1].slice(calls[7][1].indexOf('--') + 1)).toEqual(direct);
    expect(receipt).toMatchObject({ schemaVersion: 4, executionTransportVerified: true,
      payloadOutputTransport: 'node-fd-write-sync', nodeStreamCompatibility: 'not-measured',
      qualificationModelCalls: 0, evaluatedPilotWrites: 0, actualSdkOrModelToolAcceptance: false });
  });

  it('keeps a startup failure negative even when a write-denial result was expected', async () => {
    const ports = modeledPorts(); ports.execute.mockResolvedValue({ ...success(), exitCode: 37, stderr: 'EPERM' });
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes).toHaveLength(10);
    expect(receipt.probes.slice(0, 8).every((row: any) => row.state === 'fail' && row.exitCode === 37)).toBe(true);
    expect(receipt.probes.slice(8).every((row: any) => row.state === 'not-run' && row.reason === 'execution-unverified')).toBe(true);
    expect(ports.writeAbsent).not.toHaveBeenCalled(); expect(receipt.executionIncomplete).toBe(true);
  });

  it('requires independent post-command absence rather than a denial string alone', async () => {
    const ports = modeledPorts(); ports.writeAbsent.mockResolvedValue(false);
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes.find((row: any) => row.id === 'codex-write-denial')).toMatchObject({ state: 'fail', reason: 'unexpected-write', exitCode: 0 });
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
    const ports = modeledPorts(); ports.execute.mockImplementationOnce(async () => success('unshare-user-network')).mockRejectedValue(new Error('observer unavailable'));
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

  it.each(['engine', 'release'])('keeps late cancellation during %s incomplete after all ten observations', async boundary => {
    const ports = modeledPorts(); ports[boundary].mockImplementation(async () => { ports.controller.abort(); return { state: 'unavailable', cause: 'cancelled' }; });
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt.probes.every((row: any) => row.state === 'pass')).toBe(true);
    expect(receipt.executionIncomplete).toBe(true); expect(receipt.cleanup).toBe('completed');
    expect(ports.release).toHaveBeenCalledTimes(1);
  });

  it('retains a command cancellation even when a command port has not aborted the shared signal', async () => {
    const ports = modeledPorts(); ports.execute.mockResolvedValueOnce({ ...success(), cancelled: true });
    expect((await diagnostic.diagnose(ports)).executionIncomplete).toBe(true);
    expect(ports.signal.aborted).toBe(false);
    expect(ports.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['silent', 'missing-output', 'missing-error', 'signal'])('skips read/write when Codex transport is %s despite an observed wrapper exit', async fault => {
    const ports = modeledPorts(), execute = ports.execute.getMockImplementation()!;
    ports.execute.mockImplementation(async (file: string, args: string[]) => {
      if (file === '/private/owned/codex' && args.some(value => value.includes('process.exitCode=37'))) {
        if (fault === 'silent') return success();
        if (fault === 'missing-output') return { ...success(), stdout: undefined, exitCode: 37 };
        if (fault === 'missing-error') return { ...success('transport-out:' + 'c'.repeat(64)), stderr: undefined, exitCode: 37 };
        return { ...success(), signal: 'SIGTERM', exitCode: 37 };
      }
      return execute(file, args);
    });
    const receipt = await diagnostic.diagnose(ports);
    expect(receipt).toMatchObject({ executionTransportVerified: false, executionIncomplete: true });
    expect(receipt.probes.slice(-2).map((row: any) => [row.id, row.state, row.reason])).toEqual([
      ['codex-fixture-read', 'not-run', 'execution-unverified'], ['codex-write-denial', 'not-run', 'execution-unverified'],
    ]);
    expect(ports.execute).toHaveBeenCalledTimes(8); expect(ports.writeAbsent).not.toHaveBeenCalled();
    if (fault === 'missing-output') expect(receipt.probes[7]).toMatchObject({ stdout: null, stdoutSha256: null });
    if (fault === 'missing-error') expect(receipt.probes[7]).toMatchObject({ stderr: null, stderrSha256: null });
  });

  it('waits for every admitted transport sibling after one observation rejects', async () => {
    const ports = modeledPorts(), execute = ports.execute.getMockImplementation()!;
    const controls: Array<{ resolve: (value: Outcome) => void; reject: (error: Error) => void }> = [];
    ports.execute.mockImplementation((file: string, args: string[]) => args.some(value => value.includes('process.exitCode=37'))
      ? new Promise<Outcome>((resolve, reject) => { controls.push({ resolve, reject }); }) : execute(file, args));
    const proof = { ...success('transport-out:' + 'c'.repeat(64)), stderr: 'transport-error:' + 'c'.repeat(64), exitCode: 37 };
    const operation = diagnostic.diagnose(ports);
    try {
      await new Promise(resolve => setImmediate(resolve)); expect(controls).toHaveLength(3);
      controls[0].reject(new Error('private observer detail')); controls[1].resolve(proof);
      await new Promise(resolve => setImmediate(resolve)); expect(ports.release).not.toHaveBeenCalled();
      expect(ports.execute).toHaveBeenCalledTimes(8);
      controls[2].resolve(proof); const receipt = await operation;
      expect(receipt.probes[5]).toMatchObject({ state: 'not-run', reason: 'observation-unavailable' });
      expect(receipt.probes.slice(-2).every((row: any) => row.reason === 'execution-unverified')).toBe(true);
      expect(receipt.executionIncomplete).toBe(true); expect(JSON.stringify(receipt)).not.toContain('private observer detail');
      expect(ports.release).toHaveBeenCalledTimes(1);
    } finally { for (const control of controls) control.resolve(proof); await operation; }
  });

  it('keeps cancelled transport incomplete until all admitted observations settle', async () => {
    const ports = modeledPorts(), execute = ports.execute.getMockImplementation()!;
    const controls: Array<(value: Outcome) => void> = [];
    ports.execute.mockImplementation((file: string, args: string[]) => args.some(value => value.includes('process.exitCode=37'))
      ? new Promise<Outcome>(resolve => { controls.push(resolve); }) : execute(file, args));
    const closed = { ...success(), cancelled: true };
    const operation = diagnostic.diagnose(ports);
    try {
      await new Promise(resolve => setImmediate(resolve)); expect(controls).toHaveLength(3); ports.controller.abort();
      controls[0](closed); controls[1](closed); await new Promise(resolve => setImmediate(resolve));
      expect(ports.release).not.toHaveBeenCalled(); controls[2](closed); const receipt = await operation;
      expect(receipt.probes.slice(5, 8).every((row: any) => row.state === 'cancelled')).toBe(true);
      expect(receipt.probes.slice(-2).every((row: any) => row.reason === 'cancelled')).toBe(true);
      expect(receipt).toMatchObject({ executionIncomplete: true, executionTransportVerified: false });
      expect(ports.execute).toHaveBeenCalledTimes(8); expect(ports.release).toHaveBeenCalledTimes(1);
    } finally { for (const resolve of controls) resolve(closed); await operation; }
  });
});

posixDescribe('real owned diagnostic processes and archives', () => {
  async function payloadWithModeledNodeStreamFallback(id: string, options: { missingFixture?: boolean; deniedWrite?: boolean } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'diagnostic-fd-payload-'));
    const fixtureBytes = 'owned raw-fd read fixture';
    const runtime = { node: process.execPath, codex: '/unused/controlled-codex', fixture: path.join(root, 'fixture'),
      fixtureSha256: digest(fixtureBytes), writeTarget: path.join(root, 'write-canary') };
    if (!options.missingFixture) writeFileSync(runtime.fixture, fixtureBytes);
    const row = diagnostic.probeCommands(runtime).find((value: any[]) => value[0] === id);
    const args = row[2], scriptIndex = args.indexOf('-e') + 1;
    expect(scriptIndex).toBeGreaterThan(0);
    // Model Node's documented unknown-handle stream fallback. The output
    // descriptors and filesystem operations remain real owned Node processes.
    const fallback = 'const {Writable}=require("node:stream");for(const key of ["stdout","stderr"])Object.defineProperty(process,key,{value:new Writable({write(chunk,encoding,callback){callback()}})});';
    const denial = options.deniedWrite ? 'require("node:fs").writeFileSync=()=>{const error=new Error("controlled EROFS");error.code="EROFS";throw error;};' : '';
    try {
      const result: Outcome = await diagnostic.execute(process.execPath, ['-e', fallback + denial + args[scriptIndex], ...args.slice(scriptIndex + 1)],
        { cwd: root, env: {}, signal: new AbortController().signal });
      return { result, expected: row[3], expectedError: row[4], fixtureSha256: runtime.fixtureSha256,
        canaryCreated: existsSync(runtime.writeTarget), canaryBytes: existsSync(runtime.writeTarget) ? readFileSync(runtime.writeTarget, 'utf8') : null };
    } finally { rmSync(root, { recursive: true, force: true }); }
  }

  it('retains a namespace payload witness through modeled dummy Node streams', async () => {
    const actual = await payloadWithModeledNodeStreamFallback('bwrap-user-network');
    expect(actual.result).toMatchObject({ stdout: 'bwrap-user-network', stderr: '', exitCode: 0, signal: null });
    expect(policy.observation('bwrap-user-network', actual.result, actual.expected).state).toBe('pass');
  });

  it('retains both transport channels and exit37 through modeled dummy Node streams', async () => {
    const actual = await payloadWithModeledNodeStreamFallback('node-execution-transport');
    expect(actual.result).toMatchObject({ stdout: actual.expected, stderr: actual.expectedError, exitCode: 37, signal: null });
    expect(policy.observation('node-execution-transport', actual.result, actual.expected, actual.expectedError).state).toBe('pass');
  });

  it('retains an actual owned read digest through modeled dummy Node streams', async () => {
    const actual = await payloadWithModeledNodeStreamFallback('codex-fixture-read');
    expect(actual.result).toMatchObject({ stdout: actual.fixtureSha256, exitCode: 0, signal: null });
    expect(policy.observation('codex-fixture-read', actual.result, actual.fixtureSha256).state).toBe('pass');
  });

  it('rejects an actual missing fixture even with modeled dummy Node streams', async () => {
    const actual = await payloadWithModeledNodeStreamFallback('codex-fixture-read', { missingFixture: true });
    expect(actual.result.exitCode).not.toBe(0);
    expect(policy.observation('codex-fixture-read', actual.result, actual.fixtureSha256).state).toBe('fail');
  });

  it('retains modeled EROFS denial output through dummy Node streams', async () => {
    const actual = await payloadWithModeledNodeStreamFallback('codex-write-denial', { deniedWrite: true });
    expect(actual.result).toMatchObject({ stdout: 'DENIED', exitCode: 0, signal: null });
    expect(actual.canaryCreated).toBe(false);
  });

  it('retains an actual unexpected write and exit9 through modeled dummy Node streams', async () => {
    const actual = await payloadWithModeledNodeStreamFallback('codex-write-denial');
    expect(actual.result).toMatchObject({ stdout: 'WROTE', exitCode: 9, signal: null });
    expect(actual.canaryBytes).toBe('owned-write-canary');
    expect(policy.observation('codex-write-denial', actual.result, actual.expected).state).toBe('fail');
  });

  it('cancels three real owned process groups and closes them before releasing the transport phase', async () => {
    const ports = modeledPorts(), execute = ports.execute.getMockImplementation()!;
    const closed: Outcome[] = []; let admitted = 0;
    ports.execute.mockImplementation((file: string, args: string[]) => {
      if (!args.some(value => value.includes('process.exitCode=37'))) return execute(file, args);
      const operation = diagnostic.execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
        { cwd: process.cwd(), env: {}, signal: ports.signal }).then((result: Outcome) => { closed.push(result); return result; });
      if (++admitted === 3) queueMicrotask(() => ports.controller.abort());
      return operation;
    });
    ports.release.mockImplementation(async () => { expect(closed).toHaveLength(3); });
    const receipt = await diagnostic.diagnose(ports);
    expect(closed).toHaveLength(3); expect(closed.every(row => row.cancelled && ['SIGTERM', 'SIGKILL'].includes(row.signal!))).toBe(true);
    expect(receipt.executionIncomplete).toBe(true); expect(ports.writeAbsent).not.toHaveBeenCalled();
  });

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

posixDescribe('system helper identity observations do not certify execution', () => {
  it.each([
    ['ELF', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0])],
    ['script', Buffer.from('#!/bin/sh\nexit 0\n')],
    ['other', Buffer.from('controlled bytes')],
  ])('records exact %s bytes without promoting them to payload proof', (format, bytes) => {
    const root = mkdtempSync(path.join(tmpdir(), 'diagnostic-helper-')), file = path.join(root, 'bwrap');
    try {
      writeFileSync(file, bytes, { mode: 0o700 });
      expect(diagnostic.observeSystemBwrap(file)).toMatchObject({ state: 'observed', canonicalPath: nativeFs.realpathSync(file),
        bytes: bytes.length, sha256: digest(bytes), format, mode: 0o700, payloadExecutionVerified: false });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each(['missing', 'directory', 'empty', 'oversized'])('keeps %s helper metadata unavailable', fault => {
    const root = mkdtempSync(path.join(tmpdir(), 'diagnostic-helper-negative-')), file = path.join(root, 'bwrap');
    try {
      if (fault === 'directory') nativeFs.mkdirSync(file);
      else if (fault !== 'missing') writeFileSync(file, fault === 'empty' ? '' : Buffer.alloc(2 * 1024 * 1024 + 1));
      expect(diagnostic.observeSystemBwrap(file)).toEqual({ state: 'unavailable', cause: 'identity-unavailable', payloadExecutionVerified: false });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects a helper that changes during the byte observation', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'diagnostic-helper-drift-')), file = path.join(root, 'bwrap');
    writeFileSync(file, 'before'); const read = nativeFs.readFileSync, canonical = nativeFs.realpathSync(file); let changed = false;
    const probe = jest.spyOn(nativeFs, 'readFileSync').mockImplementation(((name: any, ...args: any[]) => {
      const value = (read as any)(name, ...args); if (name === canonical) { writeFileSync(file, 'changed after reading'); changed = true; } return value;
    }) as any);
    try { expect(diagnostic.observeSystemBwrap(file).state).toBe('unavailable'); expect(changed).toBe(true); }
    finally { probe.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });
});

posixDescribe('native adapter with modeled release/process ports and real private files', () => {
  function fixture(options: { downloadError?: boolean; listing?: string; extractionError?: boolean; symlink?: boolean;
    missingBinary?: boolean; missingMember?: string; symlinkMember?: string; manifest?: any; version?: Outcome } = {}): Ports {
    const events: Ports = { root: null, environment: null, calls: [] };
    const downloadArchive = jest.fn(async (archive: any, target: string) => {
      events.root = path.dirname(target);
      expect(archive.url).toContain('/rust-v0.171.0/');
      if (options.downloadError) throw new Error('controlled download failure');
      writeFileSync(target, 'controlled archive substitute');
    });
    const execute = jest.fn(async (executable: string, args: string[], context: Ports) => {
      events.environment = context.env; events.calls.push({ executable, args });
      if (args[0] === '-tzf') return success(options.listing ?? PACKAGE_LISTING);
      if (args[0] === '-xzf') {
        if (options.extractionError) return { ...success(), exitCode: 37 };
        const root = args[args.indexOf('-C') + 1];
        for (const member of ['bin/codex', 'bin/codex-code-mode-host', 'bin/codex-exec-server', 'codex-path/rg', 'codex-resources/bwrap']) {
          const binary = path.join(root, member); nativeFs.mkdirSync(path.dirname(binary), { recursive: true });
          if (options.missingMember === member || options.missingBinary && member === 'bin/codex') continue;
          if (options.symlinkMember === member || options.symlink && member === 'bin/codex') {
            const target = path.join(root, 'target'); writeFileSync(target, 'owned'); symlinkSync(target, binary);
          } else writeFileSync(binary, 'controlled non-executable model', { mode: 0o700 });
        }
        const manifest = options.manifest ?? PACKAGE_MANIFEST;
        writeFileSync(path.join(root, 'codex-package.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
        return success();
      }
      return options.version ?? success('codex-cli 0.171.0\n');
    });
    const ports = diagnostic.nativePorts(new AbortController().signal, { platform: 'linux', architecture: 'x64', downloadArchive, execute });
    return { ports, events, downloadArchive, execute };
  }

  it('retains the native package metadata failure boundary through the outer receipt and cleanup', async () => {
    const f = fixture({ manifest: '{' });
    const ports = { ...f.ports, engine: jest.fn(async () => ({ state: 'unavailable', cause: 'controlled-local-engine' })),
      release: jest.fn(f.ports.release) };
    try {
      const receipt = await diagnostic.diagnose(ports);
      expect(receipt.preparation).toMatchObject({ state: 'failed', boundary: 'package-metadata' });
      expect(receipt.probes).toHaveLength(10);
      expect(receipt.probes.every((row: any) => row.state === 'not-run' && row.reason === 'preparation-failed')).toBe(true);
      expect(receipt.executionIncomplete).toBe(true); expect(receipt.cleanup).toBe('completed');
      expect(f.execute.mock.calls.map(([, args]: any[]) => args[0])).toEqual(['-tzf', '-xzf']);
      expect(ports.engine).toHaveBeenCalledTimes(1); expect(ports.release).toHaveBeenCalledTimes(1);
      expect(existsSync(f.events.root)).toBe(false);
    } finally { await f.ports.release(); }
  });

  it('uses the official full package with adjacent resources even when CLI bytes match', async () => {
    const f = fixture();
    try {
      const runtime = await f.ports.prepare();
      expect(runtime.codex).toMatch(/\/runtime\/bin\/codex$/u);
      expect(runtime.identity.packageLayoutVersion).toBe(1);
      expect(runtime.identity.packageExecutables.map((row: any) => row.path)).toEqual([
        'bin/codex', 'bin/codex-code-mode-host', 'bin/codex-exec-server', 'codex-path/rg', 'codex-resources/bwrap']);
      expect(runtime.identity.packageExecutables.every((row: any) => row.sha256 === digest('controlled non-executable model'))).toBe(true);
      expect(runtime.identity.archiveInventorySha256).toBe(digest(PACKAGE_LISTING));
      expect(policy.archiveFor('x64').url).toContain('/codex-package-x86_64-unknown-linux-musl.tar.gz');
      expect(policy.archiveFor('arm64').bytes).toBe(199315347);
    } finally { await f.ports.release(); }
  });

  it.each([
    ['missing bwrap', { missingMember: 'codex-resources/bwrap' }, 'executable-identity'],
    ['symlink bwrap', { symlinkMember: 'codex-resources/bwrap' }, 'executable-identity'],
    ['missing rg', { missingMember: 'codex-path/rg' }, 'executable-identity'],
    ['missing execution server', { missingMember: 'bin/codex-exec-server' }, 'executable-identity'],
    ['missing code mode host', { missingMember: 'bin/codex-code-mode-host' }, 'executable-identity'],
    ['malformed package metadata', { manifest: '{' }, 'package-metadata'],
    ['wrong layout version', { manifest: { ...PACKAGE_MANIFEST, layoutVersion: 2 } }, 'package-metadata'],
    ['wrong package version', { manifest: { ...PACKAGE_MANIFEST, version: '0.160.0' } }, 'package-metadata'],
    ['wrong package target', { manifest: { ...PACKAGE_MANIFEST, target: 'aarch64-unknown-linux-musl' } }, 'package-metadata'],
  ])('rejects full package %s before CLI version execution', async (name, options, boundary) => {
    const f = fixture(options);
    try {
      await expect(f.ports.prepare()).rejects.toMatchObject({ diagnosticBoundary: boundary });
      expect(f.events.calls.some((row: any) => row.args[0] === '--version')).toBe(false);
    } finally { await f.ports.release(); }
  });

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
      expect(lstatSync(f.events.environment.CODEX_HOME).isDirectory()).toBe(true);
      expect(lstatSync(f.events.environment.CODEX_HOME).mode & 0o777).toBe(0o700);
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

  it('removes only its newly owned root when adapter directory initialization fails', () => {
    const originalTemp = nativeFs.mkdtempSync, originalMkdir = nativeFs.mkdirSync;
    let owned: string | undefined;
    const temp = jest.spyOn(nativeFs, 'mkdtempSync').mockImplementation(((...args: any[]) => {
      owned = (originalTemp as any)(...args); return owned;
    }) as any);
    const mkdir = jest.spyOn(nativeFs, 'mkdirSync').mockImplementation(((target: any, ...args: any[]) => {
      if (String(target).endsWith(path.sep + 'home')) throw Object.assign(new Error('controlled directory failure'), { code: 'EACCES' });
      return (originalMkdir as any)(target, ...args);
    }) as any);
    try {
      expect(() => diagnostic.nativePorts(new AbortController().signal, { platform: 'linux', architecture: 'x64' })).toThrow('controlled directory failure');
      expect(owned).toBeDefined(); expect(existsSync(owned!)).toBe(false);
    } finally {
      temp.mockRestore(); mkdir.mockRestore(); if (owned) rmSync(owned, { recursive: true, force: true });
    }
  });

  it.each([false, true])('preserves the first initialization failure and reports cleanup uncertainty=%s', cleanupFails => {
    const originalTemp = nativeFs.mkdtempSync; let owned: string | undefined;
    const temp = jest.spyOn(nativeFs, 'mkdtempSync').mockImplementation(((...args: any[]) => {
      owned = (originalTemp as any)(...args); return owned;
    }) as any);
    const failure = Object.assign(new Error('controlled chmod failure'), { code: 'EACCES' });
    const chmod = jest.spyOn(nativeFs, 'chmodSync').mockImplementation(() => { throw failure; });
    const remove = cleanupFails ? jest.spyOn(nativeFs, 'rmSync').mockImplementation(() => { throw new Error('controlled cleanup failure'); }) : undefined;
    try {
      expect(() => diagnostic.nativePorts(new AbortController().signal, { platform: 'linux', architecture: 'x64' })).toThrow(failure);
      expect(failure).toMatchObject({ diagnosticCleanup: cleanupFails ? 'failed' : 'completed' });
      expect(existsSync(owned!)).toBe(cleanupFails);
    } finally { temp.mockRestore(); chmod.mockRestore(); remove?.mockRestore(); if (owned) rmSync(owned, { recursive: true, force: true }); }
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

  it.each([['ENOENT', 'missing-socket'], ['EACCES', 'access-denied'], ['EPERM', 'access-denied'],
    ['ECONNREFUSED', 'connection-refused']])('retains the closed connection cause for %s without error text', async (code, connectionFailure) => {
    const f = fixture((response, request) => request.emit('error', Object.assign(new Error('CONTROL_SENTINEL private failure'), { code })));
    try {
      const value = await diagnostic.engineObservation(new AbortController().signal);
      expect(value).toEqual({ state: 'unavailable', cause: 'local-engine-unavailable', connectionFailure });
      expect(JSON.stringify(value)).not.toContain('CONTROL_SENTINEL');
      expect(value).not.toHaveProperty('code');
    } finally { f.close(); f.mock.mockRestore(); }
  });

  it.each(['EIO', undefined, '__proto__'])('leaves unknown or absent native connection code %s unaccredited', async code => {
    const f = fixture((response, request) => request.emit('error', Object.assign(new Error('CONTROL_SENTINEL unknown failure'), { code })));
    try {
      const value = await diagnostic.engineObservation(new AbortController().signal);
      expect(value).toEqual({ state: 'unavailable', cause: 'local-engine-unavailable' });
      expect(JSON.stringify(value)).not.toContain('CONTROL_SENTINEL');
    } finally { f.close(); f.mock.mockRestore(); }
  });

  it('shows an actionable closed Engine cause and refuses forged summary text', async () => {
    const receipt = await diagnostic.diagnose(modeledPorts());
    receipt.engine = { state: 'unavailable', cause: 'local-engine-unavailable', connectionFailure: 'missing-socket' };
    expect(policy.renderSummary(receipt)).toContain('Engine: **unavailable (socket missing)**.');
    receipt.engine.connectionFailure = 'CONTROL_SENTINEL';
    expect(policy.renderSummary(receipt)).toContain('Engine: **unavailable (cause unknown)**.');
    expect(policy.renderSummary(receipt)).not.toContain('CONTROL_SENTINEL');
    receipt.engine = { state: 'observed', version: '29.8.2', apiVersion: '1.56', workloadExecuted: false };
    expect(policy.renderSummary(receipt)).toContain('Engine: **version metadata observed; workload not verified**.');
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

  it.each([{ Version: 29, ApiVersion: '1.56' }, { Version: '29.8.2', ApiVersion: 1.56 }])('rejects non-string Engine metadata %j', async metadata => {
    const f = fixture(response => { response.emit('data', Buffer.from(JSON.stringify(metadata))); response.emit('end'); });
    try { expect((await diagnostic.engineObservation(new AbortController().signal)).state).toBe('unavailable'); }
    finally { f.close(); f.mock.mockRestore(); }
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
      expect(JSON.parse(readFileSync(receiptPath, 'utf8'))).toMatchObject({ schemaVersion: 4, executionTransportVerified: true,
      payloadOutputTransport: 'node-fd-write-sync', nodeStreamCompatibility: 'not-measured' });
      expect(JSON.parse(readFileSync(receiptPath, 'utf8')).probes).toHaveLength(10);
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

  it.each(['cancelled', 'factory-failed'])('retains %s as an incomplete failing diagnostic with a receipt', async failure => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sandbox-diagnostic-review-'));
    const originalArgv = process.argv, originalExit = process.exitCode;
    const names = ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'RUNNER_TEMP', 'GITHUB_STEP_SUMMARY'];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      process.argv = [process.execPath, 'diagnostic.cjs'];
      Object.assign(process.env, { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '3', RUNNER_TEMP: directory }); delete process.env.GITHUB_STEP_SUMMARY;
      const ports = modeledPorts();
      ports.execute.mockImplementationOnce(async () => { ports.controller.abort(); return { ...success(), cancelled: true }; });
      const factory = failure === 'factory-failed' ? () => { throw new Error('controlled factory failure'); } : () => ports;
      await expect(diagnostic.main({ nativePorts: factory })).resolves.toBeUndefined();
      const receipt = JSON.parse(readFileSync(path.join(directory, 'copilot-linux-sandbox-123-3.json'), 'utf8'));
      expect(process.exitCode).toBe(1);
      if (failure === 'cancelled') expect(receipt.executionIncomplete).toBe(true);
      else { expect(receipt.preparation.state).toBe('failed'); expect(receipt.probes.every((row: any) => row.state === 'not-run')).toBe(true); }
    } finally {
      process.argv = originalArgv; process.exitCode = originalExit; output.mockRestore();
      for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('manual Linux diagnostic workflow', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/copilot_runner_diagnostics.yml', 'utf8')) as Ports;
  it('retains manual Linux placement and contents read with preparation and retention margin', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']); expect(Object.keys(workflow.jobs)).toEqual(['linux']);
    expect(workflow.jobs.linux['runs-on']).toEqual(['self-hosted', 'codex', 'Linux']);
    expect(workflow.permissions).toEqual({ contents: 'read' }); expect(workflow.jobs.linux['timeout-minutes']).toBe(15);
    const limits = policy.TECHNICAL_TIMEOUTS;
    expect(limits).toEqual({ commandMs: 20000, downloadMs: 60000, terminationGraceMs: 1000, engineMs: 3000 });
    // Three preparation commands and eight sequential probe phases: the three
    // independent transport controls share one phase and all must close.
    const commandPhases = 3 + policy.PROBE_IDS.length - policy.TRANSPORT_IDS.length + 1;
    const diagnosticMs = limits.downloadMs + commandPhases * (limits.commandMs + limits.terminationGraceMs) + limits.engineMs;
    expect(diagnosticMs).toBe(294000);
    expect(workflow.jobs.linux['timeout-minutes'] * 60000 - diagnosticMs).toBeGreaterThanOrEqual(600000);
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
