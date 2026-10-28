import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { buildInitialDeploymentOperation } from '../../application/policies/deployment_plan_policy';
import { DEFAULT_DEPLOYMENT_CONFIGURATION } from '../../domain/deployment_configuration';

it.each(['fresh', 'tag-exists', 'invalid-revision'])('runs the real standalone bundle with only native reads: %s', async scenario => {
  const directory = mkdtempSync(join(tmpdir(), 'copilot-732-packaged-'));
  const oldSha = 'a'.repeat(40); const reviewed = 'b'.repeat(40); const baseSha = 'c'.repeat(40);
  const operation = { ...buildInitialDeploymentOperation({ operationId: 'operation-previous', locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
    kind: 'release', version: '1.5.2', title: 'Release', changelog: 'Changes', sourceBranch: 'release/1.5.2', sourceSha: oldSha,
    originBranch: 'develop', originSha: 'd'.repeat(40), productionBranch: 'master', developmentBranch: 'develop',
    configuration: DEFAULT_DEPLOYMENT_CONFIGURATION, publicationWorkflow: 'release.yml' }), revision: 3, phase: 'promotion_pr_pending', promotionPullRequest: 173 };
  const configuration = { schemaVersion: 3, branchType: 'release', releaseBranch: operation.sourceBranch, deploymentOrchestration: operation };
  const body = '### Release Type\n\nPatch\n\n### Release Version\n\n1.5.2\n\n### Changelog\n\nChanges\n\n### Additional Context\n\nNone\n\n<!-- copilot-configuration-start\n' + JSON.stringify(configuration) + '\ncopilot-configuration-end -->';
  const calls: Array<{ method: string; path: string }> = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost'); const path = decodeURIComponent(url.pathname); calls.push({ method: request.method!, path });
    response.setHeader('content-type', 'application/json'); let data: unknown;
    if (request.method === 'POST' && path === '/graphql') data = { data: { node: { id: 'PR173', mergeQueueEntry: null } } };
    else if (request.method !== 'GET') { response.statusCode = 405; data = { message: 'mutation forbidden' }; }
    else if (path.endsWith('/issues/170')) data = { id: 100, number: 170, state: 'open', labels: [{ name: 'release' }], body };
    else if (path.endsWith('/actions/runs/50')) data = { id: 50, run_attempt: 1, repository: { full_name: 'owner/project' }, head_repository: { full_name: 'owner/project' },
      head_branch: operation.sourceBranch, head_sha: reviewed, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'in_progress' };
    else if (path.endsWith('/git/ref/heads/master')) data = { object: { type: 'commit', sha: baseSha } };
    else if (path.endsWith('/git/ref/heads/release/1.5.2')) data = { object: { type: 'commit', sha: reviewed } };
    else if (path.includes('/git/ref/tags/')) { response.statusCode = scenario === 'tag-exists' ? 200 : 404; data = { object: { type: 'commit', sha: reviewed } }; }
    else if (path.includes('/compare/')) data = { status: path.endsWith(baseSha) ? 'diverged' : 'ahead' };
    else if (path.endsWith('/pulls/173')) data = { number: 173, node_id: 'PR173', body: '<!-- copilot-deployment operation-id="operation-previous" phase="promotion" issue="170" -->',
      state: 'closed', merged: false, merged_at: null, auto_merge: null, head: { ref: operation.sourceBranch, sha: reviewed, repo: { full_name: 'owner/project' } }, base: { ref: 'master', repo: { full_name: 'owner/project' } } };
    else if (path.endsWith('/pulls') || path.endsWith('/releases')) data = [];
    else if (path === '/repos/owner/project') data = { full_name: 'owner/project', permissions: { push: true } };
    else { response.statusCode = 404; data = { message: 'unrecognized read' }; }
    response.end(JSON.stringify(data));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture server');
    const event = join(directory, 'event.json'); const output = join(directory, 'output'); const summary = join(directory, 'summary'); const privateHome = join(directory, 'untouched-home');
    writeFileSync(event, JSON.stringify({ inputs: { mode: 'replace' }, repository: { owner: { login: 'owner' }, name: 'project' } })); writeFileSync(output, ''); writeFileSync(summary, '');
    const env = { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${address.port}`, GITHUB_GRAPHQL_URL: `http://127.0.0.1:${address.port}/graphql`,
      GITHUB_REPOSITORY: 'owner/project', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: event, GITHUB_SHA: reviewed, GITHUB_REF: 'refs/heads/release/1.5.2',
      GITHUB_RUN_ID: '50', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, HOME: privateHome,
      HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '127.0.0.1,localhost',
      INPUT_VARS_JSON: JSON.stringify({ issue: '999', 'single-action': 'create_tag', token: 'UNTRUSTED_OVERRIDE' }),
      INPUT_TOKEN: 'PRIVATE_TEST_PRODUCT_TOKEN', INPUT_ISSUE: '170', 'INPUT_OPERATION-ID': 'operation-previous', 'INPUT_EXPECTED-REVISION': scenario === 'invalid-revision' ? '0' : '3',
      INPUT_VERSION: '1.5.2', 'INPUT_SOURCE-SHA': reviewed, 'INPUT_CONFIRM-UNPUBLISHED': 'true', 'INPUT_ISSUE-WORKFLOW-PROFILE': '', 'INPUT_REPOSITORY-LOCALE': 'en-US' };
    const result = await new Promise<{ code: number | null; text: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [join(process.cwd(), 'deployment-recovery/index.cjs')], { env, cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] }); let text = '';
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Standalone fixture timed out')); }, 15000);
      child.stdout.on('data', data => { text += data; }); child.stderr.on('data', data => { text += data; }); child.once('error', reject); child.once('exit', code => { clearTimeout(timeout); resolve({ code, text }); });
    });
    expect(result.text).not.toMatch(/PRIVATE_TEST_PRODUCT_TOKEN|UNTRUSTED_OVERRIDE/); expect(existsSync(privateHome)).toBe(false);
    expect(calls.every(call => call.method === 'GET' || call.method === 'POST' && call.path === '/graphql')).toBe(true);
    if (scenario === 'fresh') { expect(result.code).toBe(0); expect(readFileSync(output, 'utf8')).toContain('prepare'); expect(calls.length).toBeGreaterThan(5); }
    else { expect(result.code).toBe(1); expect(readFileSync(output, 'utf8')).toBe(''); expect(readFileSync(summary, 'utf8')).toContain('blocked'); }
    if (scenario === 'invalid-revision') expect(calls).toHaveLength(0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); }
}, 20000);
