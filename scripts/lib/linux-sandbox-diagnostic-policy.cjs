'use strict';
const assert = require('node:assert/strict');

const CODEX_VERSION = '0.171.0';
const PAYLOAD_OUTPUT_TRANSPORT = 'node-fd-write-sync';
const TECHNICAL_TIMEOUTS = Object.freeze({ commandMs: 20000, downloadMs: 60000, terminationGraceMs: 1000, engineMs: 3000 });
const ENGINE_CONNECTION_FAILURES = Object.freeze({ ENOENT: 'missing-socket', EACCES: 'access-denied',
  EPERM: 'access-denied', ECONNREFUSED: 'connection-refused' });
const ARCHIVES = Object.freeze({
  x64: Object.freeze({ target: 'x86_64-unknown-linux-musl', bytes: 197763180,
    sha256: '8391d67757496bfd14893eca6cbf0c96994bf2627566ff1f018f70600c9ef6b3' }),
  arm64: Object.freeze({ target: 'aarch64-unknown-linux-musl', bytes: 199315347,
    sha256: 'd8c43bee6cf11b01eb18b95f4d7961092bc40228180808859e70dabb7784c1c9' }),
});
const TRANSPORT_IDS = Object.freeze(['node-execution-transport', 'bwrap-execution-transport', 'codex-path-execution-transport']);
const PROBE_IDS = Object.freeze(['unshare-user-network', 'bwrap-user-network', 'bwrap-root-user-network',
  'codex-empty-start', 'codex-path-start', ...TRANSPORT_IDS, 'codex-fixture-read', 'codex-write-denial']);

function archiveFor(architecture) {
  assert(Object.hasOwn(ARCHIVES, architecture), 'unsupported diagnostic architecture');
  const archive = ARCHIVES[architecture];
  return Object.freeze({ ...archive, version: CODEX_VERSION,
    inventorySha256: '99caccd38a47e1dd9df829646c99b4efc24e0e751dea0a2781f98698b7045e9e',
    manifest: Object.freeze({ layoutVersion: 1, version: CODEX_VERSION, target: archive.target, variant: 'codex',
      entrypoint: 'bin/codex', execServer: 'bin/codex-exec-server', resourcesDir: 'codex-resources', pathDir: 'codex-path' }),
    url: `https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-package-${archive.target}.tar.gz` });
}

function outputProjection(text, privateRoot) {
  assert.equal(typeof text, 'string');
  assert.equal(typeof privateRoot, 'string'); assert(privateRoot.startsWith('/') && privateRoot.length > 1);
  const privatePattern = privateRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text.replace(new RegExp(privatePattern, 'gu'), '<diagnostic-root>')
    .replace(/\/(?:home|Users)\/[^/\s"'<>]+/gu, '/<account>');
}

function observation(id, result, expectedOutput, expectedError) {
  assert(PROBE_IDS.includes(id), 'unknown diagnostic probe');
  const transport = TRANSPORT_IDS.includes(id), expectedExitCode = transport ? 37 : 0;
  const exitCode = Number.isInteger(result.exitCode) && result.exitCode >= 0 ? result.exitCode : null;
  const signal = typeof result.signal === 'string' && /^SIG[A-Z0-9]{1,20}$/u.test(result.signal) ? result.signal : null;
  const completeOutput = typeof result.stdout === 'string' && typeof result.stderr === 'string';
  const proofSpecified = !transport || typeof expectedOutput === 'string' && expectedOutput.length > 0
    && typeof expectedError === 'string' && expectedError.length > 0;
  const outputMatches = completeOutput && proofSpecified
    && (expectedOutput === undefined || result.stdout === expectedOutput)
    && (expectedError === undefined || result.stderr === expectedError);
  const reason = result.cancelled ? 'cancelled' : result.timedOut ? 'technical-timeout'
    : result.error === 'ENOENT' ? 'missing-tool' : result.error ? 'launch-unavailable'
      : result.truncated ? 'output-incomplete' : exitCode === expectedExitCode && !signal && result.signal === null
        ? outputMatches ? 'verified' : 'assertion-mismatch'
        : 'command-failed';
  return Object.freeze({ id, state: reason === 'verified' ? 'pass' : reason === 'missing-tool' || reason === 'launch-unavailable'
    ? 'unavailable' : reason === 'cancelled' ? 'cancelled' : 'fail', expectedExitCode,
    kind: transport ? 'execution-transport' : 'prerequisite', exitCode, signal, reason });
}

function notRun(id, reason) {
  assert(PROBE_IDS.includes(id));
  assert(['preparation-failed', 'observation-unavailable', 'cancelled', 'execution-unverified'].includes(reason));
  const transport = TRANSPORT_IDS.includes(id);
  return Object.freeze({ id, state: 'not-run', expectedExitCode: transport ? 37 : 0,
    kind: transport ? 'execution-transport' : 'prerequisite', exitCode: null, signal: null, reason });
}

function engineConnectionFailure(code) {
  return typeof code === 'string' && Object.hasOwn(ENGINE_CONNECTION_FAILURES, code) ? ENGINE_CONNECTION_FAILURES[code] : undefined;
}

function renderSummary(receipt) {
  const engine = receipt.engine ?? {}, labels = { 'missing-socket': 'socket missing',
    'access-denied': 'socket access denied', 'connection-refused': 'connection refused' };
  const failure = typeof engine.connectionFailure === 'string' && Object.hasOwn(labels, engine.connectionFailure)
    ? labels[engine.connectionFailure] : 'cause unknown';
  const engineStatus = engine.state === 'observed' ? 'version metadata observed; workload not verified' : 'unavailable (' + failure + ')';
  const lines = ['# Linux sandbox diagnostic', '',
    `Runtime preparation: **${receipt.preparation.state}**. Codex target: **${CODEX_VERSION}**.`, '',
    `Collection: **${receipt.executionIncomplete ? 'incomplete' : 'complete'}**. Cleanup: **${receipt.cleanup ?? 'unavailable'}**.`, '',
    `Engine: **${engineStatus}**.`, '',
    `Payload transport: **${PAYLOAD_OUTPUT_TRANSPORT}**. Node stream compatibility: **not measured**.`, '',
    'Truncated output is incomplete. The receipt separates raw byte identities from projected text.', '',
    '| Probe | Observation | Expected exit | Actual exit | Signal |', '|---|---|---:|---:|---|'];
  for (const row of receipt.probes) lines.push(`| ${row.id} | ${row.state} (${row.reason}) | ${row.expectedExitCode} | ${row.exitCode ?? 'unknown'} | ${row.signal ?? 'none'} |`);
  lines.push('', 'Only the three execution-transport controls expect exit37, with exact stdout and stderr markers. Other probes require exit0.',
    'Owned read/write probes require all three transport controls to verify. Silent exit0 is not execution proof.');
  lines.push('', 'Next: inspect failed or unavailable prerequisites before any qualification attempt.',
    'These are model-free command observations. SDK/model tools, credential/oracle denial and qualification remain unverified.',
    'Production settings were not changed. Qualification model calls: 0. Evaluated-pilot writes: 0.');
  return lines.join('\n') + '\n';
}

module.exports = { CODEX_VERSION, PAYLOAD_OUTPUT_TRANSPORT, TECHNICAL_TIMEOUTS, PROBE_IDS, TRANSPORT_IDS, archiveFor, outputProjection, observation, notRun, engineConnectionFailure, renderSummary };
