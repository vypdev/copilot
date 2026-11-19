'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { test } = require('node:test');
const { load: parse } = require('js-yaml');
const { installationState } = require('./installation-state.cjs');
const plan = require('./manifest.json');
const baseline = require('./observed-default.json');
const workflow = readFileSync(path.join(__dirname, 'proposed-workflow.yml'), 'utf8');

for (const [name, observed, expected] of [
    ['authenticated absent', baseline, 'absent'],
    ['exact installed bytes', { ...baseline, workflow }, 'exact-installed-bytes'],
    ['foreign workflow', { ...baseline, workflow: workflow.replace(plan.source.commit, 'f'.repeat(40)) }, 'incompatible'],
    ['foreign repository', { ...baseline, repositoryId: 1 }, 'incompatible'],
    ['moved default head', { ...baseline, head: 'a'.repeat(40) }, 'stale-source'],
    ['renamed default', { ...baseline, defaultBranch: 'other' }, 'stale-source'],
    ['inaccessible parent', { ...baseline, workflowParentReadable: false }, 'unknown'],
    ['contradictory listing', { ...baseline, workflowNames: ['copilot_bugbot_status_card.yml'] }, 'unknown'],
]) test('installation classification distinguishes ' + name, () => {
    assert.equal(installationState(plan, observed), expected);
    assert.equal(plan.installationAuthorized, false);
    assert.equal(plan.installedDestinationSha, null);
    assert.equal(plan.nativeCanary.status, 'not-run');
});

test('the minimal proposed workflow pins reviewed code and preserves serialization, admission and narrow credentials', () => {
    assert.equal(createHash('sha256').update(workflow).digest('hex'), plan.proposedWorkflowSha256);
    const yaml = parse(workflow), job = yaml.jobs.publish;
    assert.deepEqual(Object.keys(yaml.on), ['workflow_dispatch']);
    assert.deepEqual(Object.keys(yaml.on.workflow_dispatch.inputs).sort(), ['operation', 'pull_number', 'work']);
    assert.equal(job.if, "${{ github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}");
    assert.deepEqual(job['runs-on'], ['self-hosted', 'codex', 'Linux']);
    assert.equal(job.concurrency.group, 'copilot-bugbot-status-${{ github.repository_id }}-${{ inputs.pull_number }}');
    assert.equal(job.concurrency.queue, 'max');
    assert.equal(job.concurrency['cancel-in-progress'], false);
    assert.deepEqual(job.permissions, { actions: 'read', checks: 'read', contents: 'read', issues: 'read', 'pull-requests': 'read' });
    const step = job.steps.find(step => step.name === 'Publish canonical comment');
    assert.equal(step.uses, 'vypdev/copilot@' + plan.source.commit);
    assert.equal(step.with.token, '${{ secrets.PAT }}');
    assert.equal(step.env.COPILOT_EVIDENCE_TOKEN, '${{ github.token }}');
    assert.equal(step.env.COPILOT_BUGBOT_STATUS_CARD_WORKFLOW, 'write-v1');
    assert.equal(plan.productionVerification, 'disabled');
    assert.equal(plan.consumerTemplatesChanged, false);
});
