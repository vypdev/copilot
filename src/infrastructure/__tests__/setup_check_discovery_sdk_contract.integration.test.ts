import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test('real Octokit lists latest runs without search filters and joins only fresh PR evidence', () => {
  const output = execFileSync(process.execPath, [resolve('test-support/setup-check-discovery-sdk-contract.cjs')], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, PERSONAL_ACCESS_TOKEN: '', GH_TOKEN: '', GITHUB_TOKEN: '' },
  });
  const { result, requests } = JSON.parse(output);
  expect(requests).toHaveLength(3);
  expect(requests[0]).toEqual({ method: 'GET', path: '/repos/owner/repo/actions/runs',
    query: { per_page: '100', page: '1' } });
  expect(result.status).toBe('observed');
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({ name: 'Tests', sourceAppId: 15368,
    workflowName: 'CI', runUrl: 'https://github.com/owner/repo/actions/runs/42', observedAt: '2026-10-07T11:00:00Z' });
}, 20_000);
