import path from 'node:path';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import * as yaml from 'js-yaml';
import { WORKFLOW_QUEUE_POLICY } from '../../application/policies/workflow_queue_policy';
import { selectedSetupRunsOn } from '../../application/policies/setup_runner_policy';

const CRLF_WHITESPACE = 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol';

interface ContractModule {
  assertQueueWorkflow(file: string, workflow: Record<string, unknown>): void;
  assertDirectEventTriggers(file: string, workflow: Record<string, unknown>): void;
  assertRunner(file: string, workflow: Record<string, unknown>): void;
  assertPortableRunShell(file: string, workflow: Record<string, unknown>): void;
  assertMajorActionReferences(file: string, workflow: Record<string, unknown>): void;
  assertCopilotActionInputs(file: string, workflow: Record<string, unknown>): void;
  assertNoJobLevelSecrets(file: string, workflow: Record<string, unknown>): void;
  assertAgentWorkflowPermissions(file: string, workflow: Record<string, unknown>): void;
  assertAgentInstallationPrerequisites(file: string, workflow: Record<string, unknown>): void;
  assertRepositoryLocaleInputs(file: string, workflow: Record<string, unknown>): void;
  assertRepositoryBugbotContextExclusions(file: string, workflow: Record<string, unknown>): void;
  assertIssueBranchConfigurationInputs(file: string, workflow: Record<string, unknown>): void;
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
  assertPortableRunShell,
  assertMajorActionReferences,
  assertCopilotActionInputs,
  assertNoJobLevelSecrets,
  assertAgentWorkflowPermissions,
  assertAgentInstallationPrerequisites,
  assertRepositoryLocaleInputs,
  assertRepositoryBugbotContextExclusions,
  assertIssueBranchConfigurationInputs,
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
type RegistryVisibilityCase = {
  name: string; timeout: string; interval: string; visibleAt: number; success: boolean; elapsed: number;
  slowAt?: number; lookupDuration?: number; ignoreLookupTimeout?: boolean;
};

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
  on: { issues: { types: ['opened', 'closed'] } },
  name: 'Copilot - Issue',
  jobs: {
    'copilot-issues': {
      if: "${{ (github.event.action == 'closed' && github.event.issue.state == 'closed') || vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN }}",
      'runs-on': ['self-hosted', 'codex'],
      'timeout-minutes': MIN_QUEUE_JOB_TIMEOUT_MINUTES,
      steps: [{ uses: './', with: {} }],
    },
  },
};

