import path from 'node:path';
import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { COPILOT_WORKFLOW_NAMES, WORKFLOW_QUEUE_POLICY } from '../../application/policies/workflow_queue_policy';

interface ContractModule {
  assertQueueWorkflow(file: string, workflow: Record<string, unknown>): void;
  assertRunner(file: string, workflow: Record<string, unknown>): void;
  MIN_QUEUE_JOB_TIMEOUT_MINUTES: number;
  QUEUE_GATE_TIMEOUT_MINUTES: number;
  PREPARE_VERSION_TIMEOUT_MINUTES: number;
  PREPARE_COMPILED_TIMEOUT_MINUTES: number;
  TAG_TIMEOUT_MINUTES: number;
  QUEUE_WAIT_MINUTES: number;
  QUEUE_WORKFLOW_MANIFEST: readonly { file: string; workflowName: string; jobId: string }[];
  assertQueueBudget(queueWaitMinutes: number, minimumJobTimeoutMinutes: number): void;
  validateWorkflow(file: string, workflow: Record<string, unknown>): void;
}

const {
  assertQueueWorkflow,
  assertRunner,
  MIN_QUEUE_JOB_TIMEOUT_MINUTES,
  QUEUE_GATE_TIMEOUT_MINUTES,
  PREPARE_VERSION_TIMEOUT_MINUTES,
  PREPARE_COMPILED_TIMEOUT_MINUTES,
  TAG_TIMEOUT_MINUTES,
  QUEUE_WAIT_MINUTES,
  QUEUE_WORKFLOW_MANIFEST,
  assertQueueBudget,
  validateWorkflow,
} = require('../../../scripts/validate-workflow-contract.cjs') as ContractModule;

const queueFile = path.join(process.cwd(), '.github', 'workflows', 'copilot_issue.yml');
const mutationDirectories = ['.github/workflows', 'setup/workflows'] as const;
const mutationWorkflowNames = ['release_workflow.yml', 'hotfix_workflow.yml'] as const;
type MutationWorkflow = { jobs: Record<string, Record<string, any>>; [key: string]: any };

function loadMutationWorkflow(directory: string, fileName: string): { file: string; workflow: MutationWorkflow } {
  const file = path.join(process.cwd(), directory, fileName);
  return {
    file,
    workflow: JSON.parse(JSON.stringify(yaml.load(readFileSync(file, 'utf8')))),
  };
}

function expectMutationRejected(
  directory: string,
  fileName: string,
  mutate: (workflow: MutationWorkflow) => void,
  expectedMessage: string,
): void {
  const { file, workflow } = loadMutationWorkflow(directory, fileName);
  mutate(workflow);
  expect(() => validateWorkflow(file, workflow)).toThrow(expectedMessage);
}

