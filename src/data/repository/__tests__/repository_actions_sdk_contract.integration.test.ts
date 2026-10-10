import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// The ordinary Jest suite maps @actions/github to a test double. This child
// uses the installed SDK with an intercepted fetch boundary: no live requests.
test('real Octokit routes support inventory and scope-preserving Secret/Variable writes', () => {
    const output = execFileSync(process.execPath, [resolve('test-support/github-actions-sdk-contract.cjs')], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 15_000,
        env: { ...process.env, PERSONAL_ACCESS_TOKEN: '', GH_TOKEN: '', GITHUB_TOKEN: '' },
    });
    const result = JSON.parse(output);
    expect(result.inventory).toBe('available');
    expect(result.secretResult).toEqual({ created: 1, updated: 0, skipped: 0, errors: [] });
    expect(result.requests).toEqual(expect.arrayContaining([
        { method: 'GET', path: '/repos/owner/repo/actions/organization-secrets' },
        { method: 'GET', path: '/repos/owner/repo/actions/organization-variables' },
        { method: 'POST', path: '/orgs/owner/actions/variables' },
        { method: 'PATCH', path: '/orgs/owner/actions/variables/EXISTING_VAR' },
    ]));
}, 20_000);

test('real Octokit reuses confirmed inherited Variable access without redundant grants', () => {
    const output = execFileSync(process.execPath, [resolve('test-support/github-actions-sdk-contract.cjs'), '--existing-access'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 15_000,
        env: { ...process.env, PERSONAL_ACCESS_TOKEN: '', GH_TOKEN: '', GITHUB_TOKEN: '' },
    });
    const result = JSON.parse(output);
    expect(result.existingAccess).toBe(true);
    expect(result.requests.filter((request: { path: string }) => request.path.endsWith('/organization-variables'))).toHaveLength(4);
    expect(result.requests).toEqual(expect.arrayContaining([
        { method: 'GET', path: '/repos/owner/repo/actions/organization-variables' },
        { method: 'PATCH', path: '/orgs/owner/actions/variables/EXISTING_VAR' },
        { method: 'POST', path: '/orgs/owner/actions/variables' },
    ]));
    expect(result.requests.filter((request: { method: string; path: string }) => request.method === 'PUT' && request.path.includes('/variables/'))).toEqual([]);
}, 20_000);
