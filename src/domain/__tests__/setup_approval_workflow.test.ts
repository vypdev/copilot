import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
import { renderApprovalObserverWorkflow } from '../setup_approval_workflow';
import type { PullRequestApprovalPolicy } from '../pull_request_approval_policy';

const template = readFileSync(join(__dirname, '..', '..', '..', 'setup', 'workflows', 'copilot_pull_request_approval.yml'), 'utf8');
const sourceWorkflow = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'copilot_pull_request_approval.yml'), 'utf8');
const sourceTemplate = readFileSync(join(__dirname, '..', '..', '..', 'setup', 'source-workflows', 'copilot_pull_request_approval.yml'), 'utf8');
const policy: PullRequestApprovalPolicy = {
  version: 1, mode: 'guarded', targetRoles: ['development'], branchKinds: ['feature'],
  requireLinkedIssue: true, additionalExcludedPaths: [],
  producerAttested: true,
  testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
  coverage: { mode: 'check', checkName: 'CI Check' }, allowHumanDismissed: false, skipWhenHumanApproved: true,
};

describe('setup approval observer workflow', () => {
  it('renders exact producer names into a parseable trusted workflow', () => {
    const rendered = yaml.load(renderApprovalObserverWorkflow(template, policy)) as Record<string, any>;
    expect(rendered.on.workflow_run.workflows).toEqual(['Copilot - Pull Request', 'CI Check']);
    expect(rendered.on.workflow_run.types).toEqual(['completed']);
    expect(rendered.jobs['observe-approval'].steps).toHaveLength(1);
    expect(rendered.jobs['observe-approval'].steps[0].uses).toBe('vypdev/copilot@v3');
    expect(rendered.jobs['observe-approval'].concurrency.group).toBe('copilot-approval-${{ github.repository }}');
    expect(JSON.stringify(rendered.jobs['observe-approval'])).not.toContain('actions/checkout');
  });
  it('deduplicates workflow names and rejects expression or newline injection', () => {
    expect((yaml.load(renderApprovalObserverWorkflow(template, { ...policy,
      testChecks: [...policy.testChecks, { name: 'Other', sourceAppId: 15368, workflowName: 'CI Check' }],
    })) as Record<string, any>).on.workflow_run.workflows).toHaveLength(2);
    expect(() => renderApprovalObserverWorkflow(template, { ...policy,
      testChecks: [{ ...policy.testChecks[0], workflowName: '${{ secrets.PAT }}' }],
    })).toThrow('safe');
    expect(() => renderApprovalObserverWorkflow(template, { ...policy,
      testChecks: [{ ...policy.testChecks[0], workflowName: 'CI\n  run: echo unsafe' }],
    })).toThrow('safe');
  });
  it('rejects a template with no filter placeholder', () => {
    expect(() => renderApprovalObserverWorkflow('on: workflow_run', policy)).toThrow('missing');
  });
  it('tests unreleased code only from the trusted default-branch commit in this source repository', () => {
    expect(sourceWorkflow).toBe(sourceTemplate);
    const workflow = yaml.load(sourceWorkflow) as Record<string, any>;
    expect(workflow.on.workflow_run.workflows).toEqual(['Copilot - Pull Request', 'CI Check']);
    expect(workflow.jobs['observe-approval'].concurrency.group).toBe('copilot-approval-${{ github.repository }}');
    const steps = workflow.jobs['observe-approval'].steps;
    expect(steps[0]).toMatchObject({ uses: 'actions/checkout@v5',
      with: { ref: '${{ github.sha }}', 'persist-credentials': false } });
    expect(steps[1]).toMatchObject({ uses: './', with: { 'pr-approval-observer': 'true' } });
    expect(JSON.stringify(workflow.jobs['observe-approval'])).not.toContain('github.event.workflow_run.head_sha');
  });
});