const validWorkflow = {
  name: 'Copilot - Issue',
  jobs: {
    'copilot-issues': {
      if: "${{ vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN }}",
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
    expect(MIN_QUEUE_JOB_TIMEOUT_MINUTES).toBeGreaterThanOrEqual(QUEUE_WAIT_MINUTES);
  });

  it('enforces the minimum job timeout to be at least the queue wait budget', () => {
    expect(() => assertQueueBudget(90, 89)).toThrow('must be >= queue wait');
    expect(() => assertQueueBudget(90, 90)).not.toThrow();
  });

  it('keeps every queue workflow sequential across repeated runs without cancellation or overwrite', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const manifest of QUEUE_WORKFLOW_MANIFEST) {
        const file = path.join(process.cwd(), directory, manifest.file);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as Record<string, unknown> & {
          jobs: Record<string, { concurrency?: unknown }>;
        };
        expect(workflow.concurrency).toBeUndefined();
        expect(workflow.jobs[manifest.jobId].concurrency).toBeUndefined();
        expect(() => validateWorkflow(file, workflow)).not.toThrow();
      }
    }
  });

  it('rejects an event workflow that removes the generic bot actor gate', () => {
    const workflow = JSON.parse(JSON.stringify(validWorkflow));
    delete workflow.jobs['copilot-issues'].if;
    expect(() => assertQueueWorkflow(queueFile, workflow)).toThrow('COPILOT_BOT_LOGIN actor gate');
  });

  it('validates the exact gate-first DAG for active and setup release/hotfix workflows', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const fileName of ['release_workflow.yml', 'hotfix_workflow.yml']) {
        const file = path.join(process.cwd(), directory, fileName);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as Record<string, unknown>;
        expect(() => validateWorkflow(file, workflow)).not.toThrow();
      }
    }
  });

  it.each(mutationDirectories.flatMap((directory) => mutationWorkflowNames.map((fileName) => [directory, fileName] as const)))('enforces the exact queue, preparation, and tag budgets for %s/%s', (directory, fileName) => {
    expectMutationRejected(directory, fileName, (workflow) => {
      workflow.jobs['queue-gate']['timeout-minutes'] = QUEUE_GATE_TIMEOUT_MINUTES - 1;
    }, 'queue-gate must have timeout-minutes 120');
    expectMutationRejected(directory, fileName, (workflow) => {
      workflow.jobs['prepare-version-files']['timeout-minutes'] = PREPARE_VERSION_TIMEOUT_MINUTES - 1;
    }, 'job prepare-version-files must have timeout-minutes 15');
    expectMutationRejected(directory, fileName, (workflow) => {
      workflow.jobs.tag['timeout-minutes'] = TAG_TIMEOUT_MINUTES - 1;
    }, 'job tag must have timeout-minutes 120');
  });

  it.each(mutationWorkflowNames)('enforces the active compiled-files budget for %s', (fileName) => {
    expectMutationRejected('.github/workflows', fileName, (workflow) => {
      workflow.jobs['prepare-compiled-files']['timeout-minutes'] = PREPARE_COMPILED_TIMEOUT_MINUTES - 1;
    }, 'job prepare-compiled-files must have timeout-minutes 20');
  });

  it('requires explicit least-privilege read permissions for active tag jobs', () => {
    for (const fileName of mutationWorkflowNames) {
      expectMutationRejected('.github/workflows', fileName, (workflow) => {
        delete workflow.jobs.tag.permissions;
      }, 'tag must have only contents: read permissions');
      expectMutationRejected('.github/workflows', fileName, (workflow) => {
        workflow.jobs.tag.permissions = { contents: 'write' };
      }, 'tag must have only contents: read permissions');
    }
  });

  it.each([
    ['direct pre-gate mutation', (workflow: MutationWorkflow) => {
      workflow.jobs['prepare-version-files'].needs = [];
    }, 'job prepare-version-files must need exactly queue-gate'],
    ['broken transitive edge', (workflow: MutationWorkflow) => {
      workflow.jobs.tag.needs = ['queue-gate'];
    }, 'job tag must need exactly prepare-compiled-files'],
    ['always bypass', (workflow: MutationWorkflow) => {
      workflow.jobs['prepare-version-files'].if = '${{ always() }}';
    }, 'bypass-capable if condition'],
    ['failure bypass', (workflow: MutationWorkflow) => {
      workflow.jobs['prepare-version-files'].if = '${{ failure() }}';
    }, 'bypass-capable if condition'],
    ['cancelled bypass', (workflow: MutationWorkflow) => {
      workflow.jobs['prepare-version-files'].if = '${{ cancelled() }}';
    }, 'bypass-capable if condition'],
    ['queue-gate continue-on-error', (workflow: MutationWorkflow) => {
      workflow.jobs['queue-gate']['continue-on-error'] = false;
    }, 'queue-gate must not define bypass'],
    ['gate-step continue-on-error', (workflow: MutationWorkflow) => {
      workflow.jobs['queue-gate'].steps[1]['continue-on-error'] = true;
    }, 'queue-gate action must not define continue-on-error'],
    ['gate write permission', (workflow: MutationWorkflow) => {
      workflow.jobs['queue-gate'].permissions.actions = 'write';
    }, 'queue-gate must have only actions: read'],
    ['missing actions read', (workflow: MutationWorkflow) => {
      delete workflow.jobs['queue-gate'].permissions.actions;
    }, 'queue-gate must have only actions: read'],
    ['PAT token', (workflow: MutationWorkflow) => {
      workflow.jobs['queue-gate'].steps[1].with.token = '${{ secrets.PAT }}';
    }, 'queue-gate must pass only queue-gate-only and github.token'],
    ['credential persistence', (workflow: MutationWorkflow) => {
      workflow.jobs['queue-gate'].steps[0].with['persist-credentials'] = true;
    }, 'queue-gate checkout must set persist-credentials: false'],
    ['pre-gate run', (workflow: MutationWorkflow) => {
      workflow.jobs['queue-gate'].steps[0].run = 'printf unsafe';
    }, 'queue-gate may contain only a safe checkout'],
    ['missing gate-only', (workflow: MutationWorkflow) => {
      delete workflow.jobs['queue-gate'].steps[1].with['queue-gate-only'];
    }, 'queue-gate must invoke'],
    ['false gate-only', (workflow: MutationWorkflow) => {
      workflow.jobs['queue-gate'].steps[1].with['queue-gate-only'] = 'false';
    }, 'queue-gate must invoke'],
    ['workflow concurrency', (workflow: MutationWorkflow) => {
      workflow.concurrency = { group: 'unsafe' };
    }, 'must not define GitHub concurrency'],
    ['job concurrency', (workflow: MutationWorkflow) => {
      workflow.jobs.tag.concurrency = { group: 'unsafe' };
    }, 'job tag must not define GitHub concurrency'],
  ])('rejects isolated %s mutation in a real release fixture', (_reason, mutate, message) => {
    expectMutationRejected('.github/workflows', 'release_workflow.yml', mutate, message);
  });

  it('rejects a release workflow when a mutation job bypasses the queue gate', () => {
    const workflow = {
      name: 'Task - Release',
      jobs: {
        'queue-gate': {
          'runs-on': 'ubuntu-latest',
          'timeout-minutes': 120,
          permissions: { actions: 'read', contents: 'read' },
          steps: [
            { uses: 'actions/checkout@v5', with: { 'persist-credentials': false } },
            { uses: 'vypdev/copilot@v3', with: { 'queue-gate-only': 'true', token: '${{ github.token }}' } },
          ],
        },
        'prepare-version-files': {
          'runs-on': 'ubuntu-latest',
          'timeout-minutes': 15,
          permissions: { contents: 'write' },
          needs: 'unrelated',
          steps: [],
        },
        unrelated: { 'runs-on': 'ubuntu-latest', steps: [] },
        'prepare-compiled-files': { 'runs-on': 'ubuntu-latest', needs: 'prepare-version-files', steps: [] },
        tag: { 'runs-on': 'ubuntu-latest', needs: 'prepare-compiled-files', steps: [] },
      },
    };

    expect(() => validateWorkflow(path.join(process.cwd(), 'setup/workflows/release_workflow.yml'), workflow)).toThrow();
  });

  it.each([
    ['gate write permission', (gate: Record<string, unknown>) => { gate.permissions = { actions: 'write', contents: 'read' }; }],
    ['gate provider environment', (gate: Record<string, unknown>) => { gate.env = { OPENAI_API_KEY: '${{ secrets.OPENAI_API_KEY }}' }; }],
    ['gate false mode', (gate: Record<string, unknown>) => {
      const steps = gate.steps as Record<string, unknown>[];
      (steps[1].with as Record<string, unknown>)['queue-gate-only'] = 'false';
    }],
    ['gate unsafe condition', (gate: Record<string, unknown>) => { gate.if = '${{ always() }}'; }],
    ['persistent gate checkout', (gate: Record<string, unknown>) => {
      const steps = gate.steps as Record<string, unknown>[];
      (steps[0].with as Record<string, unknown>)['persist-credentials'] = true;
    }],
  ])('rejects %s in a release gate', (_reason, mutate) => {
    const file = path.join(process.cwd(), 'setup/workflows/release_workflow.yml');
    const workflow = JSON.parse(JSON.stringify(yaml.load(readFileSync(file, 'utf8')))) as {
      jobs: Record<string, Record<string, unknown>>;
    };
    mutate(workflow.jobs['queue-gate']);
    expect(() => validateWorkflow(file, workflow)).toThrow();
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
