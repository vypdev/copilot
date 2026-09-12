import path from 'node:path';
import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { WORKFLOW_QUEUE_POLICY } from '../../application/policies/workflow_queue_policy';

interface ContractModule {
  assertQueueWorkflow(file: string, workflow: Record<string, unknown>): void;
  assertDirectEventTriggers(file: string, workflow: Record<string, unknown>): void;
  assertRunner(file: string, workflow: Record<string, unknown>): void;
  assertMajorActionReferences(file: string, workflow: Record<string, unknown>): void;
  assertCopilotActionInputs(file: string, workflow: Record<string, unknown>): void;
  assertNoJobLevelSecrets(file: string, workflow: Record<string, unknown>): void;
  assertAgentWorkflowPermissions(file: string, workflow: Record<string, unknown>): void;
  assertLightweightBranchSyncWorkflow(file: string, workflow: Record<string, unknown>): void;
  MIN_QUEUE_JOB_TIMEOUT_MINUTES: number;
  DEPLOYMENT_VALIDATION_TIMEOUT_MINUTES: number;
  PREPARE_VERSION_TIMEOUT_MINUTES: number;
  PREPARE_COMPILED_TIMEOUT_MINUTES: number;
  TAG_TIMEOUT_MINUTES: number;
  NPM_PUBLISH_TIMEOUT_MINUTES: number;
  FINALIZE_RELEASE_TIMEOUT_MINUTES: number;
  QUEUE_WAIT_MINUTES: number;
  QUEUE_WORKFLOW_MANIFEST: readonly { file: string; workflowName: string; jobId: string }[];
  assertQueueBudget(queueWaitMinutes: number, minimumJobTimeoutMinutes: number): void;
  validateWorkflow(file: string, workflow: Record<string, unknown>): void;
}

