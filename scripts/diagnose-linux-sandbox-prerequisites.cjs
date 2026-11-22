'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform } = require('node:stream');
const policy = require('./lib/linux-sandbox-diagnostic-policy.cjs');
const hash = data => createHash('sha256').update(data).digest('hex');

// Fixed diagnostic commands only. This technical bound never wraps a model or
// research operation. Keep actual child close distinct from wrapper rejection.
function execute(command, args, { cwd, env, signal, timeout = policy.TECHNICAL_TIMEOUTS.commandMs }, spawnChild = spawn) {
  if (signal.aborted) return Promise.resolve({ cancelled: true, stdout: null, stderr: null, outputCapture: null, exitCode: null, signal: null });
  return new Promise(resolve => {
    const child = spawnChild(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const result = { stdout: null, stderr: null, outputCapture: null, exitCode: null, signal: null, cancelled: false, timedOut: false, truncated: false };
    const captures = Object.fromEntries(['stdout', 'stderr'].map(key => [key,
      { chunks: [], retainedBytes: 0, observedBytes: 0, observedHash: createHash('sha256') }]));
    let escalation, started = false;
    child.once('spawn', () => { started = true; });
    const kill = name => {
      try { if (child.pid) process.kill(-child.pid, name); }
      catch (error) { if (error.code !== 'ESRCH') result.error ??= 'termination-unavailable'; }
    };
    const terminate = kind => {
      if (result[kind]) return;
      result[kind] = true; kill('SIGTERM');
      escalation ??= setTimeout(() => kill('SIGKILL'), policy.TECHNICAL_TIMEOUTS.terminationGraceMs);
    };
    const abort = () => terminate('cancelled');
    const timer = setTimeout(() => terminate('timedOut'), timeout);
    const consume = key => chunk => {
      const capture = captures[key], remaining = 65536 - capture.retainedBytes;
      capture.observedBytes += chunk.length; capture.observedHash.update(chunk);
      const prefix = chunk.subarray(0, remaining);
      if (prefix.length) { capture.chunks.push(Buffer.from(prefix)); capture.retainedBytes += prefix.length; }
      if (chunk.length > remaining) terminate('truncated');
    };
    child.stdout.on('data', consume('stdout')); child.stderr.on('data', consume('stderr'));
    child.once('error', error => { result.error = error.code || 'launch-unavailable'; });
    child.once('close', (exitCode, childSignal) => {
      clearTimeout(timer); clearTimeout(escalation); signal.removeEventListener('abort', abort);
      if (started) result.outputCapture = { textEncoding: 'utf8-replacement', limitBytesPerChannel: 65536 };
      for (const key of started ? ['stdout', 'stderr'] : []) {
        const capture = captures[key], prefix = Buffer.concat(capture.chunks, capture.retainedBytes);
        // Decode only after joining the raw prefix, so chunk boundaries cannot
        // corrupt UTF8. Raw digests remain distinct from the decoded text view.
        result[key] = prefix.toString('utf8');
        result.outputCapture[key] = { observedBytes: capture.observedBytes, retainedBytes: prefix.length,
          observedSha256: capture.observedHash.digest('hex'), retainedSha256: hash(prefix) };
      }
      result.exitCode = exitCode; result.signal = childSignal; resolve(result);
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function probeCommands(runtime) {
  // The pinned CLI accepts root configuration overrides before its host sandbox
  // command. Exec-only ignore flags are not part of this command's grammar.
  const shellPolicy = mode => ['--config', 'sandbox_mode="read-only"', '--config', `shell_environment_policy.inherit="${mode}"`,
    ...(mode === 'core' ? ['--config', 'shell_environment_policy.ignore_default_excludes=false',
      '--config', 'shell_environment_policy.include_only=["PATH"]'] : []), 'sandbox', '--'];
  // Restricted socket introspection can make Node select dummy stdio streams.
  // These owned witnesses use raw descriptors without changing sandbox policy.
  const read = 'require("node:fs").writeSync(1,require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))';
  const write = 'try{require("node:fs").writeFileSync(process.argv[1],"owned-write-canary");require("node:fs").writeSync(1,"WROTE");process.exitCode=9}catch(e){if(["EACCES","EPERM","EROFS"].includes(e.code))require("node:fs").writeSync(1,"DENIED");else process.exitCode=44}';
  const witness = id => [runtime.node, '-e', 'require("node:fs").writeSync(1,process.argv[1])', id];
  const transport = [runtime.node, '-e', 'require("node:fs").writeSync(1,process.argv[1]);require("node:fs").writeSync(2,process.argv[2]);process.exitCode=37',
    'transport-out:' + runtime.fixtureSha256, 'transport-error:' + runtime.fixtureSha256];
  const transportOutput = transport.at(-2), transportError = transport.at(-1);
  return [
    ['unshare-user-network', '/usr/bin/unshare', ['--user', '--map-root-user', '--net', ...witness('unshare-user-network')], 'unshare-user-network'],
    ['bwrap-user-network', '/usr/bin/bwrap', ['--unshare-user', '--unshare-net', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', ...witness('bwrap-user-network')], 'bwrap-user-network'],
    ['bwrap-root-user-network', '/usr/bin/bwrap', ['--unshare-user', '--uid', '0', '--gid', '0', '--unshare-net', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', ...witness('bwrap-root-user-network')], 'bwrap-root-user-network'],
    ['codex-empty-start', runtime.codex, [...shellPolicy('none'), '/bin/true']],
    ['codex-path-start', runtime.codex, [...shellPolicy('core'), '/bin/true']],
    ['node-execution-transport', runtime.node, transport.slice(1), transportOutput, transportError],
    ['bwrap-execution-transport', '/usr/bin/bwrap', ['--unshare-user', '--uid', '0', '--gid', '0', '--unshare-net', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', ...transport], transportOutput, transportError],
    ['codex-path-execution-transport', runtime.codex, [...shellPolicy('core'), ...transport], transportOutput, transportError],
    ['codex-fixture-read', runtime.codex, [...shellPolicy('core'), runtime.node, '-e', read, runtime.fixture], runtime.fixtureSha256],
    ['codex-write-denial', runtime.codex, [...shellPolicy('core'), runtime.node, '-e', write, runtime.writeTarget], 'DENIED'],
  ];
}

function initialReceipt(identity) {
  return { schemaVersion: 4, kind: 'model-free-linux-sandbox-diagnostic', ...identity,
    preparation: { state: 'unavailable' }, probes: [], qualificationModelCalls: 0, evaluatedPilotWrites: 0,
    productionSettingChanged: false, qualifiedProfiles: [], payloadOutputTransport: policy.PAYLOAD_OUTPUT_TRANSPORT,
    nodeStreamCompatibility: 'not-measured', outputTextEncoding: 'utf8-replacement',
    executionTransportVerified: false, actualSdkOrModelToolAcceptance: false };
}

async function observeProbe(ports, [id, executable, args, expected, expectedError]) {
  const result = await ports.execute(executable, args);
  const observation = policy.observation(id, result, expected, expectedError);
  const canaryMismatch = id === 'codex-write-denial' && !await ports.writeAbsent();
  return { ...observation, ...(canaryMismatch ? { state: 'fail', reason: 'unexpected-write' } : {}),
    stdout: typeof result.stdout === 'string' ? ports.project(result.stdout) : null,
    stderr: typeof result.stderr === 'string' ? ports.project(result.stderr) : null,
    stdoutSha256: typeof result.stdout === 'string' ? hash(result.stdout) : null,
    stderrSha256: typeof result.stderr === 'string' ? hash(result.stderr) : null,
    outputCapture: result.outputCapture ?? null, outputTruncated: result.truncated === true };
}

async function diagnose(ports) {
  const receipt = initialReceipt(ports.identity);
  let runtime, cancelled = false, executionVerified = false;
  try {
    const candidate = await ports.prepare();
    assert.equal(candidate.version, policy.CODEX_VERSION, 'exact diagnostic CLI version required');
    runtime = candidate;
    receipt.preparation = { state: 'observed', runtime: runtime.identity };
    const commands = probeCommands(runtime);
    for (let index = 0; index < commands.length; index++) {
      const command = commands[index], [id] = command;
      if (id === policy.TRANSPORT_IDS[0]) {
        const controls = commands.slice(index, index + policy.TRANSPORT_IDS.length);
        assert.deepEqual(controls.map(([controlId]) => controlId), policy.TRANSPORT_IDS);
        // These three harmless payloads are independent; exactly one uses the
        // private Codex HOME. Settle every sibling before cleanup, even when a
        // command observation fails. No model work is scheduled here.
        const settled = await Promise.allSettled(controls.map(control => ports.signal.aborted || cancelled
          ? Promise.resolve(policy.notRun(control[0], 'cancelled')) : observeProbe(ports, control)));
        const rows = settled.map((outcome, offset) => {
          if (outcome.status === 'fulfilled') return outcome.value;
          receipt.executionIncomplete = true;
          return policy.notRun(controls[offset][0], ports.signal.aborted ? 'cancelled' : 'observation-unavailable');
        });
        receipt.probes.push(...rows);
        if (rows.some(row => row.state === 'cancelled' || row.reason === 'cancelled')) cancelled = true;
        executionVerified = rows.every(row => row.state === 'pass');
        receipt.executionTransportVerified = executionVerified;
        if (!executionVerified) receipt.executionIncomplete = true;
        index += policy.TRANSPORT_IDS.length - 1;
        continue;
      }
      if (ports.signal.aborted || cancelled) { receipt.executionIncomplete = true; receipt.probes.push(policy.notRun(id, 'cancelled')); continue; }
      if (['codex-fixture-read', 'codex-write-denial'].includes(id) && !executionVerified) {
        receipt.executionIncomplete = true; receipt.probes.push(policy.notRun(id, 'execution-unverified')); continue;
      }
      const observation = await observeProbe(ports, command); receipt.probes.push(observation);
      if (observation.state === 'cancelled') { receipt.executionIncomplete = true; cancelled = true; }
    }
  } catch (error) {
    receipt.executionIncomplete = true;
    if (!runtime) receipt.preparation = { state: ports.signal.aborted ? 'cancelled' : 'failed',
      cause: error.code === 'ENOENT' ? 'missing-prerequisite' : 'preparation-or-provenance-failed',
      boundary: ['official-download', 'archive-inventory', 'extraction', 'executable-identity', 'package-metadata', 'version', 'fixture'].includes(error.diagnosticBoundary)
        ? error.diagnosticBoundary : 'unknown' };
    for (const id of policy.PROBE_IDS.slice(receipt.probes.length)) receipt.probes.push(policy.notRun(id,
      ports.signal.aborted ? 'cancelled' : runtime ? 'observation-unavailable' : 'preparation-failed'));
  } finally {
    try { receipt.engine = await ports.engine(); }
    catch { receipt.engine = { state: 'unavailable', cause: 'observation-unavailable' }; }
    try { await ports.release(); receipt.cleanup = 'completed'; }
    catch { receipt.cleanup = 'failed'; }
    if (ports.signal.aborted) receipt.executionIncomplete = true;
  }
  return receipt;
}

async function downloadArchive(archive, target, signal) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(policy.TECHNICAL_TIMEOUTS.downloadMs)]);
  const response = await fetch(archive.url, { signal });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('official release download unavailable');
  }
  let bytes = 0; const digest = createHash('sha256');
  const meter = new Transform({ transform(chunk, encoding, done) {
    bytes += chunk.length;
    if (bytes > archive.bytes) return done(new Error('official archive length mismatch'));
    digest.update(chunk); done(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal });
  assert.equal(bytes, archive.bytes, 'official archive length mismatch');
  assert.equal(digest.digest('hex'), archive.sha256, 'official archive digest mismatch');
}

function engineObservation(signal) {
  if (signal.aborted) return Promise.resolve({ state: 'unavailable', cause: 'cancelled' });
  const unavailable = error => {
    const connectionFailure = policy.engineConnectionFailure(error?.code);
    return { state: 'unavailable', cause: 'local-engine-unavailable', ...(connectionFailure ? { connectionFailure } : {}) };
  };
  let request, response, responseClosed, resolveClosed, complete = false;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const pending = new Promise(resolve => {
    const socket = '/var/run/docker.sock';
    const finish = value => { if (!complete) { complete = true; request?.destroy(); response?.destroy(); resolve(value); } };
    const abort = () => finish({ state: 'unavailable', cause: 'cancelled' });
    try {
    request = http.request({ socketPath: socket, path: '/version', method: 'GET', agent: false, timeout: policy.TECHNICAL_TIMEOUTS.engineMs }, incoming => {
      response = incoming; responseClosed = new Promise(done => incoming.once('close', done));
      if (complete) { incoming.destroy(); return; }
      let data = ''; incoming.on('data', chunk => { data += chunk; if (Buffer.byteLength(data) > 8192) finish({ state: 'unavailable', cause: 'invalid-metadata' }); });
      incoming.once('error', () => finish({ state: 'unavailable', cause: 'transport-unavailable' }));
      incoming.once('aborted', () => finish({ state: 'unavailable', cause: 'transport-unavailable' }));
      incoming.once('end', () => {
        try {
          const value = JSON.parse(data);
          assert.equal(incoming.statusCode, 200);
          assert.equal(typeof value.Version, 'string'); assert.equal(typeof value.ApiVersion, 'string');
          assert(/^[0-9][0-9A-Za-z.+-]{0,63}$/u.test(value.Version));
          assert(/^\d{1,3}\.\d{1,3}$/u.test(value.ApiVersion));
          finish({ state: 'observed', version: value.Version, apiVersion: value.ApiVersion, workloadExecuted: false });
        } catch { finish({ state: 'unavailable', cause: 'invalid-metadata' }); }
      });
    });
    request.once('close', resolveClosed);
    request.once('close', () => signal.removeEventListener('abort', abort));
    request.once('error', error => finish(unavailable(error)));
    request.once('timeout', () => finish({ state: 'unavailable', cause: 'transport-timeout' }));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else request.end();
    } catch (error) {
      if (!request) resolveClosed();
      finish(unavailable(error));
    }
  });
  return pending.finally(async () => { request?.destroy(); response?.destroy(); await closed; if (responseClosed) await responseClosed; });
}

function observeSystemBwrap(file = '/usr/bin/bwrap') {
  try {
    const canonical = fs.realpathSync(file), before = fs.statSync(canonical);
    assert(before.isFile() && before.size > 0 && before.size <= 2 * 1024 * 1024, 'bounded regular helper required');
    const bytes = fs.readFileSync(canonical), after = fs.statSync(canonical);
    assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size
      && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs && bytes.length === after.size,
    'helper identity changed while observing');
    return { state: 'observed', canonicalPath: canonical, bytes: bytes.length, sha256: hash(bytes),
      format: bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ? 'ELF'
        : bytes.subarray(0, 2).toString('ascii') === '#!' ? 'script' : 'other',
      ownerUid: after.uid, ownerGid: after.gid, mode: after.mode & 0o7777,
      payloadExecutionVerified: false };
  } catch { return { state: 'unavailable', cause: 'identity-unavailable', payloadExecutionVerified: false }; }
}

function nativePorts(signal, dependencies = {}) {
  let privateRoot;
  try {
  assert.equal(dependencies.platform ?? process.platform, 'linux', 'Linux diagnostic only');
  const archive = policy.archiveFor(dependencies.architecture ?? process.arch);
  privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-linux-sandbox-')); fs.chmodSync(privateRoot, 0o700);
  const home = path.join(privateRoot, 'home'), temporary = path.join(privateRoot, 'tmp');
  const codexHome = path.join(home, '.codex');
  fs.mkdirSync(home, { mode: 0o700 }); fs.mkdirSync(codexHome, { mode: 0o700 }); fs.mkdirSync(temporary, { mode: 0o700 });
  const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, CODEX_HOME: codexHome,
    XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: temporary, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  const run = (executable, args) => (dependencies.execute ?? execute)(executable, args, { cwd: privateRoot, env, signal });
  const fixture = path.join(privateRoot, 'fixture.txt'), writeTarget = path.join(privateRoot, 'write-canary.txt');
  return { signal,
    identity: { sourceCommit: /^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA || '') ? process.env.GITHUB_SHA : null,
      driverSha256: hash(fs.readFileSync(__filename)), policySha256: hash(fs.readFileSync(require.resolve('./lib/linux-sandbox-diagnostic-policy.cjs'))),
      os: 'linux', architecture: process.arch, kernel: os.release(), effectiveUid: process.geteuid(),
      systemBwrap: observeSystemBwrap() },
    project: text => policy.outputProjection(text, privateRoot), execute: run,
    async prepare() {
      let boundary = 'official-download';
      try {
      const target = path.join(privateRoot, 'codex.tar.gz'); await (dependencies.downloadArchive ?? downloadArchive)(archive, target, signal);
      boundary = 'archive-inventory';
      const list = await run('/usr/bin/tar', ['-tzf', target]);
      assert.equal(list.exitCode, 0); assert(!list.truncated && !list.error && !list.signal);
      assert.equal(hash(list.stdout), archive.inventorySha256, 'unexpected official package inventory');
      boundary = 'extraction';
      const runtimeRoot = path.join(privateRoot, 'runtime'); fs.mkdirSync(runtimeRoot, { mode: 0o700 });
      const packageRoot = fs.realpathSync(runtimeRoot);
      const extracted = await run('/usr/bin/tar', ['-xzf', target, '-C', packageRoot]);
      assert.equal(extracted.exitCode, 0); assert(!extracted.error && !extracted.signal);
      boundary = 'executable-identity';
      const packageExecutables = ['bin/codex', 'bin/codex-code-mode-host', 'bin/codex-exec-server', 'codex-path/rg', 'codex-resources/bwrap'].map(member => {
        const file = path.join(packageRoot, member), stat = fs.lstatSync(file);
        assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && stat.size > 0);
        assert.equal(fs.realpathSync(file), file, 'package member must not traverse symlinks');
        fs.chmodSync(file, 0o700);
        return { path: member, bytes: stat.size, sha256: hash(fs.readFileSync(file)) };
      });
      boundary = 'package-metadata';
      const metadataFile = path.join(packageRoot, 'codex-package.json'), metadataStat = fs.lstatSync(metadataFile);
      assert(metadataStat.isFile() && !metadataStat.isSymbolicLink() && metadataStat.uid === process.getuid()
        && metadataStat.size > 0 && metadataStat.size <= 4096);
      assert.equal(fs.realpathSync(metadataFile), metadataFile);
      assert.deepEqual(JSON.parse(fs.readFileSync(metadataFile, 'utf8')), archive.manifest, 'unexpected official package metadata');
      const codex = path.join(packageRoot, 'bin/codex');
      const executableSha256 = packageExecutables[0].sha256, nodeSha256 = hash(fs.readFileSync(process.execPath));
      boundary = 'version';
      const version = await run(codex, ['--version']);
      assert.equal(version.exitCode, 0); assert(!version.error && !version.signal && !version.truncated);
      assert.equal(version.stdout.trim(), 'codex-cli ' + policy.CODEX_VERSION);
      boundary = 'fixture';
      fs.writeFileSync(fixture, 'owned model-free Linux sandbox read fixture\n', { flag: 'wx', mode: 0o600 });
      const fixtureSha256 = hash(fs.readFileSync(fixture));
      return { version: policy.CODEX_VERSION, codex, node: process.execPath, fixture, writeTarget, fixtureSha256,
        identity: { version: policy.CODEX_VERSION, executableSha256, distributionSha256: archive.sha256,
          archiveInventorySha256: archive.inventorySha256, packageLayoutVersion: archive.manifest.layoutVersion, packageExecutables,
          nodeVersion: process.versions.node, nodeSha256, fixtureSha256 } };
      } catch (error) { error.diagnosticBoundary = boundary; throw error; }
    },
    writeAbsent: async () => !fs.existsSync(writeTarget),
    engine: () => engineObservation(signal),
    release: async () => fs.rmSync(privateRoot, { recursive: true, force: true }),
  };
  } catch (error) {
    error.diagnosticCleanup = 'not-created';
    if (privateRoot) {
      try { fs.rmSync(privateRoot, { recursive: true, force: true }); error.diagnosticCleanup = 'completed'; }
      catch { error.diagnosticCleanup = 'failed'; }
    }
    throw error;
  }
}

async function main(dependencies = {}) {
  assert.equal(process.argv.length, 2, 'diagnostic accepts no arguments');
  assert(/^\d+$/u.test(process.env.GITHUB_RUN_ID || '') && /^\d+$/u.test(process.env.GITHUB_RUN_ATTEMPT || ''), 'native run identity required');
  const reportRoot = fs.realpathSync(process.env.RUNNER_TEMP);
  const report = path.join(reportRoot, `copilot-linux-sandbox-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}.json`);
  const controller = new AbortController(), abort = () => controller.abort();
  process.once('SIGTERM', abort); process.once('SIGINT', abort);
  try {
    let ports, receipt;
    try { ports = (dependencies.nativePorts ?? nativePorts)(controller.signal); }
    catch (error) {
      receipt = { ...initialReceipt({
        sourceCommit: /^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA || '') ? process.env.GITHUB_SHA : null,
        os: process.platform, architecture: process.arch,
      }), preparation: { state: controller.signal.aborted ? 'cancelled' : 'failed',
        cause: 'adapter-initialization-failed', boundary: 'adapter-initialization' },
      probes: policy.PROBE_IDS.map(id => policy.notRun(id, controller.signal.aborted ? 'cancelled' : 'preparation-failed')),
      engine: { state: 'unavailable', cause: 'preparation-unavailable' }, executionIncomplete: true,
      cleanup: ['not-created', 'completed', 'failed'].includes(error?.diagnosticCleanup) ? error.diagnosticCleanup : 'unavailable' };
    }
    if (ports) receipt = await diagnose(ports);
    fs.writeFileSync(report, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const summary = policy.renderSummary(receipt);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log(summary);
    process.exitCode = receipt.preparation.state === 'observed' && receipt.cleanup === 'completed' && !receipt.executionIncomplete ? 0 : 1;
  } finally { process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort); }
}

module.exports = { execute, probeCommands, diagnose, downloadArchive, engineObservation, observeSystemBwrap, nativePorts, main };
if (require.main === module) void main().catch(() => { console.error('Linux diagnostic preparation unavailable; no qualification result.'); process.exitCode = 1; });