describe('workflow contract validator', () => {
  it.each(['.github/workflows', 'setup/workflows'].flatMap(directory =>
    ['copilot_commit.yml', 'copilot_branch_sync.yml'].flatMap(name =>
      ['remove', 'shadow'].map(mutation => [directory, name, mutation]))))(
    'rejects %s/%s when permission-probe exclusion is %s', (directory, name, mutation) => {
      const { file, workflow } = loadMutationWorkflow(directory, name);
      if (mutation === 'remove') workflow.on.push.branches = workflow.on.push.branches
        .filter((branch: string) => branch !== '!copilot-permission-test-*');
      else workflow.on.push.branches.push('**');
      expect(() => validateWorkflow(file, workflow)).toThrow(/permission-probe/);
    },
  );

  it.each(['.github/workflows', 'setup/workflows'].flatMap(directory =>
    ['copilot_commit.yml', 'copilot_branch_sync.yml'].map(name => [directory, name])))(
    'excludes probe refs and preserves ordinary push admission in %s/%s', (directory, name) => {
      const { file, workflow } = loadMutationWorkflow(directory, name);
      expect(() => validateWorkflow(file, workflow)).not.toThrow();
      const admitted = (ref: string) => (workflow.on.push.branches as string[]).reduce((accept, pattern) => {
        const excluded = pattern.startsWith('!');
        return path.posix.matchesGlob(ref, excluded ? pattern.slice(1) : pattern) ? !excluded : accept;
      }, false);
      expect(admitted(`copilot-permission-test-${'a'.repeat(32)}`)).toBe(false);
      expect(admitted(`copilot-permission-test-${'0123456789abcdef'.repeat(2)}`)).toBe(false);
      for (const ref of ['feature/42-change', 'bugfix/570-runner', 'release/3.5.7', 'hotfix/urgent',
        'feature/copilot-permission-test-example', 'copilot-permission-testing']) expect(admitted(ref)).toBe(true);
      for (const ref of ['master', 'develop', 'setup/copilot/reviewed-operation']) {
        expect(admitted(ref)).toBe(name === 'copilot_branch_sync.yml');
      }
    },
  );

  it.each(['.github/workflows', 'setup/workflows'])('excludes issue-less installer pushes from Commit in %s', directory => {
    const { file, workflow } = loadMutationWorkflow(directory, 'copilot_commit.yml');
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
    workflow.on.push.branches = workflow.on.push.branches.filter((branch: string) => branch !== '!setup/copilot/**');
    expect(() => validateWorkflow(file, workflow)).toThrow('exclude installer-owned setup/copilot branches');
  });

  it('keeps branch and SDD configuration consistent across issue, PR, review and push callbacks', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const fileName of ['copilot_issue.yml', 'copilot_issue_comment.yml', 'copilot_commit.yml',
        'copilot_pull_request.yml', 'copilot_pull_request_review_state.yml', 'copilot_pull_request_comment.yml']) {
        const { file, workflow } = loadMutationWorkflow(directory, fileName);
        expect(() => assertIssueBranchConfigurationInputs(file, workflow)).not.toThrow();
      }
    }
  });

  it.each(['issue-managed-branches', 'pre-branch-sdd', 'verification-setup'])(
    'rejects a comment coordinator that omits or disables the installed %s policy', input => {
      const { file, workflow } = loadMutationWorkflow('.github/workflows', 'copilot_comment_runtime.yml');
      const action = workflow.jobs.copilot.steps.find((step: { id?: string }) => step.id === 'copilot');
      delete action.with[input];
      expect(() => validateWorkflow(file, workflow)).toThrow('native comment runtime');
      action.with[input] = false;
      expect(() => validateWorkflow(file, workflow)).toThrow('native comment runtime');
    },
  );

  it('rejects a distributed callback that enables the SDD gate instead of inheriting its configured default', () => {
    const { file, workflow } = loadMutationWorkflow('setup/workflows', 'copilot_pull_request_comment.yml');
    const action = workflow.jobs['copilot-pull-requests'];
    action.with['pre-branch-sdd'] = "${{ vars.PRE_BRANCH_SDD || 'true' }}";
    expect(() => assertIssueBranchConfigurationInputs(file, workflow)).toThrow('must pass consistent');
  });

  it('rejects installed and generated PR workflows that omit the draft-to-ready event', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      const file = path.join(process.cwd(), directory, 'copilot_pull_request.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      expect(() => assertDirectEventTriggers(file, workflow)).not.toThrow();
      workflow.on.pull_request.types = workflow.on.pull_request.types.filter((type: string) => type !== 'ready_for_review');
      expect(() => assertDirectEventTriggers(file, workflow)).toThrow('must handle code/lifecycle PR events');
    }
  });

  it.each(['.github/workflows', 'setup/workflows'])(
    'keeps the Codex model fallback and exact allowlist synchronized in %s',
    directory => {
      const modelFallback = "${{ vars.AGENT_MODEL || 'gpt-6-luna' }}";
      const allowedFallback = "${{ vars.AGENT_ALLOWED_MODELS || 'openai/gpt-6-luna' }}";
      for (const fileName of [
        'copilot_close_inactive_issues.yml', 'copilot_commit.yml', 'copilot_issue.yml',
        'copilot_issue_comment.yml', 'copilot_pull_request.yml',
        'copilot_pull_request_comment.yml', 'copilot_pull_request_review_state.yml',
      ]) {
        const coordinator = ['copilot_issue_comment.yml', 'copilot_pull_request_comment.yml'].includes(fileName);
        const workflow = yaml.load(readFileSync(path.join(process.cwd(), coordinator ? '.github/workflows' : directory, coordinator ? 'copilot_comment_runtime.yml' : fileName), 'utf8')) as MutationWorkflow;
        const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
        const modelInputs = steps.filter(step => step.with?.['agent-model']);
        expect(modelInputs).not.toHaveLength(0);
        expect(modelInputs.every(step => step.with['agent-model'] === modelFallback)).toBe(true);
        if (fileName === 'copilot_close_inactive_issues.yml') continue;
        const allowlists = steps.filter(step => step.env?.AGENT_ALLOWED_MODELS);
        expect(allowlists).not.toHaveLength(0);
        expect(allowlists.every(step => step.env.AGENT_ALLOWED_MODELS === allowedFallback)).toBe(true);
      }
    },
  );

  it('publishes the same default on the action input surface', () => {
    const manifest = yaml.load(readFileSync(path.join(process.cwd(), 'action.yml'), 'utf8')) as {
      inputs: Record<string, { default?: string }>;
    };
    expect(manifest.inputs['agent-model'].default).toBe('gpt-6-luna');
  });

  it('excludes retired decorative image inputs from the public action contract', () => {
    const manifest = yaml.load(
      readFileSync(path.join(process.cwd(), 'action.yml'), 'utf8'),
    ) as {
      inputs: Record<string, { default?: string; description?: string }>;
    };

    expect(Object.keys(manifest.inputs)).not.toContainEqual(expect.stringMatching(/^images-(?:on-|issue-|pull-request-|commit-)/u));
  });

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

  it('serializes each branch event owner without cross-canceling the other workflow', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const manifest of QUEUE_WORKFLOW_MANIFEST) {
        const file = path.join(process.cwd(), directory, manifest.file);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as Record<string, unknown> & {
          jobs: Record<string, { concurrency?: unknown }>;
        };
        expect(workflow.concurrency).toBeUndefined();
        if (['copilot_commit.yml', 'copilot_pull_request.yml', 'copilot_pull_request_review_state.yml'].includes(manifest.file)) {
          const expectedGroup = manifest.file === 'copilot_commit.yml'
            ? 'copilot-push-${{ github.repository }}-${{ github.ref_name }}'
            : `copilot-pr-${'${{ github.repository }}'}-${'${{ github.event.pull_request.head.ref || github.ref_name }}'}-${manifest.file === 'copilot_pull_request.yml' ? 'analysis' : 'review-state'}`;
          expect(workflow.jobs[manifest.jobId].concurrency).toEqual({
            group: expectedGroup,
            'cancel-in-progress': true,
          });
        } else {
          expect(workflow.jobs[manifest.jobId].concurrency).toBeUndefined();
        }
        expect(() => validateWorkflow(file, workflow)).not.toThrow();
      }
    }
  });

  it.each(['.github/workflows', 'setup/workflows'].flatMap(directory => [
    [directory, 'copilot_pull_request.yml', 'copilot-pull-requests'],
    [directory, 'copilot_pull_request_review_state.yml', 'copilot-pull-request-review-state'],
  ]))(
    'rejects pull-request workflows that do not cancel superseded events in %s/%s',
    (directory, fileName, jobId) => {
      const file = path.join(process.cwd(), directory, fileName);
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      workflow.jobs[jobId].concurrency['cancel-in-progress'] = false;

      expect(() => validateWorkflow(file, workflow)).toThrow('cancel superseded runs');
    },
  );

  it.each([
    ['copilot_commit.yml', 'copilot-commits', 'copilot-pr-${{ github.repository }}-${{ github.ref_name }}'],
    ['copilot_pull_request.yml', 'copilot-pull-requests', 'copilot-push-${{ github.repository }}-${{ github.ref_name }}'],
    ['copilot_pull_request_review_state.yml', 'copilot-pull-request-review-state', 'copilot-pr-${{ github.repository }}-${{ github.event.pull_request.head.ref || github.ref_name }}-analysis'],
  ])(
    'rejects a cross-workflow concurrency group in %s',
    (workflowFile, jobId, sharedGroup) => {
      const file = path.join(process.cwd(), '.github/workflows', workflowFile);
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      workflow.jobs[jobId].concurrency.group = sharedGroup;

      expect(() => validateWorkflow(file, workflow)).toThrow('avoid cross-canceling another event owner');
    },
  );

  it.each(['.github/workflows', 'setup/workflows'])(
    'rejects a PR group that lets review-state events cancel active analysis in %s',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_pull_request.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      workflow.jobs['copilot-pull-requests'].concurrency.group =
        'copilot-pr-${{ github.repository }}-${{ github.event.pull_request.head.ref || github.ref_name }}';

      expect(() => validateWorkflow(file, workflow)).toThrow('avoid cross-canceling another event owner');
    },
  );

  it('rejects an event workflow that removes the generic bot actor gate', () => {
    const workflow = JSON.parse(JSON.stringify(validWorkflow));
    delete workflow.jobs['copilot-issues'].if;
    expect(() => assertQueueWorkflow(queueFile, workflow)).toThrow('required bot actor gate');
  });

  it.each(['.github/workflows', 'setup/workflows'])(
    'keeps the %s branch-sync observer ordinary-branch, bot-push-safe, and agent-free',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_branch_sync.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      expect(() => assertLightweightBranchSyncWorkflow(file, workflow)).not.toThrow();

      workflow.jobs['branch-sync'].steps.at(-1).with['fixer-model'] = 'model';
      expect(() => assertLightweightBranchSyncWorkflow(file, workflow)).toThrow('lightweight branch-sync');
    },
  );

  it.each(['copilot_pull_request.yml', 'copilot_pull_request_review_state.yml', 'copilot_pull_request_comment.yml'])(
    'requires same-repository PR gating for %s',
    (fileName) => {
      for (const directory of ['.github/workflows', 'setup/workflows']) {
        const file = path.join(process.cwd(), directory, fileName);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
        const jobId = fileName === 'copilot_pull_request_review_state.yml'
          ? 'copilot-pull-request-review-state'
          : 'copilot-pull-requests';
        const job = workflow.jobs[jobId];
        job.if = "${{ vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN }}";
        expect(() => validateWorkflow(file, workflow)).toThrow('same-repository PR gate');
      }
    },
  );

  it('rejects workflow_run and keeps PR analysis separate from review-state events', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      const analysisFile = path.join(process.cwd(), directory, 'copilot_pull_request.yml');
      const analysis = yaml.load(readFileSync(analysisFile, 'utf8')) as Record<string, any>;
      expect(() => assertDirectEventTriggers(analysisFile, analysis)).not.toThrow();
      analysis.on.pull_request_review = { types: ['submitted'] };
      expect(() => assertDirectEventTriggers(analysisFile, analysis)).toThrow('only direct pull_request');

      const reviewFile = path.join(process.cwd(), directory, 'copilot_pull_request_review_state.yml');
      const review = yaml.load(readFileSync(reviewFile, 'utf8')) as Record<string, any>;
      expect(() => assertDirectEventTriggers(reviewFile, review)).not.toThrow();
      review.on.workflow_run = { types: ['completed'] };
      expect(() => assertDirectEventTriggers(reviewFile, review)).toThrow('must not define workflow_run');
      delete review.on.workflow_run;
      review.on.pull_request = { types: ['synchronize'] };
      expect(() => assertDirectEventTriggers(reviewFile, review)).toThrow('only direct pull_request_review');
    }
  });

  it.each(['.github/workflows', 'setup/workflows'])(
    'rejects metadata-only PR triggers, embedded merge checks, and unsafe PR check identities in %s',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_pull_request.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;

      workflow.on.pull_request.types.push('edited');
      expect(() => assertDirectEventTriggers(file, workflow)).toThrow('metadata-only edited events');

      workflow.on.pull_request.types = workflow.on.pull_request.types.filter((type: string) => type !== 'edited');
      workflow.on.merge_group = { types: ['checks_requested'] };
      expect(() => assertDirectEventTriggers(file, workflow)).toThrow('dedicated pull-request merge-queue workflow');

      delete workflow.on.merge_group;
      workflow.jobs['copilot-pull-requests'].name = 'Unsafe dynamic identity';
      expect(() => assertDirectEventTriggers(file, workflow)).toThrow('normal PR analysis check identity');
    },
  );

  it.each(['.github/workflows', 'setup/workflows'])(
    'rejects a non-fixed review-state identity in %s',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_pull_request_review_state.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      workflow.jobs['copilot-pull-request-review-state'].name = '${{ github.event.action }}';

      expect(() => assertDirectEventTriggers(file, workflow)).toThrow('review-state workflow and check identity');
    },
  );

  it.each(['.github/workflows', 'setup/workflows'])(
    'keeps merge-queue required checks isolated, exact, and lightweight in %s',
    (directory) => {
      const file = path.join(process.cwd(), directory, 'copilot_pull_request_merge_queue.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;

      expect(() => validateWorkflow(file, workflow)).not.toThrow();
      workflow.jobs['copilot-pull-request-required-check'].name = 'Copilot - Merge Queue';
      expect(() => validateWorkflow(file, workflow)).toThrow('required-check identity');
    },
  );

  it.each(['.github/workflows', 'setup/workflows'])('requires the exact push review range fetch in %s', (directory) => {
    const file = path.join(process.cwd(), directory, 'copilot_commit.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    workflow.jobs['copilot-commits'].steps = workflow.jobs['copilot-commits'].steps.filter(
      (step: { name?: string }) => step.name !== 'Fetch push review range',
    );

    expect(() => validateWorkflow(file, workflow)).toThrow('must materialize and verify the exact GitHub before/after review range');
  });

  it.each([
    ['.github/workflows', 'copilot_commit.yml', 'copilot-commits'],
    ['.github/workflows', 'release_workflow.yml', 'prepare-compiled-files'],
    ['setup/workflows', 'copilot_commit.yml', 'copilot-commits'],
    ['setup/workflows', 'copilot_pull_request.yml', 'copilot-pull-requests'],
  ])('requires portable Bash for run steps in %s/%s', (directory, fileName, jobId) => {
    const file = path.join(process.cwd(), directory, fileName);
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    expect(() => assertPortableRunShell(file, workflow)).not.toThrow();
    delete workflow.defaults;
    delete workflow.jobs[jobId].defaults;
    for (const step of workflow.jobs[jobId].steps) delete step.shell;
    expect(() => assertPortableRunShell(file, workflow)).toThrow('must select shell: bash');
  });

  it('rejects a platform-specific shell override on a Codex runner', () => {
    const file = path.join(process.cwd(), '.github/workflows/copilot_commit.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    workflow.jobs['copilot-commits'].steps.find((step: { run?: string }) => step.run).shell = 'pwsh';
    expect(() => assertPortableRunShell(file, workflow)).toThrow('must select shell: bash');
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
    '.github/workflows/copilot_pull_request_merge_queue.yml',
    'setup/workflows/copilot_pull_request_merge_queue.yml',
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
    expect(durable.if).toBe("${{ inputs.mode == 'publish' || inputs.mode == 'resume' }}");
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
    expect(durable.if).toBe("${{ inputs.mode == 'publish' || inputs.mode == 'resume' }}");
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

  it.each(mutationDirectories.flatMap(directory => mutationWorkflowNames.flatMap(fileName =>
    ['prepare', 'publish', 'resume'].flatMap(phase => ['missing', 'stale'].map(value => [directory, fileName, phase, value])))))(
    'rejects %s/%s %s with %s merge-queue attestations', (directory, fileName, phase, value) => {
      expectMutationRejected(directory, fileName, workflow => {
        const action = phase === 'prepare' ? 'prepare_deployment_action' : 'published_deployment_action';
        const job = phase === 'resume' ? workflow.jobs['resume-reconciliation']
          : Object.entries(workflow.jobs).find(([id, job]) => id !== 'resume-reconciliation'
            && (job.steps ?? []).some((step: any) => step.with?.['single-action'] === action))![1];
        const step = job.steps.find((step: any) => step.with?.['single-action'] === action);
        if (value === 'missing') delete step.with['merge-queue-check-attestations'];
        else step.with['merge-queue-check-attestations'] = '[]';
      }, 'live merge-queue attestations');
    },
  );

  it.each(mutationWorkflowNames)('enforces the active compiled-files budget for %s', (fileName) => {
    expectMutationRejected('.github/workflows', fileName, (workflow) => {
      workflow.jobs['prepare-compiled-files']['timeout-minutes'] = PREPARE_COMPILED_TIMEOUT_MINUTES - 1;
    }, 'job prepare-compiled-files must have timeout-minutes 30');
  });

  it.each(mutationDirectories.flatMap(directory => mutationWorkflowNames.map(fileName => [directory, fileName])))(
    'executes %s/%s input validation with the bundled runtime and default token', (directory, fileName) => {
      const { workflow } = loadMutationWorkflow(directory, fileName);
      const step = workflow.jobs.validate.steps[0];
      expect(step.uses).toBe('actions/github-script@v9');
      expect(step.with['github-token']).toBeUndefined();
      expect(step.run).toBeUndefined();
      expect(workflow.jobs.validate.permissions).toEqual({});
      const prepare = { MODE: 'prepare', OPERATION_ID: '', VERSION: '3.4.0', ISSUE: '499', TITLE: 'Minor release', CHANGELOG: 'Validated changes' };
      const publish = { ...prepare, MODE: 'publish', OPERATION_ID: 'release-operation-499', TITLE: '', CHANGELOG: '' };
      const scenarios = [
        { env: prepare, valid: true },
        { env: publish, valid: true },
        { env: { ...publish, MODE: 'resume' }, valid: true },
        { env: { ...publish, MODE: 'resume', OPERATION_ID: '' }, valid: false },
        { env: { ...prepare, ISSUE: '-1' }, valid: false },
        { env: { ...prepare, ISSUE: '9007199254740992' }, valid: false },
        { env: { ...prepare, VERSION: 'Automatic' }, valid: false },
        { env: { ...prepare, MODE: 'unknown' }, valid: false },
        { env: { ...prepare, OPERATION_ID: 'unexpected-operation' }, valid: false },
        { env: { ...prepare, TITLE: '' }, valid: false },
        { env: { ...prepare, CHANGELOG: '' }, valid: false },
        { env: { ...publish, OPERATION_ID: '' }, valid: false },
        { env: { ...publish, TITLE: 'unexpected title' }, valid: false },
        { env: { ...publish, CHANGELOG: 'unexpected changelog' }, valid: false },
      ];
      for (const scenario of scenarios) {
        const setFailed = jest.fn();
        runInNewContext(step.with.script, { process: { env: scenario.env }, core: { setFailed } });
        expect(setFailed).toHaveBeenCalledTimes(scenario.valid ? 0 : 1);
      }
    },
  );

  it.each([
    ["skipped proof", (job: Record<string, any>) => { job.steps[0].if = "${{ false }}"; }],
    ["ignored proof failure", (job: Record<string, any>) => { job.steps[0]['continue-on-error'] = true; }],
    ["different launcher", (job: Record<string, any>) => { job.steps.at(-1).with['single-action-issue'] = '1'; }],
  ] as const)("rejects recovery proof bypass: %s", (_name, mutate) => {
    expectMutationRejected('.github/workflows', 'release_workflow.yml', workflow => {
      mutate(workflow.jobs['resume-reconciliation']);
    }, 'recovery must prove existing publication state');
  });

  it.each(mutationDirectories.flatMap(directory => mutationWorkflowNames.map(fileName => [directory, fileName]))) (
    "isolates recovery and executes its durable-state proof in %s/%s", async (directory, fileName) => {
      const { workflow } = loadMutationWorkflow(directory, fileName);
      const job = workflow.jobs["resume-reconciliation"];
      expect(job.needs).toBe("validate");
      expect(job.if).toBe("${{ inputs.mode == 'resume' }}");
      expect(job.steps.filter((step: { with?: Record<string, unknown> }) => step.with?.['single-action'])
        .map((step: { with: Record<string, unknown> }) => step.with['single-action'])).toEqual(['published_deployment_action']);
      expect(JSON.stringify(job)).not.toMatch(/npm publish|create_tag|create_release|publish_github_action/);
      const state = { stateVersion: 1, revision: 10, operationId: 'operation-12345678', version: '3.5.2',
        phase: 'blocked', lastFailure: { retryable: true, previousPhase: 'reconciliation_pending' },
        publicationVerified: true, productionSha: 'c'.repeat(40), tag: 'v3.5.2',
        publicationReceipt: { operationId: 'operation-12345678', productionSha: 'c'.repeat(40), tag: 'v3.5.2' } };
      const scenarios = [
        { ...state }, { ...state, phase: 'reconciliation_pending' }, { ...state, phase: 'completed' },
        { ...state, operationId: 'other-operation' }, { ...state, version: '3.5.3' },
        { ...state, publicationVerified: false }, { ...state, revision: 0 },
        { ...state, phase: 'publishing' }, { ...state, lastFailure: { retryable: false } },
        { ...state, publicationReceipt: { ...state.publicationReceipt, productionSha: 'd'.repeat(40) } },
      ];
      for (const [index, candidate] of scenarios.entries()) {
        const github = { rest: { issues: { get: jest.fn().mockResolvedValue({ data: {
          body: '<!-- copilot-configuration-start' + JSON.stringify({ schemaVersion: 3, deploymentOrchestration: candidate }) + 'copilot-configuration-end -->',
        } }) } } };
        const result = runInNewContext('(async () => {' + job.steps[0].with.script + '})()', {
          github, context: { repo: { owner: 'owner', repo: 'repo' } },
          process: { env: { ISSUE: '517', OPERATION_ID: state.operationId, VERSION: state.version } },
        });
        if (index < 3) await expect(result).resolves.toBeUndefined();
        else await expect(result).rejects.toThrow('Recovery requires');
      }
    },
  );

  it.each(mutationWorkflowNames.flatMap(fileName => ([
    { name: 'already visible', timeout: '600', interval: '20', visibleAt: 0, success: true, elapsed: 0 },
    { name: 'lookup finishes at the deadline', timeout: '600', interval: '20', visibleAt: 600000, success: true, elapsed: 600000, slowAt: 580000, lookupDuration: 20000 },
    { name: 'not visible within ten minutes', timeout: '600', interval: '20', visibleAt: 601000, success: false, elapsed: 600000 },
    { name: 'clamped final interval', timeout: '61', interval: '60', visibleAt: 61000, success: false, elapsed: 61000 },
    { name: 'timeout below the allowed range', timeout: '59', interval: '20', visibleAt: 0, success: false, elapsed: 0 },
    { name: 'timeout above the allowed range', timeout: '901', interval: '20', visibleAt: 0, success: false, elapsed: 0 },
    { name: 'interval below the allowed range', timeout: '600', interval: '9', visibleAt: 0, success: false, elapsed: 0 },
    { name: 'interval above the allowed range', timeout: '600', interval: '61', visibleAt: 0, success: false, elapsed: 0 },
    { name: 'lookup is killed at the deadline', timeout: '600', interval: '20', visibleAt: 601000, success: false, elapsed: 600000, slowAt: 580000, lookupDuration: 30000 },
    { name: 'late successful response is rejected', timeout: '600', interval: '20', visibleAt: 600000, success: false, elapsed: 610000, slowAt: 580000, lookupDuration: 30000, ignoreLookupTimeout: true },
    { name: 'non-numeric timeout', timeout: '600seconds', interval: '20', visibleAt: 0, success: false, elapsed: 0 },
    { name: 'non-integer interval', timeout: '600', interval: '20.5', visibleAt: 0, success: false, elapsed: 0 },
  ] as RegistryVisibilityCase[]).map(scenario => ({ fileName, ...scenario }))))('$fileName: npm visibility $name', async scenario => {
    const { workflow } = loadMutationWorkflow('.github/workflows', scenario.fileName);
    const availability = workflow.jobs['publish-npm'].steps.find((step: { name?: string }) => step.name === 'Wait for npm registry visibility');
    expect(availability.env.POLL_TIMEOUT).toBe("${{ vars.NPM_VISIBILITY_TIMEOUT_SECONDS || '600' }}");
    expect(availability.uses).toBe('actions/github-script@v9');
    let elapsed = 0;
    let failure: string | undefined;
    const lookup = jest.fn((command: string, args: string[], options: { timeout: number; killSignal: string }) => {
      expect(command).toBe('npm');
      expect(args).toContain('--fetch-retries=0');
      expect(options.timeout).toBe(Number(scenario.timeout) * 1000 - elapsed);
      expect(options.killSignal).toBe('SIGKILL');
      const duration = elapsed >= (scenario.slowAt ?? Infinity) ? scenario.lookupDuration! : 0;
      if (duration > options.timeout && !scenario.ignoreLookupTimeout) {
        elapsed += options.timeout;
        return { status: null, stdout: '', error: { code: 'ETIMEDOUT' } };
      }
      elapsed += duration;
      return { status: elapsed >= scenario.visibleAt ? 0 : 1, stdout: elapsed >= scenario.visibleAt ? '3.5.0\n' : '' };
    });
    const execution = runInNewContext(`(async () => { ${availability.with.script} })()`, {
      require: (name: string) => { expect(name).toBe('node:child_process'); return { spawnSync: lookup }; },
      process: { env: { PACKAGE_NAME: '@vypdev/copilot', RELEASE_VERSION: '3.5.0', POLL_TIMEOUT: scenario.timeout, POLL_INTERVAL: scenario.interval } },
      Date: { now: () => elapsed },
      setTimeout: (resolve: () => void, delay: number) => { elapsed += delay; resolve(); },
      core: { info: jest.fn(), setFailed: (message: string) => { failure = message; } },
    });
    const thrown = await execution.then(() => undefined, (error: unknown) => error);
    expect(thrown === undefined && failure === undefined).toBe(scenario.success);
    expect(elapsed).toBe(scenario.elapsed);
    if (!scenario.success && scenario.elapsed === 0) expect(lookup).not.toHaveBeenCalled();
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
        uses: 'actions/github-script@v9',
        with: expect.objectContaining({ script: expect.stringContaining('timeout: remaining') }),
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
      workflow.jobs.validate.steps[0].with['github-token'] = '${{ secrets.PAT }}';
    }, 'default permissionless token'],
    ['empty validation token override', (workflow: MutationWorkflow) => {
      workflow.jobs.validate.steps[0].with['github-token'] = '';
    }, 'default permissionless token'],
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
    expect(() => assertRunner(queueFile, {
      jobs: { 'copilot-issues': { 'runs-on': ['self-hosted', 'codex', 'macOS'] } },
    })).toThrow('runs-on self-hosted, codex');
  });

  it('accepts the setup-generated grouped provisioning route through the complete source validator', () => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'agent-cli-provisioning.yml');
    workflow.jobs['verify-agent-clis']['runs-on'] = selectedSetupRunsOn({
      mode: 'manual-self-hosted', profileId: '', group: 'vypdev',
      labels: ['self-hosted', 'codex', 'Linux'], validation: 'hosted',
    }, 'agent');
    expect(workflow.jobs['verify-agent-clis']['runs-on']).toEqual({ group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] });
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
  });

  it.each([
    { group: 'vypdev', labels: ['self-hosted', 'codex'] },
    { labels: ['self-hosted', 'codex', 'Linux'] },
  ])('retains source queue contracts for literal object route %j', route => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'copilot_issue.yml');
    workflow.jobs['copilot-issues']['runs-on'] = route;
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
  });

  it.each([
    ['unknown field', { group: 'vypdev', labels: ['self-hosted', 'codex'], extra: true }],
    ['missing labels', { group: 'vypdev' }],
    ['empty labels', { labels: [] }],
    ['too many labels', { labels: ['self-hosted', ...Array.from({ length: 10 }, (_, i) => `label-${i}`)] }],
    ['non-string label', { labels: ['self-hosted', 7] }],
    ['null label', { labels: null }],
    ['empty label', { labels: ['self-hosted', ''] }],
    ['overlong label', { labels: ['self-hosted', 'x'.repeat(101)] }],
    ['padded label', { labels: ['self-hosted', ' codex'] }],
    ['control label', { labels: ['self-hosted', 'codex\nLinux'] }],
    ['invisible label', { labels: ['self-hosted', 'codex\u200b'] }],
    ['expression label', { labels: ['self-hosted', '${{ vars.RUNNER }}'] }],
    ['duplicate label', { labels: ['self-hosted', 'codex', 'CODEX'] }],
    ['null group', { group: null, labels: ['self-hosted', 'codex'] }],
    ['empty group', { group: '', labels: ['self-hosted', 'codex'] }],
    ['padded group', { group: ' vypdev', labels: ['self-hosted', 'codex'] }],
    ['overlong group', { group: 'x'.repeat(101), labels: ['self-hosted', 'codex'] }],
    ['expression group', { group: '${{ vars.RUNNER_GROUP }}', labels: ['self-hosted', 'codex'] }],
    ['control group', { group: 'vypdev\n', labels: ['self-hosted', 'codex'] }],
    ['hosted labels in a group', { group: 'vypdev', labels: 'ubuntu-latest' }],
  ])('rejects %s in runner objects before routing', (_reason, route) => {
    expect(() => assertRunner(queueFile, { jobs: { 'copilot-issues': { 'runs-on': route } } }))
      .toThrow('runs-on object must contain only');
  });

  it.each([
    { group: 'vypdev', labels: 'self-hosted' },
    { group: 'vypdev', labels: ['self-hosted', 'codex', 'Windows'] },
    { group: 'vypdev', labels: ['self-hosted', 'codex', 'macOS'] },
  ])('still requires the exact source role labels in runner object %j', route => {
    expect(() => assertRunner(queueFile, { jobs: { 'copilot-issues': { 'runs-on': route } } }))
      .toThrow('runs-on self-hosted, codex');
  });

  it.each([
    ['.github/workflows', 'copilot_credential_health.yml'],
    ['setup/workflows', 'copilot_credential_health.yml'],
    ['setup/workflows', 'copilot_issue.yml'],
    ['.github/workflows', 'ci_check.yml'],
  ])('prevents grouped routing from overriding the hosted/trust role in %s/%s', (directory, name) => {
    const { file, workflow } = loadMutationWorkflow(directory, name);
    Object.values(workflow.jobs)[0]['runs-on'] = { group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] };
    expect(() => assertRunner(file, workflow)).toThrow('must use runs-on');
  });

  it('enforces Bash and isolated pnpm on grouped source jobs', () => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'copilot_issue.yml');
    const job = workflow.jobs['copilot-issues'];
    job['runs-on'] = { group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] };
    job.steps.push({ run: 'pnpm --version', shell: 'pwsh' });
    expect(() => validateWorkflow(file, workflow)).toThrow('must select shell: bash');
    job.steps.pop();
    job.steps.push({ uses: 'pnpm/action-setup@v5', with: {} });
    expect(() => validateWorkflow(file, workflow)).toThrow('must isolate pnpm/action-setup');
  });

  it('temporarily routes installed Codex jobs to Ubuntu while Apple runners are unstable', () => {
    const workflow = yaml.load(readFileSync(queueFile, 'utf8')) as MutationWorkflow;
    const requiredLabels = workflow.jobs['copilot-issues']['runs-on'] as string[];
    expect(requiredLabels).toEqual(['self-hosted', 'codex', 'Linux']);
    const registrations = [
      { platform: 'macOS', labels: ['self-hosted', 'codex', 'macOS'] },
      { platform: 'Ubuntu', labels: ['self-hosted', 'codex', 'Linux'] },
      { platform: 'Windows', labels: ['self-hosted', 'Windows'] },
    ];
    expect(registrations.filter(runner => requiredLabels.every(label => runner.labels.includes(label)))
      .map(runner => runner.platform)).toEqual(['Ubuntu']);
    expect(() => assertRunner(queueFile, workflow)).not.toThrow();
  });

  it('rejects explicit Windows service routing for Codex operations', () => {
    expect(() => assertRunner(queueFile, {
      jobs: { 'copilot-issues': { 'runs-on': ['self-hosted', 'codex', 'Windows'] } },
    })).toThrow('runs-on self-hosted, codex');
  });

  it('keeps installed Codex jobs on the shared supported pool or explicit Linux diagnostics', () => {
    const directory = path.join(process.cwd(), '.github', 'workflows');
    const jobs = readdirSync(directory).filter(file => file.endsWith('.yml')).flatMap(file => {
      const workflow = yaml.load(readFileSync(path.join(directory, file), 'utf8')) as MutationWorkflow;
      return Object.values(workflow.jobs);
    });
    const codexJobs = jobs.filter(job => Array.isArray(job['runs-on']) && job['runs-on'].includes('codex'));
    expect(codexJobs.length).toBeGreaterThan(20);
    expect(codexJobs.every(job => JSON.stringify(job['runs-on'])
      === JSON.stringify(['self-hosted', 'codex', 'Linux']))).toBe(true);
    expect(jobs.some(job => job['runs-on'] === 'windows-latest')).toBe(true);
  });

  it('rejects reintroducing Windows into the Codex fixture matrix without removing ordinary Windows coverage', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    expect(workflow.jobs['setup-platform-smoke'].strategy.matrix.os).toContain('windows-latest');
    expect(workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include).toEqual([
      { platform: 'Ubuntu', labels: ['self-hosted', 'codex', 'Linux'] },
    ]);
    workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include.push({
      platform: 'Windows', labels: ['self-hosted', 'codex', 'Windows'],
    });
    expect(() => assertRunner(file, workflow)).toThrow('Windows services are unsupported');
  });

  it.each(['windows', 'missing-linux'])('rejects the unsupported Codex diagnostics shape %s', shape => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'copilot_runner_diagnostics.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
    if (shape === 'windows') workflow.jobs.windows = { 'runs-on': ['self-hosted', 'codex', 'Windows'], steps: [] };
    else delete workflow.jobs.linux;
    expect(() => assertRunner(file, workflow)).toThrow('only the supported Linux Codex diagnostic job');
  });

  it('requires the Ubuntu, Windows and macOS setup fixture matrix', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
    workflow.jobs['setup-platform-smoke'].strategy.matrix.os = ['ubuntu-latest', 'windows-latest'];
    expect(() => assertRunner(file, workflow)).toThrow('Ubuntu, Windows and macOS setup fixture matrix');
  });

  it.each([
    ['pull_request', false, false, true],
    ['workflow_dispatch', false, false, true],
    ['workflow_dispatch', false, true, true],
    ['workflow_dispatch', true, false, false],
    ['workflow_dispatch', true, true, true],
    ['push', false, false, false],
  ] as const)('selects hosted setup fixtures for %s with probe=%s and export=%s', (eventName, windowsStartupProbe, uploadWindowsCoverage, expected) => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const expression = workflow.jobs['setup-platform-smoke'].if;
    expect(runInNewContext(expression.slice(4, -3), {
      github: { event_name: eventName },
      inputs: { windows_startup_probe: windowsStartupProbe, upload_windows_coverage: uploadWindowsCoverage },
    })).toBe(expected);
  });

  it('requires ordinary hosted manual fixtures independently of coverage export', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const hosted = workflow.jobs['setup-platform-smoke'];
    const expression = hosted.if;
    expect(expression).toBe("${{ github.event_name == 'pull_request' || (github.event_name == 'workflow_dispatch' && (inputs.windows_startup_probe != true || inputs.upload_windows_coverage == true)) }}");
    delete hosted.if;
    expect(() => assertRunner(file, workflow)).toThrow('independently of coverage export');
    hosted.if = "${{ github.event_name == 'pull_request' }}";
    expect(() => assertRunner(file, workflow)).toThrow('independently of coverage export');
  });

  it('retains hosted macOS during the authorized temporary Ubuntu-only self-hosted selection', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    expect(workflow.jobs['setup-platform-smoke'].strategy.matrix.os).toContain('macos-latest');
    expect(workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include).toEqual([
      { platform: 'Ubuntu', labels: ['self-hosted', 'codex', 'Linux'] },
    ]);
    expect(() => assertRunner(file, workflow)).not.toThrow();
    workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include.unshift({
      platform: 'macOS', labels: ['self-hosted', 'codex', 'macOS'],
    });
    expect(() => assertRunner(file, workflow)).not.toThrow();
  });

  it('rejects removing Ubuntu from the supported self-hosted fixture selection', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include =
      workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include
        .filter((row: { platform: string }) => row.platform !== 'Ubuntu');
    expect(() => assertRunner(file, workflow)).toThrow('self-hosted macOS and Ubuntu');
  });

  it('rejects explicit dependency-cache backup on persistent smoke runners', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const node = workflow.jobs['setup-self-hosted-codex-smoke'].steps.find((step: { uses?: string }) => step.uses === 'actions/setup-node@v7');
    node.with.cache = 'pnpm';
    expect(() => assertRunner(file, workflow)).toThrow('disable dependency-cache backup');
  });

  it('rejects automatic cache detection on persistent runners while retaining hosted pnpm caching', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const node = workflow.jobs['setup-self-hosted-codex-smoke'].steps.find((step: { uses?: string }) => step.uses === 'actions/setup-node@v7');
    delete node.with['package-manager-cache'];
    expect(() => assertRunner(file, workflow)).toThrow('disable dependency-cache backup');
    const hosted = workflow.jobs['setup-platform-smoke'].steps.find((step: { uses?: string }) => step.uses === 'actions/setup-node@v7');
    expect(hosted.with.cache).toBe('pnpm');
  });

  it('requires isolated fixtures on the supported manually dispatched Codex runner selection', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
    const dispatchGuard = workflow.jobs['setup-self-hosted-codex-smoke'].if;
    for (const [eventName, ref, expected] of [
      ['workflow_dispatch', 'refs/heads/master', true],
      ['workflow_dispatch', 'refs/heads/develop', false],
      ['workflow_dispatch', 'refs/heads/codex/unreviewed', false],
      ['workflow_dispatch', 'refs/tags/unreviewed', false],
      ['pull_request', 'refs/heads/master', false],
    ] as const) {
      expect(runInNewContext(dispatchGuard.slice(4, -3), {
        github: { event_name: eventName, ref }, inputs: { windows_startup_probe: false },
      })).toBe(expected);
    }
    workflow.jobs['setup-self-hosted-codex-smoke']['runs-on'] = ['self-hosted', 'codex'];
    expect(() => assertRunner(file, workflow)).toThrow('self-hosted macOS and Ubuntu');
    workflow.jobs['setup-self-hosted-codex-smoke']['runs-on'] = '${{ matrix.labels }}';
    workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include.pop();
    expect(() => assertRunner(file, workflow)).toThrow('self-hosted macOS and Ubuntu');
    workflow.jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include =
      (yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow).jobs['setup-self-hosted-codex-smoke'].strategy.matrix.include;
    delete workflow.jobs['setup-self-hosted-codex-smoke'].if;
    expect(() => assertRunner(file, workflow)).toThrow('manual dispatch from protected master');
    workflow.jobs['setup-self-hosted-codex-smoke'].if = "github.event_name == 'workflow_dispatch'";
    expect(() => assertRunner(file, workflow)).toThrow('manual dispatch from protected master');
    workflow.jobs['setup-self-hosted-codex-smoke'].if =
      "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/master' && inputs.windows_startup_probe != true }}";
    workflow.jobs['setup-self-hosted-codex-smoke'].steps = workflow.jobs['setup-self-hosted-codex-smoke'].steps
      .filter((step: { name?: string }) => step.name !== 'Full platform coverage and acceptance budgets');
    expect(() => assertRunner(file, workflow)).toThrow('full platform coverage and acceptance budgets');
    workflow.jobs['setup-self-hosted-codex-smoke'].steps = (yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow)
      .jobs['setup-self-hosted-codex-smoke'].steps
      .filter((step: { name?: string }) => step.name !== 'Validate generated guidance checkout on codex runner');
    expect(() => assertRunner(file, workflow)).toThrow('verify generated guidance at self-hosted checkout');
    workflow.jobs['setup-self-hosted-codex-smoke'].steps = (yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow)
      .jobs['setup-self-hosted-codex-smoke'].steps
      .filter((step: { name?: string }) => step.name !== 'Full platform documentation and contract validators');
    expect(() => assertRunner(file, workflow)).toThrow('full platform documentation and contract validators');
    workflow.jobs['setup-self-hosted-codex-smoke'].steps = (yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow)
      .jobs['setup-self-hosted-codex-smoke'].steps
      .filter((step: { name?: string }) => step.name !== 'Verify Ubuntu distribution');
    expect(() => assertRunner(file, workflow)).toThrow('verify Ubuntu on self-hosted Codex runners');
    delete workflow.jobs['setup-self-hosted-codex-smoke'];
    expect(() => assertRunner(file, workflow)).toThrow('must retain hosted and manually dispatched self-hosted');
  });

  it('requires full hosted platform coverage and an explicitly opted-in Windows Codecov upload', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const original = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const workflow = JSON.parse(JSON.stringify(original)) as MutationWorkflow;
    workflow.jobs['setup-platform-smoke'].steps = workflow.jobs['setup-platform-smoke'].steps
      .filter((step: { name?: string }) => step.name !== 'Full platform coverage and acceptance budgets');
    expect(() => assertRunner(file, workflow)).toThrow('full platform coverage and acceptance budgets');

    workflow.jobs['setup-platform-smoke'].steps = JSON.parse(JSON.stringify(original.jobs['setup-platform-smoke'].steps));
    workflow.jobs['setup-platform-smoke'].steps = workflow.jobs['setup-platform-smoke'].steps
      .filter((step: { name?: string }) => step.name !== 'Full platform documentation and contract validators');
    expect(() => assertRunner(file, workflow)).toThrow('full platform documentation and contract validators');

    workflow.jobs['setup-platform-smoke'].steps = JSON.parse(JSON.stringify(original.jobs['setup-platform-smoke'].steps));
    workflow.jobs['setup-platform-smoke'].steps = workflow.jobs['setup-platform-smoke'].steps
      .filter((step: { name?: string }) => step.name !== 'Preserve hosted Windows coverage');
    expect(() => assertRunner(file, workflow)).toThrow('preserve hosted Windows coverage');

    workflow.jobs['setup-platform-smoke'].steps = JSON.parse(JSON.stringify(original.jobs['setup-platform-smoke'].steps));
    const artifact = workflow.jobs['setup-platform-smoke'].steps.find((step: { name?: string }) =>
      step.name === 'Preserve hosted Windows coverage');
    artifact.if = "runner.os == 'Linux'";
    expect(() => assertRunner(file, workflow)).toThrow('preserve hosted Windows coverage');

    workflow.jobs['setup-platform-smoke'].steps = JSON.parse(JSON.stringify(original.jobs['setup-platform-smoke'].steps));
    delete workflow.jobs['upload-windows-coverage'];
    expect(() => assertRunner(file, workflow)).toThrow('Windows coverage upload');

    workflow.jobs['upload-windows-coverage'] = JSON.parse(JSON.stringify(original.jobs['upload-windows-coverage']));
    workflow.jobs['upload-windows-coverage'].needs = undefined;
    expect(() => assertRunner(file, workflow)).toThrow('dependent Ubuntu job');

    workflow.jobs['upload-windows-coverage'] = JSON.parse(JSON.stringify(original.jobs['upload-windows-coverage']));
    workflow.jobs['upload-windows-coverage'].if = undefined;
    expect(() => assertRunner(file, workflow)).toThrow('explicit manual opt-in');

    workflow.jobs['upload-windows-coverage'] = JSON.parse(JSON.stringify(original.jobs['upload-windows-coverage']));
    workflow.jobs['upload-windows-coverage'].steps[2].with.fail_ci_if_error = false;
    expect(() => assertRunner(file, workflow)).toThrow('dependent Ubuntu job');

    workflow.jobs['upload-windows-coverage'] = JSON.parse(JSON.stringify(original.jobs['upload-windows-coverage']));
    workflow.on.workflow_dispatch.inputs.upload_windows_coverage.default = true;
    expect(() => assertRunner(file, workflow)).toThrow('default Windows Codecov export to disabled');
  });

  it.each(['setup-platform-smoke'])(
    'requires the real Windows job Node npm preflight in %s', (jobId) => {
      const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      workflow.jobs[jobId].steps = workflow.jobs[jobId].steps.filter(
        (step: { name?: string }) => step.name !== 'Verify Windows job Node npm CLI',
      );
      expect(() => assertRunner(file, workflow)).toThrow('verify the Windows job Node npm CLI');
    },
  );

  it('excludes Windows service-runner settings from the supported Codex and hosted coverage jobs', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
    const original = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const workflow = JSON.parse(JSON.stringify(original)) as MutationWorkflow;
    const coverage = (jobId: string) => workflow.jobs[jobId].steps.find(
      (step: { name?: string }) => step.name === 'Full platform coverage and acceptance budgets',
    );
    expect(coverage('setup-self-hosted-codex-smoke').env).toBeUndefined();
    coverage('setup-self-hosted-codex-smoke').env = { COPILOT_JEST_WINDOWS_SERVICE_COVERAGE: '1' };
    expect(() => assertRunner(file, workflow)).toThrow('must not apply Windows service-runner settings');
    delete coverage('setup-self-hosted-codex-smoke').env;
    coverage('setup-platform-smoke').env = { COPILOT_JEST_WINDOWS_SERVICE_COVERAGE: '1' };
    expect(() => assertRunner(file, workflow)).toThrow('must not recycle hosted Windows Jest workers');
  });

  it.each(['setup-platform-smoke', 'setup-self-hosted-codex-smoke'])(
    'keeps full history for acceptance budget tests in %s', (jobId) => {
      const file = path.join(process.cwd(), '.github', 'workflows', 'setup_platform_smoke.yml');
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      const checkout = workflow.jobs[jobId].steps.find((step: { uses?: string }) =>
        step.uses === 'actions/checkout@v5');
      checkout.with['fetch-depth'] = 1;
      expect(() => assertRunner(file, workflow)).toThrow('fetch full platform-test history');
    },
  );

  it.each([
    ['ci_check.yml', 'ci-check', 'pull_request', 'vypdev/copilot', '["self-hosted","codex","Linux"]'],
    ['ci_check.yml', 'ci-check', 'pull_request', 'outside/fork', '["ubuntu-latest"]'],
    ['ci_check.yml', 'ci-check', 'merge_group', 'vypdev/copilot', '["ubuntu-latest"]'],
  ])('routes %s %s code from %s to %s', (fileName, jobId, eventName, headRepository, expectedRunner) => {
    const file = path.join(process.cwd(), '.github', 'workflows', fileName);
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const expression = workflow.jobs[jobId]['runs-on'];
    expect(expression).toBe('${{ fromJSON((github.event_name == \'merge_group\' || (github.event_name == \'pull_request\' && github.event.pull_request.head.repo.full_name != github.repository)) && \'["ubuntu-latest"]\' || \'["self-hosted","codex","Linux"]\') }}');
    const selected = runInNewContext(expression.slice(4, -3), {
      github: {
        event_name: eventName,
        event: { pull_request: { head: { repo: { full_name: headRepository } } } },
        repository: 'vypdev/copilot',
      },
      fromJSON: JSON.parse,
    }, { timeout: 100 });
    expect(JSON.stringify(selected)).toBe(expectedRunner);
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
    workflow.jobs[jobId]['runs-on'] = ['self-hosted', 'codex'];
    expect(() => assertRunner(file, workflow)).toThrow('must use runs-on');
  });

  it('isolates RepoWise files per run and removes them after artifact upload', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'repowise.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const job = workflow.jobs['code-health'];
    job.env.REPOWISE_VENV_NAME = 'repowise-venv';
    expect(() => assertRunner(file, workflow)).toThrow('select complete Python, isolate RepoWise files');
    job.env.REPOWISE_VENV_NAME = 'repowise-venv-${{ github.run_id }}-${{ github.run_attempt }}-code-health';
    job.steps = job.steps.filter((step: { name?: string }) => step.name !== 'Remove RepoWise temporary files');
    expect(() => assertRunner(file, workflow)).toThrow('select complete Python, isolate RepoWise files');
  });

  it('requires a complete Python distribution before RepoWise creates its venv', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'repowise.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    workflow.jobs['code-health'].steps = workflow.jobs['code-health'].steps
      .filter((step: { name?: string }) => step.name !== 'Set up Python 3.12 for RepoWise');
    expect(() => assertRunner(file, workflow)).toThrow('select complete Python, isolate RepoWise files');
  });

  it('rejects runner context before a job has been assigned to a runner', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'repowise.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    workflow.jobs['code-health'].env.REPOWISE_TEMP = '${{ runner.temp }}/repowise';
    expect(() => assertRunner(file, workflow)).toThrow('cannot use runner context in job-level env');
  });

  it.each([
    ['ci_check.yml', 'ci-check'],
    ['setup_platform_smoke.yml', 'setup-self-hosted-codex-smoke'],
    ['release_workflow.yml', 'prepare-version-files'],
    ['hotfix_workflow.yml', 'prepare-version-files'],
  ])('requires an isolated pnpm destination in %s', (fileName, jobId) => {
    const file = path.join(process.cwd(), '.github', 'workflows', fileName);
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
    const setup = workflow.jobs[jobId].steps.find((step: { uses?: string }) => step.uses === 'pnpm/action-setup@v5');
    delete setup.with.dest;
    expect(() => assertRunner(file, workflow)).toThrow('must isolate');
  });

  it('checks generated guidance before and after CI tests', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'ci_check.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const steps = workflow.jobs['ci-check'].steps;
    const install = steps.findIndex((step: { name?: string }) => step.name === 'Install dependencies');
    const coverage = steps.findIndex((step: { name?: string }) => step.name === 'Run tests with coverage');
    const checks = steps.flatMap((step: { run?: string }, index: number) =>
      step.run?.includes('pnpm run validate:agent-docs') ? [index] : []);
    expect(checks).toHaveLength(2);
    expect(install).toBeLessThan(checks[0]);
    expect(checks[0]).toBeLessThan(coverage);
    expect(coverage).toBeLessThan(checks[1]);
    expect(steps[checks[0]].run).toContain('git ls-files --eol');
  });

  it.each([
    ['setup_platform_smoke.yml', 'setup-platform-smoke', 'Full platform documentation and contract validators'],
    ['setup_platform_smoke.yml', 'setup-self-hosted-codex-smoke', 'Full platform documentation and contract validators'],
  ])('treats CRLF as a line ending in the %s diff check', (fileName, jobId, stepName) => {
    const file = path.join(process.cwd(), '.github', 'workflows', fileName);
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const step = workflow.jobs[jobId].steps.find((item: { name?: string }) => item.name === stepName);
    expect(step?.run).toContain(`git -c ${CRLF_WHITESPACE} diff --check -- . ':(exclude)build/**'`);
  });

  it('checks committed PR, merge-queue, and push changes against their event base', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'ci_check.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const step = workflow.jobs['ci-check'].steps.find((item: { name?: string }) => item.name === 'Validate Git diff');
    expect(step?.run).toContain('pull_request) base="$PR_BASE_SHA"');
    expect(step?.run).toContain('merge_group) base="$MERGE_BASE_SHA"');
    expect(step?.run).toContain('push) base="$PUSH_BEFORE_SHA"');
    expect(step?.run).toContain('"$base" =~ ^0{40}$');
    expect(step?.run).toContain('base="$(git hash-object -t tree --stdin </dev/null)"');
    expect(step?.run).toContain(`git -c ${CRLF_WHITESPACE} diff --check "$base" HEAD -- . ':(exclude)build/**'`);
  });

  it('retains full history for the CI event-base diff check', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'ci_check.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const checkout = workflow.jobs['ci-check'].steps.find((step: { uses?: string }) => step.uses === 'actions/checkout@v5');
    expect(checkout.with).toMatchObject({ 'fetch-depth': 0, 'persist-credentials': false });
    delete checkout.with['fetch-depth'];
    expect(() => assertRunner(file, workflow)).toThrow('fetch full history');
  });

  it.each([
    ['setup_platform_smoke.yml', 'setup-platform-smoke', 'Full platform documentation and contract validators'],
    ['setup_platform_smoke.yml', 'setup-self-hosted-codex-smoke', 'Full platform documentation and contract validators'],
    ['ci_check.yml', 'ci-check', 'Validate Git diff'],
  ])('rejects weakened whitespace rules in %s %s', (fileName, jobId, stepName) => {
    const file = path.join(process.cwd(), '.github', 'workflows', fileName);
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const step = workflow.jobs[jobId].steps.find((item: { name?: string }) => item.name === stepName);
    step.run = step.run.replace('blank-at-eol,', '');
    expect(() => assertRunner(file, workflow)).toThrow('default whitespace checks');
  });

  it('retains whitespace errors while accepting CRLF line endings', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'copilot-git-whitespace-'));
    const git = (...args: string[]) => spawnSync('git', args, {
      cwd: directory, encoding: 'utf8', input: '',
    });
    try {
      expect(git('init', '-q').status).toBe(0);
      expect(git('config', 'core.autocrlf', 'false').status).toBe(0);
      writeFileSync(path.join(directory, 'fixture.txt'), 'clean\n');
      expect(git('add', 'fixture.txt').status).toBe(0);
      expect(git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '-qm', 'baseline').status).toBe(0);

      for (const changed of ['trailing space \n', 'blank line with spaces\n  \n', 'space before tab\n \tindent\n']) {
        writeFileSync(path.join(directory, 'fixture.txt'), changed);
        expect(git('-c', CRLF_WHITESPACE, 'diff', '--check', '--', '.').status).not.toBe(0);
        expect(git('add', 'fixture.txt').status).toBe(0);
        expect(git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
          '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'changed').status).toBe(0);
        expect(git('-c', CRLF_WHITESPACE, 'diff', '--check', 'HEAD^', 'HEAD', '--', '.').status).not.toBe(0);
        const emptyTree = git('hash-object', '-t', 'tree', '--stdin').stdout.trim();
        expect(git('-c', CRLF_WHITESPACE, 'diff', '--check', emptyTree, 'HEAD', '--', '.').status).not.toBe(0);
      }
      writeFileSync(path.join(directory, 'fixture.txt'), 'clean\r\n');
      expect(git('add', 'fixture.txt').status).toBe(0);
      expect(git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'clean-crlf').status).toBe(0);
      expect(git('-c', CRLF_WHITESPACE, 'diff', '--check', 'HEAD^', 'HEAD', '--', '.').status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('bounds RepoWise advisory scans and preserves manual health artifacts', () => {
    const file = path.join(process.cwd(), '.github', 'workflows', 'repowise.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const steps = workflow.jobs['code-health'].steps;
    const reports = steps.find((step: { name?: string }) => step.name === 'Generate RepoWise reports');
    const upload = steps.find((step: { name?: string }) => step.name === 'Upload RepoWise reports');
    expect(reports.run).toContain('"$python_bin" scripts/repowise_reports.py --report-dir "$report_dir"');
    expect(reports.run).toContain('"$python_bin" -m unittest discover');
    const adapter = readFileSync(path.join(process.cwd(), 'scripts', 'repowise_reports.py'), 'utf8');
    expect(adapter).toContain('resource.RLIMIT_AS');
    expect(adapter).toContain('os.killpg(process.pid, signal.SIGKILL)');
    expect(adapter).toContain('write_summary(report_dir, sha, results)');
    expect(upload.if).toBe('${{ always() }}');
  });

  it('accepts RepoWise manual dispatch with native branch selection and isolated concurrency', () => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'repowise.yml');
    expect(workflow.on).toEqual({ workflow_dispatch: null });
    expect(workflow.concurrency).toEqual({ group: 'repowise-${{ github.ref }}', 'cancel-in-progress': true });
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
  });

  it.each(['push', 'pull_request', 'merge_group', 'workflow_call', 'schedule'])(
    'rejects the RepoWise automatic or reusable trigger %s', event => {
      const { file, workflow } = loadMutationWorkflow('.github/workflows', 'repowise.yml');
      workflow.on[event] = event === 'schedule' ? [{ cron: '0 0 * * *' }] : {};
      expect(() => validateWorkflow(file, workflow)).toThrow('must run only through workflow_dispatch');
    },
  );

  it('rejects removal of RepoWise manual dispatch', () => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'repowise.yml');
    delete workflow.on.workflow_dispatch;
    expect(() => validateWorkflow(file, workflow)).toThrow('must run only through workflow_dispatch');
  });

  it.each(['timeout', 'permissions', 'job-permissions', 'history', 'selected-ref', 'concurrency', 'cancellation'])(
    'preserves the RepoWise manual execution boundary: %s', boundary => {
      const { file, workflow } = loadMutationWorkflow('.github/workflows', 'repowise.yml');
      const job = workflow.jobs['code-health'];
      const checkout = job.steps.find((step: { uses?: string }) => step.uses === 'actions/checkout@v5');
      if (boundary === 'timeout') job['timeout-minutes'] = 60;
      else if (boundary === 'permissions') workflow.permissions.contents = 'write';
      else if (boundary === 'job-permissions') job.permissions = { contents: 'write' };
      else if (boundary === 'history') checkout.with['fetch-depth'] = 1;
      else if (boundary === 'selected-ref') checkout.with.ref = 'master';
      else if (boundary === 'concurrency') workflow.concurrency.group = 'ci-${{ github.ref }}';
      else workflow.concurrency['cancel-in-progress'] = false;
      expect(() => validateWorkflow(file, workflow)).toThrow('manual job budget, read-only permissions, selected revision and per-ref concurrency');
    },
  );

  it('keeps RepoWise manual runs on Ubuntu codex runners', () => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'repowise.yml');
    expect(workflow.jobs['code-health']['runs-on']).toEqual(['self-hosted', 'codex', 'Linux']);
    expect(() => validateWorkflow(file, workflow)).not.toThrow();
    workflow.jobs['code-health']['runs-on'] = ['ubuntu-latest'];
    expect(() => assertRunner(file, workflow)).toThrow('must use runs-on self-hosted, codex, Linux');
  });

  it.each(['pin', 'script', 'compatibility', 'cleanup', 'upload', 'retention'])(
    'rejects loss of RepoWise manual report evidence: %s', boundary => {
      const { file, workflow } = loadMutationWorkflow('.github/workflows', 'repowise.yml');
      expect(() => validateWorkflow(file, workflow)).not.toThrow();
      const job = workflow.jobs['code-health'];
      const reports = job.steps.find((step: { name?: string }) => step.name === 'Generate RepoWise reports');
      const install = job.steps.find((step: { name?: string }) => step.name === 'Install RepoWise');
      const upload = job.steps.find((step: { name?: string }) => step.name === 'Upload RepoWise reports');
      if (boundary === 'pin') install.run = install.run.replace('repowise==0.58.0', 'repowise');
      else if (boundary === 'script') reports.run = reports.run.replace('scripts/repowise_reports.py', 'other.py');
      else if (boundary === 'compatibility') reports.run = reports.run.replace('-m unittest discover', '-m other');
      else if (boundary === 'cleanup') reports.run = reports.run.replace('trap cleanup EXIT', '');
      else if (boundary === 'upload') delete upload.if;
      else upload.with['retention-days'] = 1;
      expect(() => validateWorkflow(file, workflow)).toThrow('pinned bounded reports, compatibility tests');
    },
  );

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

  it('passes the repository locale and inheriting empty scope overrides in every agent workflow', () => {
    for (const directory of ['.github/workflows', 'setup/workflows']) {
      for (const fileName of [
        'copilot_commit.yml',
        'copilot_issue.yml',
        'copilot_issue_comment.yml',
        'copilot_pull_request.yml',
        'copilot_pull_request_comment.yml',
        'release_workflow.yml',
        'hotfix_workflow.yml',
      ]) {
        const file = path.join(process.cwd(), directory, fileName);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
        expect(() => assertRepositoryLocaleInputs(file, workflow)).not.toThrow();
      }
    }
  });

  it('rejects a workflow that replaces scope inheritance with an English override', () => {
    const file = path.join(process.cwd(), 'setup/workflows/copilot_issue.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const action = workflow.jobs['copilot-issues'].steps.find(
      (step: { uses?: string }) => step.uses?.startsWith('vypdev/copilot@'),
    );
    action.with['issues-locale'] = "${{ vars.ISSUES_LOCALE || 'en-US' }}";

    expect(() => validateWorkflow(file, workflow)).toThrow(
      'must pass the repository locale and inheriting empty scope overrides exactly',
    );
  });

  it('keeps generated artifacts out of this repository Bugbot context', () => {
    for (const fileName of [
      'copilot_issue.yml',
      'copilot_issue_comment.yml',
      'copilot_pull_request.yml',
      'copilot_pull_request_comment.yml',
    ]) {
      const file = path.join(process.cwd(), '.github/workflows', fileName);
      const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
      expect(() => assertRepositoryBugbotContextExclusions(file, workflow)).not.toThrow();
    }
  });

  it('rejects repository workflows that restore generated catalog noise', () => {
    const file = path.join(process.cwd(), '.github/workflows', 'copilot_pull_request.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    const action = workflow.jobs['copilot-pull-requests'].steps.find(
      (step: { uses?: string }) => step.uses === './',
    );
    action.with['ai-ignore-files'] = 'build/*';

    expect(() => validateWorkflow(file, workflow)).toThrow(
      'must exclude generated build and specification catalog artifacts',
    );
  });

  it('keeps every agent workflow free of Node/package-manager installation steps', () => {
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
        expect(() => assertAgentInstallationPrerequisites(file, workflow)).not.toThrow();
      }
    }

    const file = path.join(process.cwd(), 'setup/workflows/copilot_issue_comment.yml');
    const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
    workflow.jobs['copilot-issues'].steps = [{ uses: 'actions/setup-node@v7' }];
    expect(() => assertAgentInstallationPrerequisites(file, workflow)).toThrow('standalone official agent installation');
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

  it.each(['copilot_issue_comment.yml', 'copilot_pull_request_comment.yml'])(
    'requires exact-head Check permissions and a step-scoped evidence token for %s', (name) => {
      for (const directory of ['.github/workflows', 'setup/workflows']) {
        const file = path.join(process.cwd(), directory, name);
        const workflow = yaml.load(readFileSync(file, 'utf8')) as MutationWorkflow;
        const job = Object.values(workflow.jobs)[0];
        job.permissions = { contents: 'read' };
        expect(() => assertAgentWorkflowPermissions(file, workflow)).toThrow('must grant GITHUB_TOKEN exactly');
        job.permissions = { checks: 'write', contents: 'read' };
        const central = loadMutationWorkflow('.github/workflows', 'copilot_comment_runtime.yml');
        const runtime = central.workflow.jobs.copilot;
        const action = runtime.steps.find((step: any) => step.env?.COPILOT_EVIDENCE_TOKEN);
        delete action.env.COPILOT_EVIDENCE_TOKEN;
        expect(() => assertAgentWorkflowPermissions(central.file, central.workflow)).toThrow('must scope COPILOT_EVIDENCE_TOKEN');
        runtime.steps.push({ run: 'true', env: { COPILOT_EVIDENCE_TOKEN: '${{ github.token }}' } });
        expect(() => assertAgentWorkflowPermissions(central.file, central.workflow)).toThrow('must scope COPILOT_EVIDENCE_TOKEN');
      }
    },
  );
});


describe('closed issue workflow admission contract', () => {
  it('rejects a workflow that loses the native closure subscription', () => {
    const { file, workflow } = loadMutationWorkflow('.github/workflows', 'copilot_issue.yml');
    workflow.on.issues.types = workflow.on.issues.types.filter((value: string) => value !== 'closed');
    expect(() => assertQueueWorkflow(file, workflow)).toThrow('must subscribe to native closed');
  });
  it('does not permit the closed-issue bot exception on an ordinary comment workflow', () => {
    const { file, workflow } = loadMutationWorkflow('setup/workflows', 'copilot_issue_comment.yml');
    const job = Object.values(workflow.jobs)[0];
    job.if = validWorkflow.jobs['copilot-issues'].if;
    expect(() => assertQueueWorkflow(file, workflow)).toThrow('required bot actor');
  });
});