const {
  assertQueueWorkflow,
  assertDirectEventTriggers,
  assertRunner,
  assertMajorActionReferences,
  assertCopilotActionInputs,
  assertNoJobLevelSecrets,
  assertAgentWorkflowPermissions,
  assertLightweightBranchSyncWorkflow,
  MIN_QUEUE_JOB_TIMEOUT_MINUTES,
  DEPLOYMENT_VALIDATION_TIMEOUT_MINUTES,
  PREPARE_VERSION_TIMEOUT_MINUTES,
  PREPARE_COMPILED_TIMEOUT_MINUTES,
  TAG_TIMEOUT_MINUTES,
  NPM_PUBLISH_TIMEOUT_MINUTES,
  FINALIZE_RELEASE_TIMEOUT_MINUTES,
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

  it('serializes durable mutations while canceling superseded branch review runs', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const manifest of QUEUE_WORKFLOW_MANIFEST) {
        const file = path.join(process.cwd(), directory, manifest.file);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as Record<string, unknown> & {
          jobs: Record<string, { concurrency?: unknown }>;
        };
        expect(workflow.concurrency).toBeUndefined();
        if (['copilot_commit.yml', 'copilot_pull_request.yml'].includes(manifest.file)) {
          expect(workflow.jobs[manifest.jobId].concurrency).toEqual({
            group: 'copilot-bugbot-${{ github.repository }}-${{ github.event.pull_request.head.ref || github.ref_name }}',
            'cancel-in-progress': true,
          });
        } else {
          expect(workflow.jobs[manifest.jobId].concurrency).toBeUndefined();
        }
        expect(() => validateWorkflow(file, workflow)).not.toThrow();
      }
    }
  });

  it('rejects an event workflow that removes the generic bot actor gate', () => {
    const workflow = JSON.parse(JSON.stringify(validWorkflow));
    delete workflow.jobs['copilot-issues'].if;
    expect(() => assertQueueWorkflow(queueFile, workflow)).toThrow('required bot actor gate');
  });

  it.each(['.github/workflows', 'setup/workflows'])(
    'keeps the %s branch-sync observer all-branch, bot-push-safe, and agent-free',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_branch_sync.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      expect(() => assertLightweightBranchSyncWorkflow(file, workflow)).not.toThrow();

      workflow.jobs['branch-sync'].steps.at(-1).with['fixer-model'] = 'model';
      expect(() => assertLightweightBranchSyncWorkflow(file, workflow)).toThrow('lightweight branch-sync');
    },
  );

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

  it('validates the exact mutex and validation-first DAG for active and setup release/hotfix workflows', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const fileName of ['release_workflow.yml', 'hotfix_workflow.yml']) {
        const file = path.join(process.cwd(), directory, fileName);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as Record<string, unknown>;
        expect(() => validateWorkflow(file, workflow)).not.toThrow();
      }
    }
  });

  it.each(['.github/workflows', 'setup/workflows'])(
    'validates the dedicated managed-PR continuation in %s',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_deployment_orchestration.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      expect(() => validateWorkflow(file, workflow)).not.toThrow();
      expect(workflow.jobs['resolve-operation'].if).toContain('github.event.pull_request.head.repo.full_name == github.repository');
      expect(workflow.jobs.mutate.concurrency).toEqual({
        group: 'copilot-deployment-${{ github.repository_id }}-${{ needs.resolve-operation.outputs.issue }}',
        'cancel-in-progress': false,
        queue: 'max',
      });
      const continuation = workflow.jobs.mutate.steps.find(
        (step: { with?: Record<string, unknown> }) => step.with?.['single-action'] === 'continue_deployment_action',
      );
      expect(continuation?.with?.['merge-queue-check-attestations'])
        .toBe("${{ vars.MERGE_QUEUE_CHECK_ATTESTATIONS || '[]' }}");
    },
  );

  it.each(['.github/workflows', 'setup/workflows'])(
    'rejects continuation without live merge-queue attestations in %s',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_deployment_orchestration.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      const continuation = workflow.jobs.mutate.steps.find(
        (step: { with?: Record<string, unknown> }) => step.with?.['single-action'] === 'continue_deployment_action',
      );
      delete continuation.with['merge-queue-check-attestations'];
      expect(() => validateWorkflow(file, workflow)).toThrow('live merge-queue attestations');
    },
  );

  it.each([
    '.github/workflows/ci_check.yml',
    '.github/workflows/repowise.yml',
    '.github/workflows/copilot_pull_request.yml',
    'setup/workflows/copilot_pull_request.yml',
  ])('requires merge-group checks in %s', (relativeFile) => {
    const file = path.join(process.cwd(), relativeFile);
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    delete workflow.on.merge_group;
    expect(() => validateWorkflow(file, workflow)).toThrow('must support merge_group checks_requested');
  });

  it.each(mutationDirectories.flatMap((directory) => mutationWorkflowNames.map((fileName) => [directory, fileName] as const)))(
    'persists Git credentials only in the release/hotfix jobs that push in %s/%s',
    (directory, fileName) => {
      const { workflow } = loadMutationWorkflow(directory, fileName);
      const preparationJobIds = directory === '.github/workflows'
        ? ['prepare-version-files', 'prepare-compiled-files']
        : ['prepare-version-files'];

      for (const [jobId, job] of Object.entries(workflow.jobs)) {
        const checkoutSteps = job.steps.filter((step: { uses?: string }) => step.uses?.startsWith('actions/checkout@'));
        for (const checkout of checkoutSteps) {
          expect(checkout.with['persist-credentials']).toBe(preparationJobIds.includes(jobId));
        }
      }

      const commitSteps = preparationJobIds.flatMap(jobId => workflow.jobs[jobId].steps)
        .filter((step: { uses?: string }) => step.uses?.startsWith('EndBug/add-and-commit@'));
      expect(commitSteps).toHaveLength(preparationJobIds.length);
      for (const step of commitSteps) {
        expect(step.with.committer_name).toBe('GitHub Actions');
        expect(step.with.committer_email).toBe('actions@github.com');
        expect(step.with.default_author).toBe('user_info');
      }
    },
  );

  it.each(mutationWorkflowNames)('rejects missing credentials in a push job for %s', (fileName) => {
    expectMutationRejected('.github/workflows', fileName, (workflow) => {
      const checkout = workflow.jobs['prepare-version-files'].steps.find(
        (step: { uses?: string }) => step.uses?.startsWith('actions/checkout@'),
      );
      checkout.with['persist-credentials'] = false;
    }, 'persist-credentials: true');
  });

  it.each(mutationWorkflowNames)('rejects persisted credentials outside push jobs for %s', (fileName) => {
    expectMutationRejected('.github/workflows', fileName, (workflow) => {
      const checkout = workflow.jobs.tag.steps.find(
        (step: { uses?: string }) => step.uses?.startsWith('actions/checkout@'),
      );
      checkout.with['persist-credentials'] = true;
    }, 'persist-credentials: false');
  });

  it.each(mutationWorkflowNames)('persists active %s publication failures and reports preparation failures', (fileName) => {
    const { workflow } = loadMutationWorkflow('.github/workflows', fileName);
    const report = workflow.jobs['report-failure'];
    const durable = report.steps[1];
    const action = report.steps[2];
    const expectedToken = '${{ secrets.PAT }}';

    expect(report.if).toBe("${{ failure() && needs.validate.result == 'success' }}");
    expect(report.permissions).toEqual({ contents: 'read', issues: 'write' });
    expect(report.steps[0]).toEqual(expect.objectContaining({
      uses: 'actions/checkout@v5',
      with: { 'persist-credentials': false },
    }));
    expect(durable.with).toEqual(expect.objectContaining({
      'single-action': 'failed_deployment_action',
      'single-action-operation-id': '${{ inputs.operation-id }}',
      'single-action-version': '${{ inputs.version }}',
      token: expectedToken,
    }));
    expect(durable.if).toBe("${{ inputs.mode == 'publish' }}");
    expect(action.uses).toBe('./');
    expect(action.if).toBe("${{ inputs.mode == 'prepare' }}");
    expect(action.with).toEqual(expect.objectContaining({
      'single-action': 'publish_issue_comment',
      'single-action-issue': '${{ inputs.issue }}',
      token: expectedToken,
    }));
    expect(action.with['single-action-message']).toContain('${{ github.run_id }}');
  });

  it.each(mutationWorkflowNames)('persists setup/%s publication failures and reports preparation failures', (fileName) => {
    const { workflow } = loadMutationWorkflow('setup/workflows', fileName);
    const report = workflow.jobs['report-failure'];
    const durable = report.steps[0];
    const action = report.steps[1];

    expect(report.permissions).toEqual({ issues: 'write' });
    expect(durable.with).toEqual(expect.objectContaining({
      'single-action': 'failed_deployment_action',
      'single-action-operation-id': '${{ inputs.operation-id }}',
      'single-action-version': '${{ inputs.version }}',
      token: '${{ secrets.PAT }}',
    }));
    expect(durable.if).toBe("${{ inputs.mode == 'publish' }}");
    expect(action.uses).toBe('vypdev/copilot@v3');
    expect(action.if).toBe("${{ inputs.mode == 'prepare' }}");
    expect(action.with).toEqual(expect.objectContaining({
      'single-action': 'publish_issue_comment',
      'single-action-issue': '${{ inputs.issue }}',
      token: '${{ secrets.PAT }}',
    }));
    expect(action.with['single-action-message']).toContain('${{ github.run_id }}');
  });

  it('rejects a local Copilot reference from a distributed setup workflow', () => {
    const { file, workflow } = loadMutationWorkflow('setup/workflows', 'release_workflow.yml');
    const action = workflow.jobs.promote.steps.find((step: { with?: Record<string, unknown> }) =>
      step.with?.['single-action'] === 'prepare_deployment_action');
    action.uses = './';

    expect(() => assertMajorActionReferences(file, workflow)).toThrow('must invoke Copilot with vypdev/copilot@v3');
  });

  it('rejects a distributed Copilot reference from an internal workflow', () => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'release_workflow.yml');
    const action = workflow.jobs.promote.steps.find((step: { with?: Record<string, unknown> }) =>
      step.with?.['single-action'] === 'prepare_deployment_action');
    action.uses = 'vypdev/copilot@v3';

    expect(() => assertMajorActionReferences(file, workflow)).toThrow('must invoke Copilot with ./');
  });

  it.each(mutationWorkflowNames)('rejects a missing failure reporter in %s', (fileName) => {
    expectMutationRejected('.github/workflows', fileName, (workflow) => {
      delete workflow.jobs['report-failure'];
    }, 'must define the exact validation-first job graph');
  });

  it.each(mutationWorkflowNames)('rejects a failure reporter that can run without a failed deployment in %s', (fileName) => {
    expectMutationRejected('.github/workflows', fileName, (workflow) => {
      workflow.jobs['report-failure'].if = '${{ always() }}';
    }, 'must run only for a failed deployment');
  });

  it.each(mutationDirectories.flatMap((directory) => mutationWorkflowNames.map((fileName) => [directory, fileName] as const)))('enforces the exact validation and preparation budgets for %s/%s', (directory, fileName) => {
    expectMutationRejected(directory, fileName, (workflow) => {
      workflow.jobs.validate['timeout-minutes'] = DEPLOYMENT_VALIDATION_TIMEOUT_MINUTES - 1;
    }, 'validate must have timeout-minutes 5');
    expectMutationRejected(directory, fileName, (workflow) => {
      workflow.jobs['prepare-version-files']['timeout-minutes'] = (directory === '.github/workflows' ? PREPARE_VERSION_TIMEOUT_MINUTES : 30) - 1;
    }, `job prepare-version-files must have timeout-minutes ${directory === '.github/workflows' ? 15 : 30}`);
    if (directory === '.github/workflows') {
      expectMutationRejected(directory, fileName, (workflow) => {
        workflow.jobs.tag['timeout-minutes'] = TAG_TIMEOUT_MINUTES - 1;
      }, 'job tag must have timeout-minutes 10');
    }
  });

  it.each(mutationWorkflowNames)('enforces the active compiled-files budget for %s', (fileName) => {
    expectMutationRejected('.github/workflows', fileName, (workflow) => {
      workflow.jobs['prepare-compiled-files']['timeout-minutes'] = PREPARE_COMPILED_TIMEOUT_MINUTES - 1;
    }, 'job prepare-compiled-files must have timeout-minutes 30');
  });

  it('keeps npm publication between tag creation and release finalization', () => {
    const { workflow } = loadMutationWorkflow('.github/workflows', 'release_workflow.yml');

    expect(workflow.jobs['publish-npm']).toEqual(expect.objectContaining({
      needs: 'tag',
      environment: 'npm',
      'runs-on': 'ubuntu-latest',
      'timeout-minutes': NPM_PUBLISH_TIMEOUT_MINUTES,
      permissions: { contents: 'read', 'id-token': 'write' },
    }));
    expect(workflow.jobs['finalize-release']).toEqual(expect.objectContaining({
      needs: 'publish-npm',
      'timeout-minutes': FINALIZE_RELEASE_TIMEOUT_MINUTES,
      permissions: { contents: 'write', issues: 'write', 'pull-requests': 'write' },
    }));
    expect(workflow.jobs['publish-npm'].if).toBe("${{ inputs.mode == 'publish' }}");
    expect(workflow.jobs['publish-npm'].steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ run: 'pnpm install --frozen-lockfile' }),
      expect.objectContaining({ run: 'npm publish --access public' }),
      expect.objectContaining({
        name: 'Verify published package identity',
        run: expect.stringContaining('"$registry_git_head" = "$local_git_head"'),
      }),
      expect.objectContaining({
        name: 'Wait for npm registry visibility',
        env: expect.objectContaining({
          PACKAGE_NAME: '@vypdev/copilot',
          RELEASE_VERSION: '${{ inputs.version }}',
          POLL_INTERVAL: "${{ vars.NPM_VISIBILITY_POLL_INTERVAL_SECONDS || '20' }}",
        }),
        run: expect.stringContaining('sleep "$POLL_INTERVAL"'),
      }),
    ]));
    expect(JSON.stringify(workflow.jobs['publish-npm'])).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
  });

  it.each([
    ['missing OIDC permission', (job: Record<string, any>) => { delete job.permissions['id-token']; }, 'id-token: write'],
    ['wrong environment', (job: Record<string, any>) => { job.environment = 'production'; }, 'npm environment'],
    ['wrong phase gate', (job: Record<string, any>) => { job.if = "${{ vars.NPM_PUBLISH_ENABLED == 'true' }}"; }, 'only in publish mode'],
    ['self-hosted npm runner', (job: Record<string, any>) => { job['runs-on'] = ['self-hosted', 'codex']; }, 'runs-on ubuntu-latest'],
    ['long-lived npm token', (job: Record<string, any>) => {
      const publish = job.steps.find((step: Record<string, any>) => step.run === 'npm publish --access public');
      publish.env = { NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}' };
    }, 'authenticate only through OIDC'],
  ])('rejects %s in the coordinated npm release job', (_reason, mutate, message) => {
    expectMutationRejected('.github/workflows', 'release_workflow.yml', (workflow) => {
      mutate(workflow.jobs['publish-npm']);
    }, message);
  });

  it('keeps active tag jobs scoped to tag and issue writes', () => {
    for (const fileName of mutationWorkflowNames) {
      const { workflow } = loadMutationWorkflow('.github/workflows', fileName);
      expect(workflow.jobs.tag.permissions).toEqual({ contents: 'write', issues: 'write' });
    }
  });

  it.each([
    ['direct pre-validation mutation', (workflow: MutationWorkflow) => {
      workflow.jobs['prepare-version-files'].needs = [];
    }, 'job prepare-version-files must need exactly validate'],
    ['broken transitive edge', (workflow: MutationWorkflow) => {
      workflow.jobs.promote.needs = ['validate'];
    }, 'job promote must need exactly prepare-compiled-files'],
    ['always bypass', (workflow: MutationWorkflow) => {
      workflow.jobs['prepare-version-files'].if = '${{ always() }}';
    }, 'must run only in prepare mode'],
    ['validation write permission', (workflow: MutationWorkflow) => {
      workflow.jobs.validate.permissions = { contents: 'write' };
    }, 'validate must have no repository permissions'],
    ['validation secret', (workflow: MutationWorkflow) => {
      workflow.jobs.validate.env = { PAT: '${{ secrets.PAT }}' };
    }, 'must scope Secrets to the exact step'],
    ['validation bypass', (workflow: MutationWorkflow) => {
      workflow.jobs.validate['continue-on-error'] = true;
    }, 'validate must not receive job credentials'],
    ['validation token', (workflow: MutationWorkflow) => {
      workflow.jobs.validate.steps[0].with['github-token'] = '${{ github.token }}';
    }, 'bounded cross-field inputs without credentials'],
    ['missing operation cross-field validation', (workflow: MutationWorkflow) => {
      workflow.jobs.validate.steps[0].with.script = 'const issue = 1; Number.isSafeInteger(issue);';
    }, 'bounded cross-field inputs'],
    ['wrong workflow mutex', (workflow: MutationWorkflow) => {
      workflow.concurrency.group = 'unsafe';
    }, 'exact issue-scoped deployment concurrency group'],
    ['single pending queue', (workflow: MutationWorkflow) => {
      workflow.concurrency.queue = 'single';
    }, 'queue: max'],
    ['cancel in progress', (workflow: MutationWorkflow) => {
      workflow.concurrency['cancel-in-progress'] = true;
    }, 'queue: max'],
    ['launcher issue default', (workflow: MutationWorkflow) => {
      workflow.on.workflow_dispatch.inputs.issue.default = '-1';
    }, 'launcher issue must be required and have no default'],
    ['job-level competing mutex', (workflow: MutationWorkflow) => {
      workflow.jobs.tag.concurrency = { group: 'unsafe' };
    }, 'must rely on the workflow deployment mutex'],
  ])('rejects isolated %s in a real release fixture', (_reason, mutate, message) => {
    expectMutationRejected('.github/workflows', 'release_workflow.yml', mutate, message);
  });

  it.each([
    ['resolver write permission', (workflow: MutationWorkflow) => {
      workflow.jobs['resolve-operation'].permissions.issues = 'write';
    }, 'resolver must be read-only'],
    ['resolver secret', (workflow: MutationWorkflow) => {
      workflow.jobs['resolve-operation'].env = { PAT: '${{ secrets.PAT }}' };
    }, 'must scope Secrets to the exact step'],
    ['missing durable proof', (workflow: MutationWorkflow) => {
      workflow.jobs['resolve-operation'].steps[0].with.script = 'core.setOutput("issue", "1")';
    }, 'prove marker ownership'],
    ['unresolved mutation', (workflow: MutationWorkflow) => {
      workflow.jobs.mutate.needs = [];
    }, 'exact resolved issue deployment mutex'],
    ['wrong continuation mutex', (workflow: MutationWorkflow) => {
      workflow.jobs.mutate.concurrency.group = 'unsafe';
    }, 'exact resolved issue deployment mutex'],
  ])('rejects managed-PR %s', (_reason, mutate, message) => {
    const file = path.join(process.cwd(), 'setup/workflows/copilot_deployment_orchestration.yml');
    const workflow = JSON.parse(JSON.stringify(yaml.load(readFileSync(file, 'utf8')))) as MutationWorkflow;
    mutate(workflow);
    expect(() => validateWorkflow(file, workflow)).toThrow(message);
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

  it('requires checkout v5, major tags for other actions, and explicit checkout credentials', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'ci_check.yml');
    expect(() => assertMajorActionReferences(file, {
      jobs: { test: { steps: [{ uses: 'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09', with: { 'persist-credentials': false } }] } },
    })).toThrow('checkout must use actions/checkout@v5');
    expect(() => assertMajorActionReferences(file, {
      jobs: { test: { steps: [{ uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020' }] } },
    })).toThrow('major version tag');
    expect(() => assertMajorActionReferences(file, {
      jobs: { test: { steps: [{ uses: 'actions/setup-node@main' }] } },
    })).toThrow('major version tag');
    expect(() => assertMajorActionReferences(file, {
      jobs: { test: { steps: [{ uses: 'actions/checkout@v5' }] } },
    })).toThrow('persist-credentials: false');
  });

  it('rejects inputs missing from the current Copilot action manifest', () => {
    const file = path.join(process.cwd(), 'setup', 'workflows', 'copilot_pull_request.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const action = workflow.jobs['copilot-pull-requests'].steps.find(
      (step: { uses?: string }) => step.uses?.startsWith('vypdev/copilot@'),
    );
    action.with['future-unsupported-input'] = 'true';

    expect(() => assertCopilotActionInputs(file, workflow)).toThrow(
      'passes inputs unsupported by vypdev/copilot@',
    );
  });

  it('executes the pull request workflow against the current checkout', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'copilot_pull_request.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const action = workflow.jobs['copilot-pull-requests'].steps.find(
      (step: { uses?: string }) => step.uses === './',
    );

    expect(action).toBeDefined();
    expect(() => assertMajorActionReferences(file, workflow)).not.toThrow();
  });

  it('requires every specialized role reachable from a workflow', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'copilot_pull_request.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const action = workflow.jobs['copilot-pull-requests'].steps.find((step: { uses?: string }) => step.uses === './');
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

  it('limits the implicit GITHUB_TOKEN to read-only contents plus PR review evidence', () => {
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
        expect(() => assertAgentWorkflowPermissions(file, workflow)).toThrow('must grant GITHUB_TOKEN exactly');
      }
    }
  });
});
