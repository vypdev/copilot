import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';

const { assertSourceHealthPolicy } = require('../../../scripts/credential-health-source-contract.cjs');
const workflow = load(readFileSync(path.join(process.cwd(), '.github/workflows/copilot_credential_health.yml'), 'utf8')) as {
    jobs: Record<string, { if: string; 'runs-on': { group: string; labels: string[] } }>;
};
const baseline = { triggering_actor: 'efraespada', actor_id: '1783618', event_name: 'workflow_dispatch', repository: 'vypdev/copilot',
    ref: 'refs/heads/master', workflow_ref: 'vypdev/copilot/.github/workflows/copilot_credential_health.yml@refs/heads/master',
    event: { repository: { default_branch: 'master' } } };

function selected(condition: string, overrides: Record<string, unknown> = {}, enabled = true): unknown {
    return runInNewContext(condition.slice(4, -3), {
        github: { ...baseline, ...overrides }, inputs: { check_pat: enabled },
        fromJSON: JSON.parse,
        contains: (values: unknown[], value: unknown) => values.includes(value),
        format: (text: string, ...values: unknown[]) => text.replace(/\{(\d+)\}/gu, (_match, index) => String(values[Number(index)])),
    }, { timeout: 100 });
}

it.each([
    ['maintainer/default', {}, true, true],
    ['bot/default', { actor_id: '260864876', triggering_actor: 'vypbot' }, true, true],
    ['unlisted rerun actor', { triggering_actor: 'unlisted' }, true, false],
    ['unlisted actor', { actor_id: '1' }, true, false],
    ['other ref', { ref: 'refs/heads/develop' }, true, false],
    ['other workflow identity', { workflow_ref: 'vypdev/copilot/.github/workflows/other.yml@refs/heads/master' }, true, false],
    ['fork repository', { repository: 'fork/copilot' }, true, false],
    ['check disabled', {}, false, false],
    ['non-dispatch event', { event_name: 'pull_request' }, true, false],
] as const)('the unchanged proposed workflow selects %s as %s', (_name, overrides, enabled, expected) => {
    expect(selected(workflow.jobs['verify-pat'].if, overrides, enabled)).toBe(expected);
});

it('binds every source health job to the same selection contract and retains self-hosted Linux', () => {
    expect(() => assertSourceHealthPolicy(workflow)).not.toThrow();
    for (const job of Object.values(workflow.jobs)) expect(job['runs-on']).toEqual({ group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] });
    const altered = structuredClone(workflow);
    altered.jobs['verify-pat'].if = '${{ true }}';
    expect(() => assertSourceHealthPolicy(altered)).toThrow('selection contract');
});

it('demonstrates that a workflow editor can remove the mutable selector', () => {
    // This is a limitation counter-control, not independent actor/ref protection.
    expect(selected('${{ true }}', { actor_id: '1', ref: 'refs/heads/attacker' })).toBe(true);
    expect(selected(workflow.jobs['verify-pat'].if, { actor_id: '1', ref: 'refs/heads/attacker' })).toBe(false);
});
