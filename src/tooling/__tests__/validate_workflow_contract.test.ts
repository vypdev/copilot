import path from 'node:path';
import { COPILOT_WORKFLOW_NAMES, WORKFLOW_QUEUE_POLICY } from '../../application/policies/workflow_queue_policy';

interface ContractModule {
  assertQueueWorkflow(file: string, workflow: Record<string, unknown>): void;
  assertRunner(file: string, workflow: Record<string, unknown>): void;
  MIN_QUEUE_JOB_TIMEOUT_MINUTES: number;
  QUEUE_WORKFLOW_MANIFEST: readonly { workflowName: string }[];
}

const {
  assertQueueWorkflow,
  assertRunner,
  MIN_QUEUE_JOB_TIMEOUT_MINUTES,
  QUEUE_WORKFLOW_MANIFEST,
} = require('../../../scripts/validate-workflow-contract.cjs') as ContractModule;

const queueFile = path.join(process.cwd(), '.github', 'workflows', 'copilot_issue.yml');
const validWorkflow = {
  name: 'Copilot - Issue',
  jobs: {
    'copilot-issues': {
      'runs-on': ['self-hosted', 'codex'],
      'timeout-minutes': MIN_QUEUE_JOB_TIMEOUT_MINUTES,
      steps: [{ uses: './', with: {} }],
    },
  },
};

describe('workflow contract validator', () => {
  it('keeps the manifest, workflow names, and queue budget synchronized', () => {
    expect(QUEUE_WORKFLOW_MANIFEST.map(entry => entry.workflowName)).toEqual(expect.arrayContaining(COPILOT_WORKFLOW_NAMES));
    expect(COPILOT_WORKFLOW_NAMES).toEqual(expect.arrayContaining(QUEUE_WORKFLOW_MANIFEST.map(entry => entry.workflowName)));
    expect(WORKFLOW_QUEUE_POLICY.maximumQueueWaitMilliseconds).toBe(90 * 60 * 1000);
  });

  it.each([
    ['wrong workflow name', { ...validWorkflow, name: 'Wrong' }],
    ['missing timeout', { ...validWorkflow, jobs: { 'copilot-issues': { ...validWorkflow.jobs['copilot-issues'], 'timeout-minutes': undefined } } }],
    ['short timeout', { ...validWorkflow, jobs: { 'copilot-issues': { ...validWorkflow.jobs['copilot-issues'], 'timeout-minutes': 119 } } }],
    ['workflow concurrency', { ...validWorkflow, concurrency: { group: 'x' } }],
    ['job concurrency', { ...validWorkflow, jobs: { 'copilot-issues': { ...validWorkflow.jobs['copilot-issues'], concurrency: { group: 'x' } } } }],
    ['missing queue job', { ...validWorkflow, jobs: {} }],
    ['unmanifested action job', { ...validWorkflow, jobs: { ...validWorkflow.jobs, other: { steps: [{ uses: './' }] } } }],
  ])('rejects %s', (_reason, workflow) => {
    expect(() => assertQueueWorkflow(queueFile, workflow)).toThrow();
  });

  it('rejects a queue job with the wrong runner', () => {
    expect(() => assertRunner(queueFile, {
      jobs: { 'copilot-issues': { 'runs-on': 'ubuntu-latest' } },
    })).toThrow('runs-on self-hosted, codex');
  });
});