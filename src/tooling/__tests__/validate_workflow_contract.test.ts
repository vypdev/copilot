import path from 'node:path';
import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { WORKFLOW_QUEUE_POLICY } from '../../application/policies/workflow_queue_policy';

interface ContractModule {
  assertQueueWorkflow(file: string, workflow: Record<string, unknown>): void;
  assertDirectEventTriggers(file: string, workflow: Record<string, unknown>): void;
  assertRunner(file: string, workflow: Record<string, unknown>): void;
  assertImmutableActions(file: string, workflow: Record<string, unknown>): void;
  assertNoJobLevelSecrets(file: string, workflow: Record<string, unknown>): void;
  assertAgentWorkflowPermissions(file: string, workflow: Record<string, unknown>): void;
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
  assertDirectEventTriggers,
  assertRunner,
  assertImmutableActions,
  assertNoJobLevelSecrets,
  assertAgentWorkflowPermissions,
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
  it('keeps the repository validation manifest unique and the queue budget synchronized', () => {
    const workflowNames = QUEUE_WORKFLOW_MANIFEST.map(entry => entry.workflowName);
    expect(new Set(workflowNames).size).toBe(workflowNames.length);
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
    expect(() => assertQueueWorkflow(queueFile, workflow)).toThrow('required bot actor gate');
  });

  it.each(['copilot_pull_request.yml', 'copilot_pull_request_comment.yml'])(
    'requires same-repository PR gating for %s',
    (fileName) => {
      for (const directory of ['.github/workflows', 'setup/workflows']) {
        const file = path.join(process.cwd(), directory, fileName);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
        const job = workflow.jobs['copilot-pull-requests'];
        job.if = "${{ vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN }}";
        expect(() => validateWorkflow(file, workflow)).toThrow('same-repository PR gate');
      }
    },
  );

  it('rejects workflow_run and requires direct PR/review events in both distributed variants', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      const file = path.join(process.cwd(), directory, 'copilot_pull_request.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as Record<string, any>;
      expect(() => assertDirectEventTriggers(file, workflow)).not.toThrow();
      workflow.on.workflow_run = { types: ['completed'] };
      expect(() => assertDirectEventTriggers(file, workflow)).toThrow('must not define workflow_run');
      delete workflow.on.workflow_run;
      delete workflow.on.pull_request_review;
      expect(() => assertDirectEventTriggers(file, workflow)).toThrow('direct pull_request and pull_request_review');
    }
  });

  it.each(['.github/workflows', 'setup/workflows'])('requires the exact push review range fetch in %s', (directory) => {
    const file = path.join(process.cwd(), directory, 'copilot_commit.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    workflow.jobs['copilot-commits'].steps = workflow.jobs['copilot-commits'].steps.filter(
      (step: { name?: string }) => step.name !== 'Fetch push review range',
    );

    expect(() => validateWorkflow(file, workflow)).toThrow('must materialize and verify the exact GitHub before/after review range');
  });

  it.each(['.github/workflows', 'setup/workflows'])('requires a full checkout for push review ranges in %s', (directory) => {
    const file = path.join(process.cwd(), directory, 'copilot_commit.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const step = workflow.jobs['copilot-commits'].steps.find(
      (candidate: { uses?: string }) => candidate.uses?.startsWith('actions/checkout@'),
    );
    step.with['fetch-depth'] = 1;

    expect(() => validateWorkflow(file, workflow)).toThrow('must materialize and verify the exact GitHub before/after review range');
  });

  it.each(['.github/workflows', 'setup/workflows'])('requires a non-fatal before fetch for force-pushed PRs in %s', (directory) => {
    const file = path.join(process.cwd(), directory, 'copilot_pull_request.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const step = workflow.jobs['copilot-pull-requests'].steps.find(
      (candidate: { name?: string }) => candidate.name === 'Fetch incremental review range',
    );
    step.run = 'git cat-file -e "${BEFORE_SHA}^{commit}"';

    expect(() => validateWorkflow(file, workflow)).toThrow('must materialize and verify the exact GitHub before/after review range');
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
            { uses: 'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09', with: { 'persist-credentials': false } },
            { uses: 'vypdev/copilot@a39616557f384bcc633b94e43d9551b2b5205328', with: { 'queue-gate-only': 'true', token: '${{ github.token }}' } },
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

  it('rejects mutable action references and persisted checkout credentials', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'ci_check.yml');
    expect(() => assertImmutableActions(file, {
      jobs: { test: { steps: [{ uses: 'actions/checkout@v5', with: { 'persist-credentials': false } }] } },
    })).toThrow('immutable 40-character commit SHA');
    expect(() => assertImmutableActions(file, {
      jobs: { test: { steps: [{ uses: 'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09' }] } },
    })).toThrow('persist-credentials: false');
  });

  it('rejects local action execution from the pull request workflow', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'copilot_pull_request.yml');
    expect(() => assertImmutableActions(file, {
      jobs: { review: { steps: [{ uses: './' }] } },
    })).toThrow('pull-request-controlled local action code');
  });

  it('requires every specialized role reachable from a workflow', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'copilot_pull_request.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const action = workflow.jobs['copilot-pull-requests'].steps.find((step: { uses?: string }) => step.uses?.includes('copilot@'));
    delete action.with['planner-provider'];

    expect(() => validateWorkflow(file, workflow)).toThrow('missing agent inputs: planner-provider');
  });

  it('rejects Secrets exposed to every step in a job', () => {
    expect(() => assertNoJobLevelSecrets(queueFile, {
      jobs: {
        review: {
          env: { CODEX_API_KEY: '${{ secrets.CODEX_API_KEY }}' },
          steps: [],
        },
      },
    })).toThrow('must scope Secrets to the exact step');
    expect(() => assertNoJobLevelSecrets(queueFile, {
      jobs: {
        review: {
          env: { AGENT_PROVIDER: '${{ vars.AGENT_PROVIDER }}' },
          steps: [{ env: { CODEX_API_KEY: '${{ secrets.CODEX_API_KEY }}' } }],
        },
      },
    })).not.toThrow();
  });

  it('requires a read-only implicit GITHUB_TOKEN for every agent workflow', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const fileName of [
        'copilot_commit.yml',
        'copilot_issue.yml',
        'copilot_issue_comment.yml',
        'copilot_pull_request.yml',
        'copilot_pull_request_comment.yml',
      ]) {
        const file = path.join(process.cwd(), directory, fileName);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
        expect(() => assertAgentWorkflowPermissions(file, workflow)).not.toThrow();
        const job = Object.values(workflow.jobs)[0];
        job.permissions = { contents: 'write' };
        expect(() => assertAgentWorkflowPermissions(file, workflow)).toThrow('only contents: read');
      }
    }
  });
});
