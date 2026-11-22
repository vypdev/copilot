'use strict';
const assert = require('node:assert/strict');

const CODEX_VERSION = '0.171.0';
const ARCHIVES = Object.freeze({
  x64: Object.freeze({ target: 'x86_64-unknown-linux-musl', bytes: 122664925,
    sha256: '01baa2e47809f8597be5b2f8abd4e4dfe3fb5bcb6e504c2fbaaad97056c15e8d' }),
  arm64: Object.freeze({ target: 'aarch64-unknown-linux-musl', bytes: 124436451,
    sha256: 'bcf50b836385e51bd2976ab2bbe92b1b08a1cbe37712eb8dbe378aa78d24871c' }),
});
const PROBE_IDS = Object.freeze(['unshare-user-network', 'bwrap-user-network', 'bwrap-root-user-network',
  'codex-empty-start', 'codex-path-start', 'codex-fixture-read', 'codex-write-denial']);

function archiveFor(architecture) {
  assert(Object.hasOwn(ARCHIVES, architecture), 'unsupported diagnostic architecture');
  const archive = ARCHIVES[architecture];
  return Object.freeze({ ...archive, version: CODEX_VERSION,
    url: `https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-${archive.target}.tar.gz` });
}

function outputProjection(text, privateRoot) {
  assert.equal(typeof text, 'string');
  assert.equal(typeof privateRoot, 'string'); assert(privateRoot.startsWith('/') && privateRoot.length > 1);
  const privatePattern = privateRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text.replace(new RegExp(privatePattern, 'gu'), '<diagnostic-root>')
    .replace(/\/(?:home|Users)\/[^/\s"'<>]+/gu, '/<account>');
}

function observation(id, result, expectedOutput) {
  assert(PROBE_IDS.includes(id), 'unknown diagnostic probe');
  const exitCode = Number.isInteger(result.exitCode) && result.exitCode >= 0 ? result.exitCode : null;
  const signal = typeof result.signal === 'string' && /^SIG[A-Z0-9]{1,20}$/u.test(result.signal) ? result.signal : null;
  const reason = result.cancelled ? 'cancelled' : result.timedOut ? 'technical-timeout'
    : result.error === 'ENOENT' ? 'missing-tool' : result.error ? 'launch-unavailable'
      : result.truncated ? 'output-incomplete' : exitCode === 0 && !signal && result.signal == null
        ? expectedOutput === undefined || result.stdout.trim() === expectedOutput ? 'verified' : 'assertion-mismatch'
        : 'command-failed';
  return Object.freeze({ id, state: reason === 'verified' ? 'pass' : reason === 'missing-tool' || reason === 'launch-unavailable'
    ? 'unavailable' : reason === 'cancelled' ? 'cancelled' : 'fail', exitCode, signal, reason });
}

function notRun(id, reason) {
  assert(PROBE_IDS.includes(id));
  assert(['preparation-failed', 'observation-unavailable', 'cancelled'].includes(reason));
  return Object.freeze({ id, state: 'not-run', exitCode: null, signal: null, reason });
}

function renderSummary(receipt) {
  const lines = ['# Linux sandbox diagnostic', '',
    `Runtime preparation: **${receipt.preparation.state}**. Codex target: **${CODEX_VERSION}**.`, '',
    `Collection: **${receipt.executionIncomplete ? 'incomplete' : 'complete'}**. Cleanup: **${receipt.cleanup ?? 'unavailable'}**.`, '',
    '| Probe | Observation | Exit | Signal |', '|---|---|---:|---|'];
  for (const row of receipt.probes) lines.push(`| ${row.id} | ${row.state} (${row.reason}) | ${row.exitCode ?? 'unknown'} | ${row.signal ?? 'none'} |`);
  lines.push('', 'Next: inspect failed or unavailable prerequisites before any qualification attempt.',
    'These are model-free command observations. SDK/model tools, credential/oracle denial and qualification remain unverified.',
    'Production settings were not changed. Qualification model calls: 0. Evaluated-pilot writes: 0.');
  return lines.join('\n') + '\n';
}

module.exports = { CODEX_VERSION, PROBE_IDS, archiveFor, outputProjection, observation, notRun, renderSummary };
