'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** C55–C58 run the extracted npm tarball, never a TS module or development CLI. */
function smokePackagedSetupPublisher(cliPath, temporaryDirectory) {
  const root = fs.mkdtempSync(path.join(temporaryDirectory, 'publisher-package-'));
  const outside = path.join(root, 'outside-checkout'); fs.mkdirSync(outside);
  const guard = path.resolve(__dirname, '../test-support/setup-publisher-package-guard.cjs');
  let sequence = 0;
  function run(args, expectedStatus, expectedText) {
    const report = path.join(root, `guard-${sequence++}.json`);
    const result = spawnSync(process.execPath, ['--require', guard, cliPath, ...args], {
      cwd: outside, encoding: 'utf8', maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', COPILOT_PUBLISHER_GUARD_REPORT: report },
    });
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
    assert.equal(result.stderr, ''); assert.ok(result.stdout.includes(expectedText), result.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(report, 'utf8')), {
      networkAttempts: [], filesystemWrites: [], childProcesses: [], listeners: [], undiciRequests: 0, exitCode: expectedStatus,
    });
    assert.deepEqual(fs.readdirSync(outside), []);
    return result.stdout;
  }
  const help = run(['setup', '--help'], 0, '--publisher-manifest <path>');
  assert.ok(help.includes('approved two-file installation PR'));
  assert.ok(help.includes('--dry-run')); assert.ok(help.includes('--resume-operation'));

  const invalid = 'The publisher options or local proposal are invalid.';
  const malformed = path.join(root, 'malformed.json'); fs.writeFileSync(malformed, '{');
  const oversized = path.join(root, 'oversized.json'); fs.writeFileSync(oversized, ' '.repeat(128 * 1024 + 1));
  const badUtf8 = path.join(root, 'bad-utf8.json'); fs.writeFileSync(badUtf8, Buffer.from([0xff]));
  for (const proposalPath of [malformed, oversized, badUtf8, outside]) {
    run(['setup', '--publisher-manifest', proposalPath, '--dry-run'], 1, invalid);
  }

  // Well formed but untrusted data. All identities remain unverified in C58.
  const proposal = path.join(root, 'proposal.json');
  fs.writeFileSync(proposal, JSON.stringify({ schemaVersion: 1, kind: 'review-only-publisher-installation-proposal',
    destination: { repository: 'owner/project', repositoryId: 42, defaultBranch: 'main', head: '1'.repeat(40) },
    path: '.github/workflows/copilot_bugbot_status_card.yml', baseline: 'Review-only fixture',
    source: { repository: 'vypdev/copilot', commit: '2'.repeat(40), pullRequest: 989, merged: false,
      maintainerApproval: 'Untrusted fixture', workflowSha256: 'a'.repeat(64), actionManifestSha256: 'b'.repeat(64), actionBundleSha256: 'c'.repeat(64) },
    proposedWorkflowSha256: 'd'.repeat(64), sourceChange: 'Fixture only', consumerTemplatesChanged: false,
    productionVerification: 'disabled', installationAuthorized: false, installedDestinationSha: null,
    nativeCanary: { status: 'not-run', explicitlyAuthorizedPullRequest: null, runId: null }, dependency: 976, coordination: 814 }));
  for (const conflict of [['--yes'], ['--non-interactive'], ['--web'], ['--batch'], ['--config', '']]) {
    run(['setup', '--publisher-manifest', proposal, '--dry-run', ...conflict], 1, invalid);
  }
  run(['setup', '--publisher-manifest', proposal, '--dry-run'], 1, 'Provide a valid --token or PERSONAL_ACCESS_TOKEN');
  return { cases: ['publisher977-C55', 'publisher977-C56', 'publisher977-C57', 'publisher977-C58'],
    invocations: sequence, credentialSupplied: false, effectAttempts: 0, actualApply: false };
}

module.exports = { smokePackagedSetupPublisher };
