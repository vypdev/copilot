#!/usr/bin/env node
const replacementContract = require('./deployment-replacement-contract.cjs');

const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const commentContract = require('./generate-native-verification-workflows.cjs');
const { assertCommentWorkflowCaller, assertCommentWorkflowRuntime } = require('./validate-comment-workflows.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const workflowDirectories = [
  path.join(repositoryRoot, '.github', 'workflows'),
  path.join(repositoryRoot, 'setup', 'workflows'),
];
const QUEUE_WAIT_MINUTES = 90;
const DEPLOYMENT_VALIDATION_TIMEOUT_MINUTES = 5;
const PREPARE_VERSION_TIMEOUT_MINUTES = 15;
const PREPARE_COMPILED_TIMEOUT_MINUTES = 30;
const TAG_TIMEOUT_MINUTES = 10;
const NPM_PUBLISH_TIMEOUT_MINUTES = 20;
const FINALIZE_RELEASE_TIMEOUT_MINUTES = 15;
const FAILURE_REPORT_TIMEOUT_MINUTES = 5;
const MIN_QUEUE_JOB_TIMEOUT_MINUTES = 120;
const FAILURE_REPORT_CONDITION = "${{ failure() && needs.validate.result == 'success' && inputs.mode != 'replace' }}";
const DEPLOYMENT_CONCURRENCY_GROUP = 'copilot-deployment-${{ github.repository_id }}-${{ inputs.issue }}';
const DEPLOYMENT_CONTINUATION_CONCURRENCY_GROUP = 'copilot-deployment-${{ github.repository_id }}-${{ needs.resolve-operation.outputs.issue }}';
const DISTRIBUTED_COPILOT_ACTION = 'vypdev/copilot@v3';
const CHECKOUT_ACTION = 'actions/checkout@v5';
const ISOLATED_PNPM_DEST = '${{ runner.temp }}/setup-pnpm-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}';
const QUALITY_RUNNER_BY_TRUST = '${{ fromJSON((github.event_name == \'merge_group\' || (github.event_name == \'pull_request\' && github.event.pull_request.head.repo.full_name != github.repository)) && \'["ubuntu-latest"]\' || \'["self-hosted","codex","Linux"]\') }}';
const ISOLATED_REPOWISE_VENV_NAME = 'repowise-venv-${{ github.run_id }}-${{ github.run_attempt }}-code-health';
const ISOLATED_REPOWISE_REPORT_NAME = 'repowise-report-${{ github.run_id }}-${{ github.run_attempt }}-code-health';
const CRLF_WHITESPACE = 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol';
const PUSH_BRANCH_CONCURRENCY_GROUP = 'copilot-push-${{ github.repository }}-${{ github.ref_name }}';
const PULL_REQUEST_ANALYSIS_CONCURRENCY_GROUP = 'copilot-pr-${{ github.repository }}-${{ github.event.pull_request.number }}-analysis';
const PULL_REQUEST_REVIEW_STATE_CONCURRENCY_GROUP = 'copilot-pr-${{ github.repository }}-${{ github.event.pull_request.number }}-review-state';
const BUGBOT_CONCURRENCY_JOBS = Object.freeze({
  'copilot_commit.yml': Object.freeze({
    jobId: 'copilot-commits',
    group: PUSH_BRANCH_CONCURRENCY_GROUP,
    cancelInProgress: true,
  }),
  'copilot_pull_request.yml': Object.freeze({
    jobId: 'copilot-pull-requests',
    group: PULL_REQUEST_ANALYSIS_CONCURRENCY_GROUP,
    cancelInProgress: true,
  }),
  'copilot_pull_request_review_state.yml': Object.freeze({
    jobId: 'copilot-pull-request-review-state',
    group: PULL_REQUEST_REVIEW_STATE_CONCURRENCY_GROUP,
    cancelInProgress: true,
  }),
});

function assertQueueBudget(queueWaitMinutes, minimumJobTimeoutMinutes) {
  if (!Number.isFinite(queueWaitMinutes)
    || !Number.isFinite(minimumJobTimeoutMinutes)
    || minimumJobTimeoutMinutes < queueWaitMinutes) {
    throw new Error(`minimum job timeout must be >= queue wait (${queueWaitMinutes}m).`);
  }
}
assertQueueBudget(QUEUE_WAIT_MINUTES, MIN_QUEUE_JOB_TIMEOUT_MINUTES);

const QUEUE_WORKFLOW_MANIFEST = Object.freeze([
  ['copilot_commit.yml', 'Copilot - Commit', 'copilot-commits'],
  ['copilot_branch_sync.yml', 'Copilot - Branch Sync', 'branch-sync'],
  ['copilot_issue.yml', 'Copilot - Issue', 'copilot-issues'],
  ['copilot_issue_comment.yml', 'Copilot - Issue Comment', 'copilot-issues'],
  ['copilot_pull_request.yml', 'Copilot - Pull Request', 'copilot-pull-requests'],
  ['copilot_pull_request_review_state.yml', 'Copilot - Pull Request Review State', 'copilot-pull-request-review-state'],
  ['copilot_pull_request_comment.yml', 'Copilot - Pull Request Comment', 'copilot-pull-requests'],
  ['copilot_close_inactive_issues.yml', 'Copilot - Close Inactive Issues', 'copilot-inactive-issues'],
].map(([file, workflowName, jobId]) => ({ file, workflowName, jobId })));

const MUTATION_WORKFLOW_MANIFEST = Object.freeze([
  { file: 'release_workflow.yml', workflowName: 'Task - Release' },
  { file: 'hotfix_workflow.yml', workflowName: 'Task - Hotfix' },
]);

const BOT_GATED_WORKFLOW_FILES = new Set([
  'copilot_commit.yml',
  'copilot_issue.yml',
  'copilot_issue_comment.yml',
  'copilot_pull_request.yml',
  'copilot_pull_request_review_state.yml',
  'copilot_pull_request_comment.yml',
]);
const BOT_GATE_EXPRESSION = "${{ vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN }}";
const FORK_SAFE_BOT_GATE_EXPRESSION = "${{ (vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN) && github.event.pull_request.head.repo.full_name == github.repository }}";
const BOT_PR_ANALYSIS_GATE_EXPRESSION = "${{ github.event.pull_request.head.repo.full_name == github.repository && (vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN || ((github.event.action == 'opened' || github.event.action == 'reopened' || github.event.action == 'synchronize') && github.event.pull_request.user.login == github.actor)) }}";
const FORK_GATED_WORKFLOW_FILES = new Set([
  'copilot_pull_request.yml',
  'copilot_pull_request_review_state.yml',
  'copilot_pull_request_comment.yml',
]);
const ISSUE_WORKFLOW_PROFILE_FILES = new Set([
  'copilot_issue.yml',
  'copilot_issue_comment.yml',
  'copilot_commit.yml',
  'copilot_pull_request.yml',
  'copilot_pull_request_review_state.yml',
  'copilot_pull_request_comment.yml',
  'copilot_deployment_orchestration.yml',
  'release_workflow.yml',
  'hotfix_workflow.yml',
]);
const ZERO_OBJECT_ID = '0000000000000000000000000000000000000000';
const MAJOR_ACTION_REFERENCE = /^[^/\s]+\/[^@\s]+@v[1-9]\d*$/;
const currentCopilotManifest = yaml.load(readFileSync(path.join(repositoryRoot, 'action.yml'), 'utf8'));

const BASE_AGENT_INPUTS = ['agent-provider', 'agent-model-provider', 'agent-model', 'agent-effort', 'agent-executable'];
const AGENT_ROLE_INPUTS = Object.freeze(Object.fromEntries(
  ['findings', 'fixer', 'planner', 'reviewer', 'tester'].map(role => [role, [
    `${role}-provider`, `${role}-model-provider`, `${role}-model`, `${role}-effort`, `${role}-executable`,
  ]]),
));
const WORKFLOW_AGENT_ROLES = Object.freeze({
  'copilot_comment_runtime.yml': ['findings', 'fixer', 'planner', 'reviewer', 'tester'],
  'copilot_issue.yml': ['planner'],
  'copilot_pull_request.yml': ['planner', 'reviewer'],
  'copilot_pull_request_review_state.yml': ['planner', 'reviewer'],
  'copilot_commit.yml': ['findings'],
  'copilot_issue_comment.yml': ['findings', 'fixer', 'planner', 'reviewer', 'tester'],
  'copilot_pull_request_comment.yml': ['findings', 'fixer', 'planner', 'reviewer', 'tester'],
});
const REPOSITORY_LOCALE_INPUTS = Object.freeze({
  'repository-locale': "${{ vars.REPOSITORY_LOCALE || 'en-US' }}",
  'issues-locale': "${{ vars.ISSUES_LOCALE || '' }}",
  'pull-requests-locale': "${{ vars.PULL_REQUESTS_LOCALE || '' }}",
});
const REPOSITORY_BUGBOT_CONTEXT_EXCLUSIONS = 'build/*,specs/CATALOG.md';
const REPOSITORY_BUGBOT_WORKFLOW_FILES = new Set([
  'copilot_issue.yml',
  'copilot_issue_comment.yml',
  'copilot_pull_request.yml',
  'copilot_pull_request_review_state.yml',
  'copilot_pull_request_comment.yml',
]);

function workflowFiles(directory) {
  return readdirSync(directory)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map(name => path.join(directory, name));
}

function relativeWorkflow(file) {
  return path.relative(repositoryRoot, file).replaceAll(path.sep, '/');
}

function expectedCopilotAction(relativeFile) {
  if (path.basename(relativeFile) === commentContract.RUNTIME) return commentContract.SELF_ACTION;
  if (relativeFile.startsWith('setup/workflows/')) return DISTRIBUTED_COPILOT_ACTION;
  const native = require('./generate-native-verification-workflows.cjs');
  return native.CALLBACKS.includes(path.basename(relativeFile)) ? native.SOURCE_ACTION : './';
}

function isCopilotAction(step) {
  return typeof step?.uses === 'string'
    && (step.uses === '$/' || step.uses === './' || step.uses === './../.copilot-native-runtime' || /(?:^|\/)copilot@/.test(step.uses));
}

function shouldPersistCheckoutCredentials(relativeFile, jobId) {
  const isMutationWorkflow = MUTATION_WORKFLOW_MANIFEST.some(
    entry => relativeFile.endsWith(`/${entry.file}`),
  );
  if (!isMutationWorkflow) return false;
  if (jobId === 'prepare-version-files') return true;
  return !relativeFile.startsWith('setup/workflows/') && jobId === 'prepare-compiled-files';
}

function assertMajorActionReferences(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const actionUses = [job.uses, ...(job.steps ?? []).map(step => step?.uses)]
      .filter(value => typeof value === 'string');
    for (const uses of actionUses) {
      if (isCopilotAction({ uses })) {
        const expected = expectedCopilotAction(relativeFile);
        if (uses !== expected) {
          throw new Error(`${relativeFile} job ${jobId} must invoke Copilot with ${expected}.`);
        }
        continue;
      }
      if (uses.startsWith('actions/checkout@')) {
        if (uses !== CHECKOUT_ACTION) {
          throw new Error(`${relativeFile} job ${jobId} checkout must use ${CHECKOUT_ACTION}.`);
        }
        continue;
      }
      if (uses.startsWith('./') || uses.startsWith('$/') || uses.startsWith('docker://')) continue;
      if (!MAJOR_ACTION_REFERENCE.test(uses)) {
        throw new Error(`${relativeFile} job ${jobId} action ${uses} must use a major version tag such as owner/action@v1.`);
      }
    }
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!/^actions\/checkout@/.test(step?.uses ?? '')) continue;
      const expectedPersistence = shouldPersistCheckoutCredentials(relativeFile, jobId);
      if (step.with?.['persist-credentials'] !== expectedPersistence) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} checkout must set persist-credentials: ${expectedPersistence}.`);
      }
    }
  }
}

function assertCopilotActionInputs(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!isCopilotAction(step)) continue;
      const supportedInputs = new Set(Object.keys(currentCopilotManifest.inputs ?? {}));
      const unsupported = Object.keys(step.with ?? {}).filter(input => !supportedInputs.has(input));
      if (unsupported.length > 0) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} passes inputs unsupported by ${step.uses}: ${unsupported.join(', ')}.`);
      }
    }
  }
}

function runnerLabels(value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const literal = text => typeof text === 'string' && text.length > 0 && text.length <= 100
      && text === text.trim() && !/[\p{Cc}\p{Cf}${}<>]/u.test(text);
    const labels = Array.isArray(value.labels) ? value.labels : [value.labels];
    if (Object.keys(value).some(key => !['group', 'labels'].includes(key))
      || ('group' in value && !literal(value.group))
      || labels.length < 1 || labels.length > 10 || !labels.every(literal)
      || new Set(labels.map(label => label.toLowerCase())).size !== labels.length
      || !labels.includes('self-hosted')) {
      throw new Error('runs-on object must contain only an optional literal group and 1–10 unique literal self-hosted labels.');
    }
    return labels;
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function assertIsolatedPnpm(relativeFile, jobId, job) {
  const labels = runnerLabels(job['runs-on']);
  const selfHostedCodex = labels.includes('self-hosted') && labels.includes('codex');
  const dynamicQualityRunner = relativeFile === '.github/workflows/ci_check.yml'
    && labels.includes(QUALITY_RUNNER_BY_TRUST);
  if (!selfHostedCodex && !dynamicQualityRunner) return;
  for (const step of job.steps ?? []) {
    if (typeof step?.uses === 'string' && step.uses.startsWith('pnpm/action-setup@')
      && step.with?.dest !== ISOLATED_PNPM_DEST) {
      throw new Error(`${relativeFile} job ${jobId} must isolate pnpm/action-setup by runner, run, attempt and job.`);
    }
  }
}

function assertRepoWiseTemporaryCleanup(relativeFile, job) {
  if (relativeFile !== '.github/workflows/repowise.yml') return;
  const python = (job.steps ?? []).find(step => step?.name === 'Set up Python 3.12 for RepoWise');
  const pythonCheck = (job.steps ?? []).find(step => step?.name === 'Verify isolated Python toolchain');
  const environment = (job.steps ?? []).find(step => step?.name === 'Create isolated RepoWise environment');
  const cleanup = (job.steps ?? []).find(step => step?.name === 'Remove RepoWise temporary files');
  const upload = (job.steps ?? []).find(step => step?.name === 'Upload RepoWise reports');
  if (python?.uses !== 'actions/setup-python@v7'
    || python.id !== 'python' || python.with?.['python-version'] !== '3.12'
    || pythonCheck?.env?.PYTHON_BIN !== '${{ steps.python.outputs.python-path }}'
    || !pythonCheck.run?.includes('"$PYTHON_BIN" -m ensurepip --version')
    || environment?.env?.PYTHON_BIN !== '${{ steps.python.outputs.python-path }}'
    || job.steps.indexOf(python) >= job.steps.indexOf(environment)
    || job.env?.REPOWISE_VENV_NAME !== ISOLATED_REPOWISE_VENV_NAME
    || job.env?.REPOWISE_REPORT_NAME !== ISOLATED_REPOWISE_REPORT_NAME
    || upload?.with?.path !== '${{ runner.temp }}/${{ env.REPOWISE_REPORT_NAME }}/'
    || cleanup?.if !== '${{ always() }}'
    || cleanup?.run !== 'rm -rf -- "$RUNNER_TEMP/$REPOWISE_VENV_NAME" "$RUNNER_TEMP/$REPOWISE_REPORT_NAME"'
    || job.steps.indexOf(cleanup) <= job.steps.indexOf(upload)) {
    throw new Error(`${relativeFile} must select complete Python, isolate RepoWise files, and remove them after artifact upload.`);
  }
  const reports = (job.steps ?? []).find(step => step?.name === 'Generate RepoWise reports');
  const install = (job.steps ?? []).find(step => step?.name === 'Install RepoWise');
  if (!install?.run?.includes("'repowise==0.58.0'")
    || !reports?.run?.includes('"$python_bin" scripts/repowise_reports.py --report-dir "$report_dir"')
    || !reports.run.includes('"$python_bin" -m unittest discover -s scripts/tests -p \'test_repowise*.py\' -v')
    || !reports.run.includes('trap cleanup EXIT')
    || reports.run.replace('rmdir .vscode 2>/dev/null || true', '').includes('|| true')
    || upload.if !== '${{ always() }}'
    || upload.with?.['retention-days'] !== 14) {
    throw new Error(`${relativeFile} must preserve pinned bounded reports, compatibility tests, cleanup and unconditional artifacts.`);
  }
}

function assertManualRepoWiseWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (relativeFile !== '.github/workflows/repowise.yml') return;
  if (Object.keys(workflow.on ?? {}).join(',') !== 'workflow_dispatch') {
    throw new Error(`${relativeFile} must run only through workflow_dispatch.`);
  }
  const job = workflow.jobs?.['code-health'];
  const checkout = (job?.steps ?? []).find(step => step?.uses === CHECKOUT_ACTION);
  if (job?.['timeout-minutes'] !== 40
    || JSON.stringify(workflow.permissions) !== JSON.stringify({ contents: 'read' })
    || job.permissions !== undefined
    || checkout?.with?.['fetch-depth'] !== 0
    || checkout.with?.ref !== undefined
    || workflow.concurrency?.group !== 'repowise-${{ github.ref }}'
    || workflow.concurrency?.['cancel-in-progress'] !== true) {
    throw new Error(`${relativeFile} must retain its manual job budget, read-only permissions, selected revision and per-ref concurrency.`);
  }
}

function assertPlatformCoverageAndValidators(relativeFile, job) {
  const steps = job.steps ?? [];
  const coverageStep = steps.find(step => step?.name === 'Full platform coverage and acceptance budgets');
  if (coverageStep?.run !== 'pnpm run test:coverage' || coverageStep.if !== undefined) {
    throw new Error(`${relativeFile} must retain full platform coverage and acceptance budgets.`);
  }
  const validationStep = steps.find(step => step?.name === 'Full platform documentation and contract validators');
  const requiredValidations = [
    'validate:agent-docs', 'validate:docs-page', 'validate:documentation',
    'validate:workflows', 'validate:specifications', 'validate:setup-acceptance',
  ];
  if (!validationStep?.run || requiredValidations.some(command => !validationStep.run.includes(`pnpm run ${command}`))
    || steps.indexOf(validationStep) <= steps.indexOf(coverageStep)
    || validationStep.if !== undefined) {
    throw new Error(`${relativeFile} must retain full platform documentation and contract validators after coverage.`);
  }
  if (!steps.some(step => step?.run === 'pnpm run validate:npm-package && pnpm run smoke:npm-package')
    || !steps.some(step => step?.name === 'Local setup fixtures only')
    || !steps.some(step => step?.name === 'Isolated agent runtime fixtures')
    || !steps.some(step => step?.run === 'pnpm run build')
    || !steps.some(step => step?.run === 'pnpm run typecheck')) {
    throw new Error(`${relativeFile} must retain build, typecheck, setup, agent and packaged npm fixtures on every platform.`);
  }
}

function assertWindowsJobNpm(relativeFile, job) {
  const steps = job.steps ?? [];
  const npmCheck = steps.find(step => step?.name === 'Verify Windows job Node npm CLI');
  if (npmCheck?.run !== 'node scripts/verify-windows-job-npm.cjs'
    || npmCheck.if !== "runner.os == 'Windows'"
    || steps.indexOf(npmCheck) >= steps.findIndex(step => step?.run === 'pnpm install --frozen-lockfile')) {
    throw new Error(`${relativeFile} must verify the Windows job Node npm CLI before installation.`);
  }
}

function assertPlatformHistoryCheckout(relativeFile, job) {
  const checkout = (job.steps ?? []).find(step => step?.uses === 'actions/checkout@v5');
  if (checkout?.with?.['fetch-depth'] !== 0 || checkout.with?.['persist-credentials'] !== false) {
    throw new Error(`${relativeFile} must fetch full platform-test history without persisted checkout credentials.`);
  }
}

function assertRunner(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (path.basename(file) === commentContract.RUNTIME) return assertCommentWorkflowRuntime(file, workflow);
  if (commentContract.CALLBACKS.includes(path.basename(file))) return assertCommentWorkflowCaller(file, workflow);
  if (relativeFile === '.github/workflows/setup_platform_smoke.yml') {
    const jobIds = Object.keys(workflow.jobs ?? {}).sort();
    if (JSON.stringify(jobIds) !== JSON.stringify(['setup-platform-smoke', 'setup-self-hosted-codex-smoke', 'upload-windows-coverage', 'windows-startup-probe'])) {
      throw new Error(`${relativeFile} must retain hosted and manually dispatched self-hosted platform fixture jobs and Windows coverage upload.`);
    }
    const uploadInput = workflow.on?.workflow_dispatch?.inputs?.upload_windows_coverage;
    if (uploadInput?.type !== 'boolean' || uploadInput.default !== false) {
      throw new Error(`${relativeFile} must default Windows Codecov export to disabled on manual fixture runs.`);
    }
    const probeInput = workflow.on?.workflow_dispatch?.inputs?.windows_startup_probe;
    if (probeInput?.type !== 'boolean' || probeInput.default !== false) {
      throw new Error(`${relativeFile} must default Windows startup probes to disabled.`);
    }
  }
  if (relativeFile === '.github/workflows/copilot_runner_diagnostics.yml'
    && JSON.stringify(Object.keys(workflow.jobs ?? {})) !== JSON.stringify(['linux'])) {
    throw new Error(`${relativeFile} must retain only the supported Linux Codex diagnostic job.`);
  }
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (Object.values(job.env ?? {}).some(value => typeof value === 'string' && /\$\{\{\s*runner\./u.test(value))) {
      throw new Error(`${relativeFile} job ${jobId} cannot use runner context in job-level env.`);
    }
    if (relativeFile === '.github/workflows/setup_platform_smoke.yml') {
      if (jobId === 'windows-startup-probe') {
        const steps = job.steps ?? [];
        if (job['runs-on'] !== 'windows-latest' || job['timeout-minutes'] !== 5
          || job.if !== "${{ github.event_name == 'workflow_dispatch' && inputs.windows_startup_probe == true }}"
          || job.needs || steps.length !== 3
          || steps[0]?.uses !== 'actions/checkout@v5' || steps[0]?.with?.['persist-credentials'] !== false
          || steps[1]?.uses !== 'actions/setup-node@v7' || steps[1]?.with?.['node-version'] !== '24.x'
          || steps[2]?.run !== 'node scripts/diagnose-windows-powershell-startup.cjs') {
          throw new Error(`${relativeFile} must retain its bounded manual hosted Windows startup diagnostic without credentials or export.`);
        }
        continue;
      }
      if (jobId === 'upload-windows-coverage') {
        const steps = job.steps ?? [];
        const checkout = steps[0];
        const download = steps[1];
        const upload = steps[2];
        if (job['runs-on'] !== 'ubuntu-latest' || job.needs !== 'setup-platform-smoke'
          || job.if !== "${{ github.event_name == 'workflow_dispatch' && inputs.upload_windows_coverage == true }}"
          || steps.length !== 3
          || checkout?.uses !== 'actions/checkout@v5'
          || checkout.with?.['persist-credentials'] !== false || checkout.with?.['fetch-depth'] !== 0
          || download?.uses !== 'actions/download-artifact@v4'
          || download.with?.name !== 'hosted-windows-lcov' || download.with?.path !== 'coverage-windows'
          || upload?.uses !== 'codecov/codecov-action@v6'
          || upload.with?.files !== './coverage-windows/lcov.info'
          || upload.with?.disable_search !== true || upload.with?.fail_ci_if_error !== true
          || upload.with?.flags !== 'windows' || upload.with?.token !== '${{ secrets.CODECOV_TOKEN }}') {
          throw new Error(`${relativeFile} must upload hosted Windows coverage from a dependent Ubuntu job only after explicit manual opt-in.`);
        }
        continue;
      }
      if (jobId === 'setup-platform-smoke') {
        const platforms = job.strategy?.matrix?.os;
        if (job.if !== "${{ github.event_name == 'pull_request' || (github.event_name == 'workflow_dispatch' && (inputs.windows_startup_probe != true || inputs.upload_windows_coverage == true)) }}"
          || job['runs-on'] !== '${{ matrix.os }}'
          || JSON.stringify(platforms) !== JSON.stringify(['ubuntu-latest', 'windows-latest', 'macos-latest'])) {
          throw new Error(`${relativeFile} must use the PR or ordinary manual Ubuntu, Windows and macOS setup fixture matrix, independently of coverage export.`);
        }
        assertPlatformCoverageAndValidators(relativeFile, job);
        const hostedCoverage = (job.steps ?? []).find(step => step?.name === 'Full platform coverage and acceptance budgets');
        if (hostedCoverage?.env?.COPILOT_JEST_WINDOWS_SERVICE_COVERAGE !== undefined) {
          throw new Error(`${relativeFile} must not recycle hosted Windows Jest workers at the service-runner limit.`);
        }
        assertWindowsJobNpm(relativeFile, job);
        assertPlatformHistoryCheckout(relativeFile, job);
        const artifact = (job.steps ?? []).find(step => step?.name === 'Preserve hosted Windows coverage');
        if (artifact?.uses !== 'actions/upload-artifact@v4'
          || artifact.if !== "runner.os == 'Windows'"
          || artifact.with?.name !== 'hosted-windows-lcov'
          || artifact.with?.path !== 'coverage/lcov.info'
          || artifact.with?.['if-no-files-found'] !== 'error'
          || artifact.with?.['retention-days'] !== 1
          || (job.steps ?? []).indexOf(artifact) <= (job.steps ?? []).findIndex(step => step?.name === 'Full platform coverage and acceptance budgets')) {
          throw new Error(`${relativeFile} must preserve hosted Windows coverage for dependent upload.`);
        }
      } else {
        const expectedMatrix = [
          { platform: 'macOS', labels: ['self-hosted', 'codex', 'macOS'] },
          { platform: 'Ubuntu', labels: ['self-hosted', 'codex', 'Linux'] },
        ];
        if (job['runs-on'] !== '${{ matrix.labels }}'
          || job.name !== 'Setup package and local session (self-hosted ${{ matrix.platform }} codex)'
          || ![expectedMatrix, [expectedMatrix[1]]].some(matrix =>
            JSON.stringify(job.strategy?.matrix?.include) === JSON.stringify(matrix))
          || job.strategy?.['fail-fast'] !== false) {
          throw new Error(`${relativeFile} must target self-hosted macOS and Ubuntu codex runners or the authorized temporary Ubuntu-only selection; Windows services are unsupported.`);
        }
        if (job.if !== "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/master' && inputs.windows_startup_probe != true }}") {
          throw new Error(`${relativeFile} must reserve self-hosted codex runners for manual dispatch from protected master.`);
        }
        const steps = job.steps ?? [];
        if (!steps.some(step => step?.name === 'Verify Ubuntu distribution'
          && step.if === "runner.os == 'Linux'" && step.run === '. /etc/os-release && test "$ID" = ubuntu')) {
          throw new Error(`${relativeFile} must verify Ubuntu on self-hosted Codex runners.`);
        }
        const pnpmSetup = steps.find(step => typeof step?.uses === 'string' && step.uses.startsWith('pnpm/action-setup@'));
        if (pnpmSetup?.with?.dest !== ISOLATED_PNPM_DEST) {
          throw new Error(`${relativeFile} must isolate self-hosted pnpm installation by job.`);
        }
        const nodeSetup = steps.find(step => typeof step?.uses === 'string' && step.uses.startsWith('actions/setup-node@'));
        if (nodeSetup?.with?.cache !== undefined || nodeSetup?.with?.['package-manager-cache'] !== false) {
          throw new Error(`${relativeFile} must disable dependency-cache backup on persistent self-hosted smoke runners.`);
        }
        assertPlatformCoverageAndValidators(relativeFile, job);
        const serviceCoverage = steps.find(step => step?.name === 'Full platform coverage and acceptance budgets');
        if (serviceCoverage?.env?.COPILOT_JEST_WINDOWS_SERVICE_COVERAGE !== undefined) {
          throw new Error(`${relativeFile} must not apply Windows service-runner settings to supported Codex fixtures.`);
        }
        assertPlatformHistoryCheckout(relativeFile, job);
        const guidanceStep = steps.find(step => step?.name === 'Validate generated guidance checkout on codex runner');
        if (!guidanceStep?.run?.includes('pnpm run validate:agent-docs')
          || !guidanceStep.run.includes('git ls-files --eol')) {
          throw new Error(`${relativeFile} must verify generated guidance at self-hosted checkout.`);
        }
      }
      assertIsolatedPnpm(relativeFile, jobId, job);
      const validationStep = (job.steps ?? []).find(step => step?.name === 'Full platform documentation and contract validators');
      if (!validationStep?.run?.includes(`git -c ${CRLF_WHITESPACE} diff --check -- . ':(exclude)build/**'`)) {
        throw new Error(`${relativeFile} must retain default whitespace checks alongside CRLF support.`);
      }
      continue;
    }
    let expected = ['self-hosted', 'codex'];
    if ((path.basename(file) === 'copilot_issue.yml' && jobId === 'issue-admission')
      || relativeFile.startsWith('setup/workflows/')
      || relativeFile === '.github/workflows/copilot_credential_health.yml'
      || (/^\.github\/workflows\/(?:release|hotfix)_workflow\.yml$/.test(relativeFile) && jobId === 'publish-npm')) {
      expected = ['ubuntu-latest'];
    } else if (relativeFile === '.github/workflows/copilot_pull_request_approval.yml') {
      expected = ['self-hosted', 'codex', 'Linux'];
    } else if (relativeFile === '.github/workflows/copilot_runner_diagnostics.yml') {
      if (jobId !== 'linux') throw new Error(`${relativeFile} contains an unsupported Codex diagnostic job.`);
      expected = ['self-hosted', 'codex', 'Linux'];
    } else if (relativeFile === '.github/workflows/repowise.yml') {
      expected = ['self-hosted', 'codex', 'Linux'];
    } else if (relativeFile === '.github/workflows/ci_check.yml') {
      expected = [QUALITY_RUNNER_BY_TRUST];
    }
    if (jobId === 'candidate-preflight' && MUTATION_WORKFLOW_MANIFEST.some(entry => relativeFile.endsWith(`/${entry.file}`))) expected = ['ubuntu-latest'];
    const labels = runnerLabels(job['runs-on']);
    const linuxOnly = JSON.stringify(expected) === JSON.stringify(['self-hosted', 'codex'])
      && JSON.stringify(labels) === JSON.stringify(['self-hosted', 'codex', 'Linux']);
    if (JSON.stringify(labels) !== JSON.stringify(expected) && !linuxOnly) {
      throw new Error(`${relativeFile} job ${jobId} must use runs-on ${expected.join(', ')}.`);
    }
    assertIsolatedPnpm(relativeFile, jobId, job);
    assertRepoWiseTemporaryCleanup(relativeFile, job);
    if (relativeFile === '.github/workflows/ci_check.yml'
      || relativeFile === '.github/workflows/repowise.yml') {
      const ubuntuCheck = (job.steps ?? []).find(step => step?.name === 'Verify Ubuntu runner');
      if (ubuntuCheck?.run !== '. /etc/os-release && test "$ID" = ubuntu') {
        throw new Error(`${relativeFile} must verify Ubuntu on the selected runner.`);
      }
    }
    if (relativeFile === '.github/workflows/ci_check.yml') {
      const checkout = (job.steps ?? []).find(step => step?.uses === 'actions/checkout@v5');
      if (checkout?.with?.['fetch-depth'] !== 0 || checkout.with?.['persist-credentials'] !== false) {
        throw new Error(`${relativeFile} must fetch full history without stored checkout credentials for the event-base diff check.`);
      }
      const diffStep = (job.steps ?? []).find(step => step?.name === 'Validate Git diff');
      if (!diffStep?.run?.includes(`git -c ${CRLF_WHITESPACE} diff --check "$base" HEAD -- . ':(exclude)build/**'`)) {
        throw new Error(`${relativeFile} must retain default whitespace checks alongside CRLF support.`);
      }
    }
  }
}

function assertAgentInputs(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const roles = WORKFLOW_AGENT_ROLES[path.basename(file)];
  if (!roles) return;
  const requiredAgentInputs = [
    ...BASE_AGENT_INPUTS,
    ...roles.flatMap(role => AGENT_ROLE_INPUTS[role]),
  ];
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!isCopilotAction(step)) continue;
      const missing = requiredAgentInputs.filter(input => !(input in (step.with ?? {})));
      if (missing.length > 0) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} is missing agent inputs: ${missing.join(', ')}.`);
      }
    }
  }
}

function assertRepositoryLocaleInputs(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!WORKFLOW_AGENT_ROLES[path.basename(file)]) return;
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!isCopilotAction(step)) continue;
      const invalid = Object.entries(REPOSITORY_LOCALE_INPUTS)
        .filter(([input, value]) => step.with?.[input] !== value)
        .map(([input]) => input);
      if (invalid.length > 0) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} must pass the repository locale and inheriting empty scope overrides exactly; invalid: ${invalid.join(', ')}.`);
      }
    }
  }
}

function assertRepositoryBugbotContextExclusions(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!relativeFile.startsWith('.github/workflows/')
    || !REPOSITORY_BUGBOT_WORKFLOW_FILES.has(path.basename(file))) return;
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (!isCopilotAction(step)) continue;
      if (step.with?.['ai-ignore-files'] !== REPOSITORY_BUGBOT_CONTEXT_EXCLUSIONS) {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} must exclude generated build and specification catalog artifacts from Bugbot context exactly.`);
      }
    }
  }
}

function assertAgentInstallationPrerequisites(file, workflow) {
  const manifestFile = path.basename(file);
  if (!WORKFLOW_AGENT_ROLES[manifestFile] && manifestFile !== 'agent-cli-provisioning.yml') return;
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const steps = job.steps ?? [];
    for (const step of steps) {
      const repositoryVerificationStep = ['.github/workflows/copilot_issue_comment.yml', '.github/workflows/copilot_pull_request_comment.yml', '.github/workflows/copilot_comment_runtime.yml'].includes(relativeFile)
        && step.if === "env.COPILOT_PREPARE_VERIFICATION == 'true'"
        && ((step.name === 'Prepare repository Node' && step.uses === 'actions/setup-node@v7' && step.with?.['node-version'] === '24.x')
          || (step.name === 'Prepare repository pnpm' && step.uses === 'pnpm/action-setup@v5' && step.with?.version === '10.12.4')
          || (step.name === 'Seed trusted source build tools' && step.run === 'pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile --config.manage-package-manager-versions=false --prod=false'));
      if (repositoryVerificationStep) continue;
      if (/^(?:actions\/setup-node|pnpm\/action-setup)@/u.test(String(step?.uses ?? ''))
        || /\b(?:npm|pnpm|npx)\s+(?:install|add|ci|i)\b/u.test(String(step?.run ?? ''))
        || Object.hasOwn(step?.env ?? {}, 'AGENT_PROVISIONING')) {
        throw new Error(`${relativeFile} job ${jobId} must use standalone official agent installation without Node/package-manager setup.`);
      }
    }
  }
}

function assertNoJobLevelSecrets(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const exposed = Object.entries(job.env ?? {})
      .filter(([, value]) => String(value).includes('secrets.'))
      .map(([name]) => name);
    if (exposed.length > 0) {
      throw new Error(`${relativeFile} job ${jobId} must scope Secrets to the exact step that consumes them: ${exposed.join(', ')}.`);
    }
  }
}

function assertAgentWorkflowPermissions(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!WORKFLOW_AGENT_ROLES[path.basename(file)]) return;
  const nativeEvidenceWorkflow = ['copilot_commit.yml', 'copilot_pull_request.yml', 'copilot_pull_request_review_state.yml',
    'copilot_issue_comment.yml', 'copilot_pull_request_comment.yml', 'copilot_comment_runtime.yml'].includes(path.basename(file));
  const ordinaryPermissions = nativeEvidenceWorkflow
    ? { checks: 'write', contents: 'read' }
    : { contents: 'read' };
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const expectedPermissions = path.basename(file) === 'copilot_issue.yml' && jobId === 'issue-admission'
      ? { actions: 'read', contents: 'read' } : ordinaryPermissions;
    const permissions = job.permissions ?? {};
    const permissionKeys = Object.keys(permissions).sort();
    const expectedKeys = Object.keys(expectedPermissions).sort();
    if (permissionKeys.length !== expectedKeys.length
      || permissionKeys.some((key, index) => key !== expectedKeys[index])
      || expectedKeys.some(key => permissions[key] !== expectedPermissions[key])) {
      throw new Error(`${relativeFile} job ${jobId} must grant GITHUB_TOKEN exactly ${expectedKeys.map(key => `${key}: ${expectedPermissions[key]}`).join(', ')}; mutations use the explicit PAT.`);
    }
    if (commentContract.CALLBACKS.includes(path.basename(file)) && job.uses) {
      assertCommentWorkflowCaller(file, workflow);
      continue;
    }
    if (nativeEvidenceWorkflow && !(job.steps ?? []).some(step =>
      isCopilotAction(step) && step?.env?.COPILOT_EVIDENCE_TOKEN === '${{ github.token }}')) {
      throw new Error(`${relativeFile} job ${jobId} must scope COPILOT_EVIDENCE_TOKEN to the Action step for exact-head native Checks.`);
    }
  }
}

function assertLightweightBranchSyncWorkflow(file, workflow) {
  if (path.basename(file) !== 'copilot_branch_sync.yml') return;
  const relativeFile = relativeWorkflow(file);
  const branches = workflow.on?.push?.branches;
  if (JSON.stringify(branches) !== JSON.stringify(['**', '!copilot-permission-test-*'])) {
    throw new Error(`${relativeFile} must observe pushes on every ordinary branch exactly once and exclude temporary permission-probe branches.`);
  }
  const job = workflow.jobs?.['branch-sync'];
  if (!job || Object.keys(workflow.jobs ?? {}).length !== 1 || job.if !== undefined) {
    throw new Error(`${relativeFile} must have one ungated branch-sync job so bot pushes can propagate.`);
  }
  if (job.env !== undefined) {
    throw new Error(`${relativeFile} branch-sync must not define an agent environment.`);
  }
  const permissions = job.permissions ?? {};
  if (Object.keys(permissions).join(',') !== 'contents' || permissions.contents !== 'read') {
    throw new Error(`${relativeFile} branch-sync must grant only contents: read to GITHUB_TOKEN.`);
  }
  const actionSteps = (job.steps ?? []).filter(isCopilotAction);
  const inputs = actionSteps[0]?.with ?? {};
  if (actionSteps.length !== 1
    || inputs['single-action'] !== 'check_branch_sync_action'
    || inputs.token !== '${{ secrets.PAT }}'
    || Object.keys(inputs).some(key => key !== 'single-action' && key !== 'token')) {
    throw new Error(`${relativeFile} must invoke only the lightweight branch-sync single action and PAT input.`);
  }
  if (/\b(AGENT_|CODEX_|OPENCODE_|CURSOR_|API_KEY|findings-|fixer-|planner-|reviewer-|tester-)/i.test(JSON.stringify(job))) {
    throw new Error(`${relativeFile} branch-sync must not expose agent configuration or provider credentials.`);
  }
}

function needsFor(job) {
  if (job?.needs === undefined) return [];
  return (Array.isArray(job.needs) ? job.needs : [job.needs]).map(String);
}

function assertNoUnsafeCondition(relativeFile, jobId, job) {
  if (typeof job.if === 'string' && /\b(always|failure|cancelled)\s*\(/i.test(
    MUTATION_WORKFLOW_MANIFEST.some(entry => relativeFile.endsWith(`/${entry.file}`))
      && ['prepare-version-files', 'prepare-compiled-files', 'promote'].includes(jobId)
      ? job.if.replace('!cancelled()', '') : job.if)) {
    throw new Error(`${relativeFile} job ${jobId} has a bypass-capable if condition.`);
  }
  for (const [stepIndex, step] of (job.steps ?? []).entries()) {
    if (typeof step.if === 'string' && /\b(always|failure|cancelled)\s*\(/i.test(step.if)) {
      throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} has a bypass-capable if condition.`);
    }
  }
}

function assertNoConcurrency(relativeFile, workflow) {
  if (workflow.concurrency !== undefined) {
    throw new Error(`${relativeFile} must not define GitHub concurrency.`);
  }
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (job.concurrency !== undefined) {
      throw new Error(`${relativeFile} job ${jobId} must not define GitHub concurrency.`);
    }
  }
}

function assertReviewConcurrency(relativeFile, workflow) {
  if (path.basename(relativeFile) === 'copilot_issue.yml') {
    if (workflow.concurrency?.group !== 'copilot-issue-${{ github.repository }}-${{ github.event.issue.number }}'
      || workflow.concurrency?.['cancel-in-progress'] !== false || workflow.concurrency?.queue !== 'max'
      || Object.values(workflow.jobs ?? {}).some(job => job.concurrency !== undefined)) {
      throw new Error(`${relativeFile} must retain every pending issue event without canceling active work.`);
    }
    return;
  }
  const contract = BUGBOT_CONCURRENCY_JOBS[path.basename(relativeFile)];
  if (!contract) {
    assertNoConcurrency(relativeFile, workflow);
    return;
  }
  const { jobId: targetJobId, group, cancelInProgress } = contract;
  if (workflow.concurrency !== undefined) {
    throw new Error(`${relativeFile} must scope Bugbot branch concurrency to job ${targetJobId}.`);
  }
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (jobId !== targetJobId) {
      if (job.concurrency !== undefined) {
        throw new Error(`${relativeFile} job ${jobId} must not define GitHub concurrency.`);
      }
      continue;
    }
    if (job.concurrency?.group !== group
      || job.concurrency?.['cancel-in-progress'] !== cancelInProgress) {
      throw new Error(`${relativeFile} job ${jobId} must use its workflow- and event-specific group (PR number for pull requests), avoid cross-canceling another event owner, and cancel superseded runs within its lane.`);
    }
  }
}

function assertDirectEventTriggers(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const triggers = workflow.on ?? {};
  if (relativeFile.endsWith('/copilot_pull_request_approval.yml')) return;
  if (triggers && typeof triggers === 'object' && Object.prototype.hasOwnProperty.call(triggers, 'workflow_run')) {
    throw new Error(`${relativeFile} must use direct event triggers and must not define workflow_run.`);
  }
  if (relativeFile.endsWith('/copilot_pull_request.yml')) {
    if (!triggers.pull_request || triggers.pull_request_review) {
      throw new Error(`${relativeFile} must define only direct pull_request code/lifecycle triggers.`);
    }
    const pullRequestTypes = triggers.pull_request.types;
    if (!Array.isArray(pullRequestTypes)
      || pullRequestTypes.includes('edited')
      || ['opened', 'reopened', 'closed', 'synchronize', 'ready_for_review'].some(type => !pullRequestTypes.includes(type))) {
      throw new Error(`${relativeFile} must handle code/lifecycle PR events without subscribing to metadata-only edited events.`);
    }
    if (triggers.merge_group || workflow.jobs?.['copilot-merge-group']) {
      throw new Error(`${relativeFile} must keep merge-group compatibility in the dedicated pull-request merge-queue workflow so normal PR runs do not show a skipped duplicate check.`);
    }
    if (workflow.jobs?.['copilot-pull-requests']?.name !== 'Copilot - Pull Request') {
      throw new Error(`${relativeFile} must preserve the exact normal PR analysis check identity.`);
    }
  } else if (relativeFile.endsWith('/copilot_pull_request_review_state.yml')) {
    const reviewTypes = triggers.pull_request_review?.types;
    if (triggers.pull_request
      || !Array.isArray(reviewTypes)
      || ['submitted', 'edited', 'dismissed'].some(type => !reviewTypes.includes(type))) {
      throw new Error(`${relativeFile} must define only direct pull_request_review state triggers.`);
    }
    if (workflow.name !== 'Copilot - Pull Request Review State'
      || workflow.jobs?.['copilot-pull-request-review-state']?.name !== 'Copilot - Pull Request Review State') {
      throw new Error(`${relativeFile} must preserve the exact review-state workflow and check identity.`);
    }
  } else {
    return;
  }
  if (typeof workflow['run-name'] !== 'string'
    || !workflow['run-name'].includes('github.event_name')
    || !workflow['run-name'].includes('github.event.action')) {
    throw new Error(`${relativeFile} must expose the event kind and action in its run identity.`);
  }
}

function assertApprovalObserverWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!relativeFile.endsWith('/copilot_pull_request_approval.yml')) return;
  const sourceRepositoryWorkflow = relativeFile.startsWith('.github/');
  const triggers = workflow.on ?? {};
  if (Object.keys(triggers).sort().join(',') !== 'workflow_dispatch,workflow_run'
    || JSON.stringify(triggers.workflow_run?.types) !== JSON.stringify(['completed'])
    || (sourceRepositoryWorkflow
      ? JSON.stringify(triggers.workflow_run?.workflows) !== JSON.stringify(['Copilot - Pull Request', 'CI Check'])
      : triggers.workflow_run?.workflows !== '__PR_APPROVAL_WORKFLOW_NAMES__')
    || triggers.workflow_dispatch?.inputs?.pr?.required !== true
    || Object.keys(workflow.jobs ?? {}).join(',') !== 'observe-approval') {
    throw new Error(`${relativeFile} must use only exact completed workflow_run producers and an explicit manual PR number.`);
  }
  const job = workflow.jobs['observe-approval'];
  const permissions = job.permissions ?? {};
  const observerStep = sourceRepositoryWorkflow ? job.steps?.[1] : job.steps?.[0];
  const trustedSourceCheckout = sourceRepositoryWorkflow
    && job.steps?.length === 2
    && job.steps[0]?.uses === CHECKOUT_ACTION
    && job.steps[0]?.with?.ref === '${{ github.sha }}'
    && job.steps[0]?.with?.['persist-credentials'] === false
    && observerStep?.uses === './';
  if (JSON.stringify(permissions) !== JSON.stringify({ actions: 'read', checks: 'write', contents: 'read', 'pull-requests': 'read' })
    || job.concurrency?.group !== 'copilot-approval-${{ github.repository }}'
    || job.concurrency?.['cancel-in-progress'] !== false
    || (sourceRepositoryWorkflow ? !trustedSourceCheckout
      : job.steps?.length !== 1 || observerStep?.uses !== DISTRIBUTED_COPILOT_ACTION)
    || observerStep?.with?.['pr-approval-observer'] !== 'true'
    || observerStep?.with?.token !== '${{ secrets.PAT }}'
    || observerStep?.with?.['pr-approval-policy'] !== "${{ vars.PR_APPROVAL_POLICY || '' }}"
    || observerStep?.env?.COPILOT_APPROVAL_CHECK_TOKEN !== '${{ github.token }}'
    || /actions\/cache|\brun\s*:/u.test(JSON.stringify(job))) {
    throw new Error(`${relativeFile} must keep the privileged observer isolated from PR-head code and use narrow permissions.`);
  }
}

function assertPullRequestMergeQueueWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!relativeFile.endsWith('/copilot_pull_request_merge_queue.yml')) return;
  const triggers = workflow.on ?? {};
  const job = workflow.jobs?.['copilot-pull-request-required-check'];
  if (workflow.name !== 'Copilot - Pull Request Merge Queue'
    || triggers.pull_request
    || triggers.pull_request_review
    || !Array.isArray(triggers.merge_group?.types)
    || !triggers.merge_group.types.includes('checks_requested')) {
    throw new Error(`${relativeFile} must support merge_group checks_requested in a dedicated workflow.`);
  }
  if (typeof workflow['run-name'] !== 'string'
    || !workflow['run-name'].includes('github.event_name')
    || !workflow['run-name'].includes('github.event.action')) {
    throw new Error(`${relativeFile} must expose the merge-group event and action in its run identity.`);
  }
  if (!job || job.name !== 'Copilot - Pull Request') {
    throw new Error(`${relativeFile} must preserve the Copilot - Pull Request required-check identity for merge-group runs.`);
  }
  if (Object.keys(workflow.jobs ?? {}).length !== 1
    || job['timeout-minutes'] !== 10
    || job.permissions?.checks !== 'write'
    || job.permissions?.contents !== 'read'
    || (job.steps ?? []).length !== 1
    || job.steps[0]?.name !== 'Confirm merge-group compatibility'
    || typeof job.steps[0]?.run !== 'string'
    || (job.steps ?? []).some(isCopilotAction)) {
    throw new Error(`${relativeFile} must remain a single lightweight, least-privilege merge-group check.`);
  }
}

function assertExactNeeds(relativeFile, jobId, job, expected) {
  const actual = needsFor(job);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${relativeFile} job ${jobId} must need exactly ${expected.join(', ') || 'no jobs'}.`);
  }
}

function assertExactTimeout(relativeFile, jobId, job, expected) {
  if (job?.['timeout-minutes'] !== expected) {
    throw new Error(`${relativeFile} job ${jobId} must have timeout-minutes ${expected}.`);
  }
}

function assertTagPermissions(relativeFile, job) {
  const permissions = job?.permissions ?? {};
  const permissionKeys = Object.keys(permissions).sort();
  if (permissionKeys.length !== 1 || permissionKeys[0] !== 'contents' || permissions.contents !== 'read') {
    throw new Error(`${relativeFile} tag must have only contents: read permissions.`);
  }
}

function assertNpmPublishJob(relativeFile, job) {
  if (!job) throw new Error(`${relativeFile} must define publish-npm.`);
  assertExactTimeout(relativeFile, 'publish-npm', job, NPM_PUBLISH_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, 'publish-npm', job, ['tag']);
  if (job.if !== "${{ inputs.mode == 'publish' }}") {
    throw new Error(`${relativeFile} publish-npm must run only in publish mode.`);
  }
  if (job.environment !== 'npm') {
    throw new Error(`${relativeFile} publish-npm must use the npm environment.`);
  }

  const permissions = job.permissions ?? {};
  const permissionKeys = Object.keys(permissions).sort();
  if (permissionKeys.join(',') !== 'contents,id-token'
    || permissions.contents !== 'read'
    || permissions['id-token'] !== 'write') {
    throw new Error(`${relativeFile} publish-npm must grant only contents: read and id-token: write permissions.`);
  }

  const steps = job.steps ?? [];
  const checkout = steps.find(step => step?.uses === CHECKOUT_ACTION);
  const setupNode = steps.find(step => step?.uses === 'actions/setup-node@v7');
  const install = steps.find(step => step?.run === 'pnpm install --frozen-lockfile');
  const validation = steps.find(step => step?.name === 'Validate immutable package');
  const publish = steps.find(step => step?.run === 'npm publish --access public');
  const availability = steps.find(step => step?.name === 'Wait for npm registry visibility');
  const identity = steps.find(step => step?.name === 'Verify published package identity');
  const detection = steps.find(step => step?.name === 'Detect an existing publication');
  const visibilityScript = String(availability?.with?.script ?? '');
  if (checkout?.with?.ref !== 'v${{ inputs.version }}'
    || checkout.with?.['fetch-depth'] !== 1
    || setupNode?.with?.['node-version'] !== '24.x'
    || setupNode.with?.['registry-url'] !== 'https://registry.npmjs.org'
    || setupNode.with?.['package-manager-cache'] !== false
    || !install
    || validation?.env?.RELEASE_VERSION !== '${{ inputs.version }}'
    || !String(validation?.run ?? '').includes('pnpm run validate:npm-package')
    || !String(validation?.run ?? '').includes('pnpm run smoke:npm-package')
    || !publish
    || publish.if !== "${{ steps.registry.outputs.publish == 'true' }}"
    || !String(detection?.run ?? '').includes('npm view "$PACKAGE_NAME@$RELEASE_VERSION" version')
    || availability?.env?.PACKAGE_NAME !== '@vypdev/copilot'
    || availability.env?.RELEASE_VERSION !== '${{ inputs.version }}'
    || availability?.uses !== 'actions/github-script@v9'
    || Object.keys(availability.with ?? {}).join(',') !== 'script'
    || availability.run !== undefined
    || availability.env?.POLL_INTERVAL !== "${{ vars.NPM_VISIBILITY_POLL_INTERVAL_SECONDS || '20' }}"
    || availability.env?.POLL_TIMEOUT !== "${{ vars.NPM_VISIBILITY_TIMEOUT_SECONDS || '600' }}"
    || !visibilityScript.includes("spawnSync('npm'")
    || !visibilityScript.includes('timeout: remaining')
    || !visibilityScript.includes("killSignal: 'SIGKILL'")
    || !visibilityScript.includes('completedAt > deadline')
    || !visibilityScript.includes('Math.min(interval, timeLeft)')
    || identity?.env?.PACKAGE_NAME !== '@vypdev/copilot'
    || identity.env?.RELEASE_VERSION !== '${{ inputs.version }}'
    || !String(identity.run ?? '').includes('npm view "$PACKAGE_NAME@$RELEASE_VERSION" gitHead')
    || !String(identity.run ?? '').includes('git rev-parse HEAD')
    || !String(identity.run ?? '').includes('"$registry_git_head" = "$local_git_head"')) {
    throw new Error(`${relativeFile} publish-npm must install, validate, and publish the exact release tag.`);
  }
  if (JSON.stringify(job).includes('NPM_TOKEN') || JSON.stringify(job).includes('NODE_AUTH_TOKEN')) {
    throw new Error(`${relativeFile} publish-npm must authenticate only through OIDC.`);
  }
}

function assertFinalizeReleaseJob(relativeFile, job) {
  if (!job) throw new Error(`${relativeFile} must define finalize-release.`);
  assertExactTimeout(relativeFile, 'finalize-release', job, FINALIZE_RELEASE_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, 'finalize-release', job, ['publish-npm']);
  const permissions = job.permissions ?? {};
  if (Object.keys(permissions).join(',') !== 'contents,issues,pull-requests'
    || permissions.contents !== 'write'
    || permissions.issues !== 'write'
    || permissions['pull-requests'] !== 'write') {
    throw new Error(`${relativeFile} finalize-release must have only contents, issues, and pull-requests write permissions.`);
  }
  const actions = (job.steps ?? [])
    .filter(isCopilotAction)
    .map(step => step.with?.['single-action']);
  if (actions.join(',') !== 'create_release,publish_github_action,published_deployment_action') {
    throw new Error(`${relativeFile} finalize-release must create the release, publish the action, and start reconciliation in order.`);
  }
}

function assertTransitiveValidationAncestry(file, workflow, validationJobId, allowedFailureJobs = new Set()) {
  const relativeFile = relativeWorkflow(file);
  const jobs = workflow.jobs ?? {};
  const ancestry = new Map();
  const visiting = new Set();
  const reachesGate = (jobId) => {
    if (jobId === validationJobId) return true;
    if (ancestry.has(jobId)) return ancestry.get(jobId);
    if (visiting.has(jobId)) throw new Error(`${relativeFile} has a cycle in job needs.`);
    const job = jobs[jobId];
    if (!job) throw new Error(`${relativeFile} references missing job ${jobId}.`);
    visiting.add(jobId);
    const result = needsFor(job).some(parent => reachesGate(parent));
    visiting.delete(jobId);
    ancestry.set(jobId, result);
    return result;
  };

  for (const [jobId, job] of Object.entries(jobs)) {
    if (!allowedFailureJobs.has(jobId)) assertNoUnsafeCondition(relativeFile, jobId, job);
    if (jobId !== validationJobId && !reachesGate(jobId)) {
      throw new Error(`${relativeFile} job ${jobId} is not a transitive descendant of ${validationJobId}.`);
    }
  }
}

function assertFailureReportingJob(relativeFile, job, expectedNeeds, expectedKind) {
  if (!job) throw new Error(`${relativeFile} must define report-failure.`);
  assertExactTimeout(relativeFile, 'report-failure', job, FAILURE_REPORT_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, 'report-failure', job, expectedNeeds);
  if (job.if !== FAILURE_REPORT_CONDITION) {
    throw new Error(`${relativeFile} report-failure must run only for a failed deployment with a launcher issue.`);
  }

  const permissions = job.permissions ?? {};
  const permissionKeys = Object.keys(permissions).sort();
  const setup = relativeFile.startsWith('setup/workflows/');
  const expectedPermissions = setup
    ? { issues: 'write' }
    : { contents: 'read', issues: 'write' };
  if (permissionKeys.join(',') !== Object.keys(expectedPermissions).sort().join(',')
    || Object.entries(expectedPermissions).some(([key, value]) => permissions[key] !== value)) {
    throw new Error(`${relativeFile} report-failure must use its exact least-privilege permissions.`);
  }
  if (job.env !== undefined || Object.prototype.hasOwnProperty.call(job, 'continue-on-error')) {
    throw new Error(`${relativeFile} report-failure must not define job-level secrets or bypasses.`);
  }

  const steps = job.steps ?? [];
  if (setup) {
    assertSetupFailureReporter(relativeFile, steps, expectedKind);
  } else {
    assertActiveFailureReporter(relativeFile, steps, expectedKind);
  }
}

function assertActiveFailureReporter(relativeFile, steps, expectedKind) {
  if (steps.length !== 3
    || steps[0]?.uses !== CHECKOUT_ACTION
    || steps[0]?.with?.['persist-credentials'] !== false
    || steps[1]?.uses !== './'
    || steps[2]?.uses !== './') {
    throw new Error(`${relativeFile} report-failure must checkout safely and invoke the local Copilot action.`);
  }
  assertDurableFailureReporter(relativeFile, steps[1]);
  const inputs = steps[2].with ?? {};
  const expectedTitle = expectedKind === 'release' ? 'Release' : 'Hotfix';
  const expectedToken = '${{ secrets.PAT }}';
  if (steps[2].if !== "${{ inputs.mode == 'prepare' }}"
    || inputs['single-action'] !== 'publish_issue_comment'
    || inputs['single-action-issue'] !== '${{ inputs.issue }}'
    || inputs.token !== expectedToken
    || !String(inputs['single-action-message'] ?? '').includes(`## ❌ ${expectedTitle} orchestration needs attention`)
    || !String(inputs['single-action-message'] ?? '').includes('${{ github.run_id }}')) {
    throw new Error(`${relativeFile} report-failure must invoke publish_issue_comment with the launcher issue and run link.`);
  }
}

function assertSetupFailureReporter(relativeFile, steps, expectedKind) {
  if (steps.length !== 2
    || steps[0]?.uses !== DISTRIBUTED_COPILOT_ACTION
    || steps[1]?.uses !== DISTRIBUTED_COPILOT_ACTION) {
    throw new Error(`${relativeFile} report-failure must invoke the released Copilot action.`);
  }
  assertDurableFailureReporter(relativeFile, steps[0]);
  const inputs = steps[1].with ?? {};
  const expectedTitle = expectedKind === 'release' ? 'Release' : 'Hotfix';
  if (steps[1].if !== "${{ inputs.mode == 'prepare' }}"
    || inputs['single-action'] !== 'publish_issue_comment'
    || inputs['single-action-issue'] !== '${{ inputs.issue }}'
    || inputs.token !== '${{ secrets.PAT }}'
    || !String(inputs['single-action-message'] ?? '').includes(`## ❌ ${expectedTitle} orchestration needs attention`)
    || !String(inputs['single-action-message'] ?? '').includes('${{ github.run_id }}')) {
    throw new Error(`${relativeFile} report-failure must invoke publish_issue_comment with the launcher issue and run link.`);
  }
}

function assertDurableFailureReporter(relativeFile, step) {
  const inputs = step?.with ?? {};
  if (step?.if !== "${{ inputs.mode == 'publish' || inputs.mode == 'resume' }}"
    || inputs['single-action'] !== 'failed_deployment_action'
    || inputs['single-action-issue'] !== '${{ inputs.issue }}'
    || inputs['single-action-operation-id'] !== '${{ inputs.operation-id }}'
    || inputs['single-action-version'] !== '${{ inputs.version }}'
    || inputs.token !== '${{ secrets.PAT }}'
    || !String(inputs['single-action-message'] ?? '').includes('${{ github.run_id }}')) {
    throw new Error(`${relativeFile} report-failure must persist publish-mode failure against the durable operation.`);
  }
}

function assertMutationWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const manifest = MUTATION_WORKFLOW_MANIFEST.find(entry => relativeFile.endsWith(`/${entry.file}`));
  if (!manifest) return false;
  if (workflow.name !== manifest.workflowName) {
    throw new Error(`${relativeFile} must have workflow name ${JSON.stringify(manifest.workflowName)}.`);
  }
  const setup = relativeFile.startsWith('setup/workflows/');
  const finalJob = manifest.file === 'release_workflow.yml' ? 'finalize-release' : 'finalize-hotfix';
  const expectedJobs = setup
    ? ['validate', 'candidate-preflight', 'prepare-version-files', 'promote', 'publish', 'resume-reconciliation', 'report-failure']
    : ['validate', 'candidate-preflight', 'prepare-version-files', 'prepare-compiled-files', 'promote', 'tag', 'publish-npm', finalJob, 'resume-reconciliation', 'report-failure'];
  const actualJobs = Object.keys(workflow.jobs ?? {});
  if (actualJobs.length !== expectedJobs.length || expectedJobs.some(jobId => !actualJobs.includes(jobId))) {
    throw new Error(`${relativeFile} must define the exact validation-first job graph.`);
  }
  assertDeploymentWorkflowConcurrency(relativeFile, workflow);
  assertDeploymentValidationJob(relativeFile, workflow);
  assertResumeReconciliationJob(relativeFile, workflow.jobs['resume-reconciliation'], setup);
  assertExactNeeds(relativeFile, 'prepare-version-files', workflow.jobs['prepare-version-files'], ['validate', 'candidate-preflight']);
  if (setup) {
    assertExactTimeout(relativeFile, 'prepare-version-files', workflow.jobs['prepare-version-files'], 30);
    assertExactNeeds(relativeFile, 'promote', workflow.jobs.promote, ['validate', 'candidate-preflight', 'prepare-version-files']);
    assertExactNeeds(relativeFile, 'publish', workflow.jobs.publish, ['validate']);
    assertPhaseConditions(relativeFile, workflow.jobs, 'publish');
    assertFailureReportingJob(
      relativeFile,
      workflow.jobs['report-failure'],
      ['validate', 'candidate-preflight', 'prepare-version-files', 'promote', 'publish', 'resume-reconciliation'],
      manifest.file.startsWith('release') ? 'release' : 'hotfix',
    );
  } else {
    assertExactTimeout(relativeFile, 'prepare-version-files', workflow.jobs['prepare-version-files'], PREPARE_VERSION_TIMEOUT_MINUTES);
    assertExactTimeout(relativeFile, 'prepare-compiled-files', workflow.jobs['prepare-compiled-files'], PREPARE_COMPILED_TIMEOUT_MINUTES);
    assertExactTimeout(relativeFile, 'tag', workflow.jobs.tag, TAG_TIMEOUT_MINUTES);
    assertExactNeeds(relativeFile, 'prepare-compiled-files', workflow.jobs['prepare-compiled-files'], ['validate', 'candidate-preflight', 'prepare-version-files']);
    assertExactNeeds(relativeFile, 'promote', workflow.jobs.promote, ['validate', 'candidate-preflight', 'prepare-compiled-files']);
    assertExactNeeds(relativeFile, 'tag', workflow.jobs.tag, ['validate']);
    assertNpmPublishJob(relativeFile, workflow.jobs['publish-npm']);
    assertPublishedFinalizeJob(relativeFile, workflow.jobs[finalJob], finalJob);
    assertPhaseConditions(relativeFile, workflow.jobs, finalJob);
    assertFailureReportingJob(
      relativeFile,
      workflow.jobs['report-failure'],
      ['validate', 'candidate-preflight', 'prepare-version-files', 'prepare-compiled-files', 'promote', 'tag', 'publish-npm', finalJob, 'resume-reconciliation'],
      manifest.file.startsWith('release') ? 'release' : 'hotfix',
    );
  }
  replacementContract.assertReplacementContract(relativeFile, workflow);
  assertTransitiveValidationAncestry(file, workflow, 'validate', new Set(['report-failure']));
  return true;
}

function assertDeploymentWorkflowConcurrency(relativeFile, workflow) {
  const concurrency = workflow.concurrency ?? {};
  if (concurrency.group !== DEPLOYMENT_CONCURRENCY_GROUP
    || concurrency['cancel-in-progress'] !== false
    || concurrency.queue !== 'max'
    || Object.keys(concurrency).sort().join(',') !== 'cancel-in-progress,group,queue') {
    throw new Error(`${relativeFile} must use the exact issue-scoped deployment concurrency group with queue: max.`);
  }
  const issue = workflow.on?.workflow_dispatch?.inputs?.issue;
  if (issue?.required !== true || Object.prototype.hasOwnProperty.call(issue ?? {}, 'default')) {
    throw new Error(`${relativeFile} launcher issue must be required and have no default.`);
  }
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (job.concurrency !== undefined) {
      throw new Error(`${relativeFile} job ${jobId} must rely on the workflow deployment mutex.`);
    }
  }
}

function assertDeploymentValidationJob(relativeFile, workflow) {
  const job = workflow.jobs?.validate;
  if (!job) throw new Error(`${relativeFile} must define validate before every mutation job.`);
  assertExactTimeout(relativeFile, 'validate', job, DEPLOYMENT_VALIDATION_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, 'validate', job, []);
  if (Object.keys(job.permissions ?? {}).length !== 0) {
    throw new Error(`${relativeFile} validate must have no repository permissions.`);
  }
  if (job.env !== undefined || Object.prototype.hasOwnProperty.call(job, 'continue-on-error')) {
    throw new Error(`${relativeFile} validate must not receive job credentials or bypass failures.`);
  }
  const steps = job.steps ?? [];
  const validationStep = steps[0] ?? {};
  const stepInputs = validationStep.with ?? {};
  const stepEnvironment = validationStep.env ?? {};
  const script = String(stepInputs.script ?? '');
  if (steps.length !== 1
    || validationStep.uses !== 'actions/github-script@v9'
    || validationStep.run !== undefined
    || Object.keys(stepInputs).join(',') !== 'script'
    || Object.keys(stepEnvironment).sort().join(',') !== 'CHANGELOG,CONFIRM_UNPUBLISHED,EXPECTED_REVISION,ISSUE,MODE,OPERATION_ID,REPLACEMENT_ENABLED,SOURCE_SHA,TITLE,VERSION'
    || Object.entries(stepEnvironment).some(([key, value]) => /token|secret|pat/i.test(key)
      || /secrets\.|github\.token/i.test(String(value)))
    || !script.includes('Number.isSafeInteger(issue)')
    || !script.includes("mode === 'prepare'")
    || !script.includes("mode === 'publish'")
    || !script.includes("mode === 'resume'")
    || !script.includes('Operation ID must be empty in prepare mode.')
    || !script.includes("if (errors.length) core.setFailed(errors.join(' '));")) {
    throw new Error(`${relativeFile} validate must enforce bounded cross-field inputs with the bundled runtime and default permissionless token.`);
  }
}

function assertPhaseConditions(relativeFile, jobs, finalJob) {
  for (const jobId of ['prepare-version-files', 'prepare-compiled-files', 'promote'].filter(id => jobs[id])) {
    if (jobs[jobId].if !== replacementContract.phaseCondition(jobId, !!jobs['prepare-compiled-files'])) {
      throw new Error(`${relativeFile} job ${jobId} must run only in the validated preparation phase.`);
    }
  }
  for (const jobId of ['tag', 'publish-npm', 'publish', finalJob].filter(id => jobs[id])) {
    if (jobs[jobId].if !== "${{ inputs.mode == 'publish' }}") {
      throw new Error(`${relativeFile} job ${jobId} must run only in publish mode.`);
    }
  }
  const preparationActions = Object.values(jobs).flatMap(job => job.steps ?? [])
    .filter(step => isCopilotAction(step) && step.with?.['single-action'] === 'prepare_deployment_action');
  if (preparationActions.length !== 1 || preparationActions[0].with?.token !== '${{ secrets.PAT }}') {
    throw new Error(`${relativeFile} must create exactly one promotion through the PAT-backed prepare_deployment_action.`);
  }
  const publishedActions = Object.values(jobs).flatMap(job => job.steps ?? [])
    .filter(step => isCopilotAction(step) && step.with?.['single-action'] === 'published_deployment_action');
  if (publishedActions.length !== 2) {
    throw new Error(`${relativeFile} must project publication through published_deployment_action.`);
  }
  if ([...preparationActions, ...publishedActions].some(step =>
    step.with?.['merge-queue-check-attestations'] !== "${{ vars.MERGE_QUEUE_CHECK_ATTESTATIONS || '[]' }}")) {
    throw new Error(`${relativeFile} must pass live merge-queue attestations on every preparation and reconciliation entrypoint.`);
  }
  const trustedContinuations = Object.values(jobs).flatMap(job => job.steps ?? [])
    .filter(step => isCopilotAction(step) && [
      'create_tag',
      'create_release',
      'publish_github_action',
      'published_deployment_action',
    ].includes(step.with?.['single-action']));
  if (trustedContinuations.some(step => step.with?.['single-action-operation-id'] !== '${{ inputs.operation-id }}'
    || step.with?.['single-action-version'] !== '${{ inputs.version }}')) {
    throw new Error(`${relativeFile} must bind every publication mutation to inputs.operation-id and inputs.version.`);
  }
}

function assertResumeReconciliationJob(relativeFile, job, setup) {
  assertExactTimeout(relativeFile, 'resume-reconciliation', job, 15);
  assertExactNeeds(relativeFile, 'resume-reconciliation', job, ['validate']);
  const permissions = setup ? { issues: 'write', 'pull-requests': 'write' }
    : { contents: 'read', issues: 'write', 'pull-requests': 'write' };
  if (job.if !== "${{ inputs.mode == 'resume' }}"
    || JSON.stringify(job.permissions) !== JSON.stringify(permissions)
    || job.env !== undefined || Object.hasOwn(job, 'continue-on-error')) {
    throw new Error(`${relativeFile} recovery must use its exact phase gate and least-privilege permissions.`);
  }
  const steps = job.steps ?? [];
  const proof = steps[0];
  const recovery = steps.at(-1);
  if (steps.length !== (setup ? 2 : 3)
    || steps.some(step => step.if !== undefined || step.run !== undefined || Object.hasOwn(step, 'continue-on-error'))
    || proof?.uses !== 'actions/github-script@v9'
    || Object.keys(proof.with ?? {}).join(',') !== 'script'
    || JSON.stringify(proof.env) !== JSON.stringify({ ISSUE: '${{ inputs.issue }}', OPERATION_ID: '${{ inputs.operation-id }}', VERSION: '${{ inputs.version }}' })
    || !String(proof.with.script).includes("['reconciliation_pending', 'completed'].includes(phase)")
    || !String(proof.with.script).includes('state.publicationVerified !== true')
    || !String(proof.with.script).includes('receipt?.productionSha !== state.productionSha')
    || recovery?.uses !== (setup ? DISTRIBUTED_COPILOT_ACTION : './')
    || recovery.with?.['single-action'] !== 'published_deployment_action'
    || recovery.with?.['single-action-issue'] !== '${{ inputs.issue }}'
    || recovery.with?.token !== '${{ secrets.PAT }}'
    || (!setup && (steps[1]?.uses !== CHECKOUT_ACTION || steps[1]?.with?.ref !== '${{ github.sha }}'
      || steps[1]?.with?.['persist-credentials'] !== false))) {
    throw new Error(`${relativeFile} recovery must prove existing publication state and invoke only the reconciliation continuation.`);
  }
}

function assertPublishedFinalizeJob(relativeFile, job, jobId) {
  assertExactTimeout(relativeFile, jobId, job, FINALIZE_RELEASE_TIMEOUT_MINUTES);
  assertExactNeeds(relativeFile, jobId, job, ['publish-npm']);
  const actions = (job.steps ?? []).filter(isCopilotAction).map(step => step.with?.['single-action']);
  for (const required of ['create_release', 'publish_github_action', 'published_deployment_action']) {
    if (!actions.includes(required)) throw new Error(`${relativeFile} ${jobId} must invoke ${required}.`);
  }
}

function assertDeploymentContinuationWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!relativeFile.endsWith('/copilot_deployment_orchestration.yml')) return;
  if (workflow.on?.pull_request?.types?.join(',') !== 'closed' || workflow.on?.pull_request_target) {
    throw new Error(`${relativeFile} must use only pull_request: closed as its wake-up event.`);
  }
  if (workflow.concurrency !== undefined || Object.keys(workflow.jobs ?? {}).sort().join(',') !== 'mutate,resolve-operation') {
    throw new Error(`${relativeFile} must separate read-only resolution from the serialized mutation job.`);
  }
  const resolver = workflow.jobs['resolve-operation'];
  const mutation = workflow.jobs.mutate;
  if (!String(resolver?.if ?? '').includes('github.event.pull_request.head.repo.full_name == github.repository')
    || !String(resolver?.if ?? '').includes('<!-- copilot-deployment ')) {
    throw new Error(`${relativeFile} must gate resolution on a same-repository managed deployment marker.`);
  }
  const resolverPermissions = resolver.permissions ?? {};
  if (JSON.stringify(resolverPermissions) !== JSON.stringify({ contents: 'read', issues: 'read', 'pull-requests': 'read' })
    || /\b(secrets\.|PAT)\b/i.test(JSON.stringify(resolver))) {
    throw new Error(`${relativeFile} resolver must be read-only and credential-free.`);
  }
  const resolverScript = String(resolver.steps?.[0]?.with?.script ?? '');
  if (resolver.steps?.length !== 1
    || resolver.steps[0]?.uses !== 'actions/github-script@v9'
    || !resolverScript.includes('github.rest.issues.get')
    || !resolverScript.includes('state?.stateVersion !== 1')
    || !resolverScript.includes('Number.isSafeInteger(state?.revision)')
    || resolver.outputs?.issue !== '${{ steps.identity.outputs.issue }}') {
    throw new Error(`${relativeFile} resolver must prove marker ownership against versioned durable state.`);
  }
  if (needsFor(mutation).join(',') !== 'resolve-operation'
    || mutation.if !== "${{ needs.resolve-operation.result == 'success' }}"
    || mutation.concurrency?.group !== DEPLOYMENT_CONTINUATION_CONCURRENCY_GROUP
    || mutation.concurrency?.['cancel-in-progress'] !== false
    || mutation.concurrency?.queue !== 'max') {
    throw new Error(`${relativeFile} mutation must use the exact resolved issue deployment mutex with queue: max.`);
  }
  const checkout = (mutation.steps ?? []).find(step => step.uses === CHECKOUT_ACTION);
  if (checkout?.with?.ref !== '${{ github.event.pull_request.base.ref }}'
    || checkout?.with?.['persist-credentials'] !== false) {
    throw new Error(`${relativeFile} must checkout the trusted PR base without persisted credentials.`);
  }
  const continuation = (mutation.steps ?? []).find(step => isCopilotAction(step) && step.with?.['single-action'] === 'continue_deployment_action');
  if (!continuation
    || continuation.with?.token !== '${{ secrets.PAT }}'
    || continuation.with?.['merge-queue-check-attestations'] !== "${{ vars.MERGE_QUEUE_CHECK_ATTESTATIONS || '[]' }}"
    || continuation.with?.['single-action-issue'] !== '${{ needs.resolve-operation.outputs.issue }}'
    || continuation.with?.['single-action-operation-id'] !== '${{ needs.resolve-operation.outputs.operation-id }}') {
    throw new Error(`${relativeFile} must invoke continuation with the PAT and live merge-queue attestations so managed events can recurse safely.`);
  }
}

function assertMergeQueueWorkflowSupport(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const required = new Set([
    '.github/workflows/ci_check.yml',
    '.github/workflows/copilot_pull_request_merge_queue.yml',
    'setup/workflows/copilot_pull_request_merge_queue.yml',
  ]);
  if (!required.has(relativeFile)) return;
  const types = workflow.on?.merge_group?.types;
  if (!Array.isArray(types) || !types.includes('checks_requested')) {
    throw new Error(`${relativeFile} must support merge_group checks_requested for merge queues.`);
  }
}


// Keep unrelated repository Variables out of the admission transport and logs.
// The executed workflow SHA binds this ordered list of effective input names.
function issueAdmissionConfigurationExpression(workflow) {
  const job = workflow.jobs?.['copilot-issues'];
  const steps = (job?.steps ?? []).filter(isCopilotAction);
  const source = JSON.stringify({ steps, runsOn: job?.['runs-on'], environment: job?.env });
  if (/\bvars\s*\[/u.test(source)) throw new Error('Issue admission requires explicit literal Variable references.');
  const names = [...new Set([...source.matchAll(/\bvars\.([A-Za-z_][A-Za-z0-9_]*)/gu)].map(match => match[1]))].sort();
  if (!names.length) return "${{ '[]' }}";
  return "${{ format('[" + names.map((_, index) => '{' + index + '}').join(',') + "]', "
    + names.map(name => 'toJSON(vars.' + name + ')').join(', ') + ') }}';
}

function assertIssueAdmissionWorkflow(relativeFile, workflow) {
  const admission = workflow.jobs?.['issue-admission'];
  const work = workflow.jobs?.['copilot-issues'];
  const distributed = relativeFile.startsWith('setup/');
  const action = distributed ? 'vypdev/copilot/issue-admission@v3' : './issue-admission';
  const inspect = admission?.steps?.find(step => step.id === 'inspect');
  const product = work?.steps?.find(isCopilotAction);
  const record = work?.steps?.find(step => step.id === 'receipt');
  const upload = work?.steps?.find(step => step.name === 'Retain successful reconciliation receipt');
  const variables = issueAdmissionConfigurationExpression(workflow);
  const deploy = "${{ vars.DEPLOY_LABEL || 'deploy' }}";
  if (Object.keys(workflow.jobs ?? {}).sort().join(',') !== 'copilot-issues,issue-admission'
    || admission?.['runs-on'] !== 'ubuntu-latest' || admission['timeout-minutes'] !== 5
    || admission.if !== undefined || admission.needs !== undefined || admission.env !== undefined
    || Object.keys(admission.permissions ?? {}).sort().join(',') !== 'actions,contents'
    || admission.permissions.actions !== 'read' || admission.permissions.contents !== 'read'
    || admission.outputs?.execute !== '${{ steps.inspect.outputs.execute }}'
    || admission.outputs?.['receipt-key'] !== '${{ steps.inspect.outputs.receipt-key }}'
    || (admission.steps ?? []).some(step => step !== inspect && !(step.uses === CHECKOUT_ACTION && !distributed && step.with?.['persist-credentials'] === false))
    || inspect?.uses !== action || inspect.with?.['issue-event-admission-mode'] !== 'inspect'
    || inspect.with?.token !== '${{ secrets.PAT }}' || inspect.with.configuration !== variables || inspect.with['deploy-label'] !== deploy
    || JSON.stringify(inspect.env) !== JSON.stringify({ COPILOT_ISSUE_ADMISSION_TOKEN: '${{ github.token }}' })
    || Object.keys(inspect.with).sort().join(',') !== 'configuration,deploy-label,issue-event-admission-mode,repository-locale,token'
    || inspect.with['repository-locale'] !== REPOSITORY_LOCALE_INPUTS['repository-locale']
    || inspect.if !== undefined || inspect['continue-on-error'] !== undefined
    || (work?.steps ?? []).filter(isCopilotAction).length !== 1 || product?.with?.['single-action'] !== undefined
    || (product?.with?.['release-label'] ?? 'release') !== (inspect?.with?.['release-label'] ?? 'release')
    || (product?.with?.['hotfix-label'] ?? 'hotfix') !== (inspect?.with?.['hotfix-label'] ?? 'hotfix')
    || product?.id !== 'copilot' || product.if !== undefined || product['continue-on-error'] !== undefined
    || work?.needs !== 'issue-admission' || work.if !== "${{ needs.issue-admission.outputs.execute == 'true' }}"
    || record?.uses !== action || record.with?.['issue-event-admission-mode'] !== 'record'
    || record.with?.token !== '${{ secrets.PAT }}' || record.with.configuration !== variables || record.with['deploy-label'] !== deploy
    || record.with['receipt-key'] !== '${{ needs.issue-admission.outputs.receipt-key }}'
    || record.if !== "${{ success() && steps.copilot.outcome == 'success' && needs.issue-admission.outputs.receipt-key != '' }}" || record['continue-on-error'] !== true
    || Object.keys(record.with).sort().join(',') !== 'configuration,deploy-label,issue-event-admission-mode,receipt-key,repository-locale,token'
    || record.with['repository-locale'] !== REPOSITORY_LOCALE_INPUTS['repository-locale'] || record.env !== undefined
    || upload?.uses !== 'actions/upload-artifact@v5' || upload.if !== "${{ steps.receipt.outputs.receipt-path != '' }}"
    || upload['continue-on-error'] !== true || upload.with?.name !== '${{ steps.receipt.outputs.receipt-name }}'
    || upload.with.path !== '${{ steps.receipt.outputs.receipt-path }}' || upload.with['retention-days'] !== 1
    || upload.with['if-no-files-found'] !== 'error'
    || work.steps.indexOf(record) <= work.steps.findIndex(isCopilotAction) || work.steps.indexOf(upload) <= work.steps.indexOf(record)
    || !(work.steps ?? []).some(step => isCopilotAction(step) && step.with?.['deploy-label'] === deploy)) {
    throw new Error(`${relativeFile} must retain isolated native issue admission and success-only unchanged-state receipts.`);
  }
}

function assertQueueWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  const manifest = QUEUE_WORKFLOW_MANIFEST.find(entry => relativeFile.endsWith(`/${entry.file}`));
  if (!manifest) return;
  assertReviewConcurrency(relativeFile, workflow);
  if (assertMutationWorkflow(file, workflow)) return;
  if (workflow.name !== manifest.workflowName) {
    throw new Error(`${relativeFile} must have workflow name ${JSON.stringify(manifest.workflowName)}.`);
  }
  const queueJob = workflow.jobs?.[manifest.jobId];
  if (!queueJob) throw new Error(`${relativeFile} must define queue job ${manifest.jobId}.`);
  if (manifest.file === 'copilot_commit.yml') {
    const branches = workflow.on?.push?.branches;
    if (!Array.isArray(branches) || !branches.includes('!setup/copilot/**')) {
      throw new Error(`${relativeFile} must exclude installer-owned setup/copilot branches from issue-centric push analysis.`);
    }
    const index = branches.indexOf('!copilot-permission-test-*');
    if (index < 0 || branches.slice(index + 1).some(branch => typeof branch !== 'string' || !branch.startsWith('!'))) {
      throw new Error(`${relativeFile} must exclude temporary permission-probe branches after all positive push patterns.`);
    }
  }
  if (manifest.file === 'copilot_issue.yml' && !workflow.on?.issues?.types?.includes('closed')) {
    throw new Error(`${relativeFile} must subscribe to native closed issue events.`);
  }
  if (manifest.file === 'copilot_issue.yml') assertIssueAdmissionWorkflow(relativeFile, workflow);
  const expectedBotGate = manifest.file === 'copilot_issue.yml' ? "${{ needs.issue-admission.outputs.execute == 'true' }}"
    : manifest.file === 'copilot_pull_request.yml' && relativeFile.startsWith('setup/')
    ? BOT_PR_ANALYSIS_GATE_EXPRESSION
    : FORK_GATED_WORKFLOW_FILES.has(manifest.file)
      ? FORK_SAFE_BOT_GATE_EXPRESSION
    : BOT_GATE_EXPRESSION;
  if (BOT_GATED_WORKFLOW_FILES.has(manifest.file) && queueJob.if !== expectedBotGate) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must use the required bot actor${FORK_GATED_WORKFLOW_FILES.has(manifest.file) ? ' and same-repository PR' : ''} gate.`);
  }
  if (commentContract.CALLBACKS.includes(manifest.file)) return assertCommentWorkflowCaller(file, workflow);
  if (typeof queueJob['timeout-minutes'] !== 'number'
    || queueJob['timeout-minutes'] < MIN_QUEUE_JOB_TIMEOUT_MINUTES) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must have timeout-minutes >= ${MIN_QUEUE_JOB_TIMEOUT_MINUTES}.`);
  }
  if (!(queueJob.steps ?? []).some(isCopilotAction)) {
    throw new Error(`${relativeFile} queue job ${manifest.jobId} must invoke the Copilot action.`);
  }
  assertIncrementalRangeFetch(relativeFile, manifest.file, queueJob);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (jobId !== manifest.jobId && (job.steps ?? []).some(isCopilotAction)) {
      throw new Error(`${relativeFile} unmanifested job ${jobId} invokes the Copilot action.`);
    }
  }
}

function assertIncrementalRangeFetch(relativeFile, manifestFile, job) {
  const contract = manifestFile === 'copilot_commit.yml'
      ? {
        name: 'Fetch push review range',
        condition: `github.event.after != '${ZERO_OBJECT_ID}'`,
      }
    : manifestFile === 'copilot_pull_request.yml'
      ? { name: 'Fetch incremental review range', condition: "github.event.action == 'synchronize'" }
      : undefined;
  if (!contract) return;
  const checkout = (job.steps ?? []).find(candidate => /^actions\/checkout@/.test(candidate?.uses ?? ''));
  const step = (job.steps ?? []).find(candidate => candidate?.name === contract.name);
  const fetchScript = typeof step?.run === 'string' ? step.run.trim() : '';
  if (!step
    || checkout?.with?.['persist-credentials'] !== false
    || checkout?.with?.['fetch-depth'] !== 0
    || step.if !== contract.condition
    || step.env?.BEFORE_SHA !== '${{ github.event.before }}'
    || step.env?.AFTER_SHA !== '${{ github.event.after }}'
    || (manifestFile === 'copilot_commit.yml' && step.env?.BRANCH_CREATED !== '${{ github.event.created }}')
    || !fetchScript.includes('git cat-file -e "${AFTER_SHA}^{commit}"')
    || !fetchScript.includes(`${manifestFile === 'copilot_commit.yml' ? 'if [ "$BRANCH_CREATED" != "true" ] && ' : 'if '}! git cat-file -e "\${BEFORE_SHA}^{commit}"; then`)) {
    throw new Error(`${relativeFile} must materialize and verify the exact GitHub before/after review range without persisted credentials.`);
  }
}

function assertPortableRunShell(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const isCodexRunner = relativeFile.startsWith('.github/workflows/')
      && runnerLabels(job['runs-on']).includes('codex');
    const isDistributedReviewRange = relativeFile === 'setup/workflows/copilot_commit.yml'
      || relativeFile === 'setup/workflows/copilot_pull_request.yml';
    const isSetupPlatformSmoke = relativeFile === '.github/workflows/setup_platform_smoke.yml';
    if (!isCodexRunner && !isDistributedReviewRange && !isSetupPlatformSmoke) continue;
    for (const [stepIndex, step] of (job.steps ?? []).entries()) {
      if (typeof step?.run !== 'string') continue;
      const shell = step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell;
      if (shell !== 'bash') {
        throw new Error(`${relativeFile} job ${jobId} step ${stepIndex + 1} must select shell: bash for portable run execution.`);
      }
    }
  }
}

function assertSequentialMutationWorkflow(file, workflow) {
  const relativeFile = relativeWorkflow(file);
  if (!QUEUE_WORKFLOW_MANIFEST.some(entry => relativeFile.endsWith(`/${entry.file}`))) return;
  assertReviewConcurrency(relativeFile, workflow);
}

function assertIssueWorkflowProfileInput(file, workflow) {
  if (!ISSUE_WORKFLOW_PROFILE_FILES.has(path.basename(file))) return;
  const relativeFile = relativeWorkflow(file);
  const expectedAction = expectedCopilotAction(relativeFile);
  const actionSteps = Object.values(workflow.jobs ?? {}).flatMap(job => job?.steps ?? [])
    .filter(step => step?.uses === expectedAction);
  if (actionSteps.length === 0 || actionSteps.some(step =>
    step.with?.['issue-workflow-profile'] !== "${{ vars.COPILOT_ISSUE_WORKFLOW_PROFILE || '' }}")) {
    throw new Error(`${relativeFile} must pass COPILOT_ISSUE_WORKFLOW_PROFILE to every issue-bound Copilot action step.`);
  }
}

function assertIssueBranchConfigurationInputs(file, workflow) {
  if (!WORKFLOW_AGENT_ROLES[path.basename(file)]) return;
  if (commentContract.CALLBACKS.includes(path.basename(file))) return assertCommentWorkflowCaller(file, workflow);
  const relativeFile = relativeWorkflow(file);
  const distributed = relativeFile.startsWith('setup/workflows/');
  const branches = JSON.parse(readFileSync(path.join(repositoryRoot, '.copilot/repository-profile.json'), 'utf8')).branches;
  const expected = distributed
    ? {
      'issue-managed-branches': "${{ vars.ISSUE_MANAGED_BRANCHES || 'true' }}",
      'pre-branch-sdd': "${{ vars.PRE_BRANCH_SDD || 'false' }}",
      'verification-setup': "${{ vars.VERIFICATION_SETUP || 'false' }}",
    }
    : {
      'issue-managed-branches': branches.issueManagedBranches,
      'pre-branch-sdd': branches.preBranchSdd,
      'verification-setup': "${{ vars.VERIFICATION_SETUP || 'false' }}",
    };
  const actionSteps = Object.values(workflow.jobs ?? {}).flatMap(job => job?.steps ?? [])
    .filter(isCopilotAction);
  if (actionSteps.length === 0 || actionSteps.some(step =>
    Object.entries(expected).some(([input, value]) => step.with?.[input] !== value))) {
    throw new Error(`${relativeFile} must pass consistent issue-managed-branches, pre-branch-sdd and verification-setup inputs to every Copilot callback.`);
  }
}

function assertNativeVerificationWorkflow(file, workflow) {
  const contract = require('./generate-native-verification-workflows.cjs');
  if (path.basename(file) === contract.RUNTIME) return assertCommentWorkflowRuntime(file, workflow);
  if (contract.CALLBACKS.includes(path.basename(file))) return assertCommentWorkflowCaller(file, workflow);

}

function validateWorkflow(file, workflow) {
  if (!workflow || typeof workflow !== 'object') throw new Error('workflow document is empty.');
  if (commentContract.CALLBACKS.includes(path.basename(file))) {
    assertCommentWorkflowCaller(file, workflow);
    assertDirectEventTriggers(file, workflow);
    return;
  }
  if (path.basename(file) === commentContract.RUNTIME) {
    assertCommentWorkflowRuntime(file, workflow);
    assertCopilotActionInputs(file, workflow);
    assertNoJobLevelSecrets(file, workflow);
    assertAgentWorkflowPermissions(file, workflow);
    assertAgentInputs(file, workflow);
    assertRepositoryLocaleInputs(file, workflow);
    return;
  }
  assertNativeVerificationWorkflow(file, workflow);
  assertManualRepoWiseWorkflow(file, workflow);
  assertDirectEventTriggers(file, workflow);
  assertApprovalObserverWorkflow(file, workflow);
  assertPullRequestMergeQueueWorkflow(file, workflow);
  assertRunner(file, workflow);
  assertPortableRunShell(file, workflow);
  assertSequentialMutationWorkflow(file, workflow);
  assertAgentInputs(file, workflow);
  assertRepositoryLocaleInputs(file, workflow);
  assertRepositoryBugbotContextExclusions(file, workflow);
  assertAgentInstallationPrerequisites(file, workflow);
  assertNoJobLevelSecrets(file, workflow);
  assertAgentWorkflowPermissions(file, workflow);
  assertLightweightBranchSyncWorkflow(file, workflow);
  assertMutationWorkflow(file, workflow);
  assertDeploymentContinuationWorkflow(file, workflow);
  assertMergeQueueWorkflowSupport(file, workflow);
  assertQueueWorkflow(file, workflow);
  assertMajorActionReferences(file, workflow);
  assertCopilotActionInputs(file, workflow);
  assertIssueWorkflowProfileInput(file, workflow);
  assertIssueBranchConfigurationInputs(file, workflow);
}

function main() {
  const files = workflowDirectories.flatMap(workflowFiles);
  const errors = [];
  for (const file of files) {
    try {
      validateWorkflow(file, yaml.load(readFileSync(file, 'utf8')));
    } catch (error) {
      errors.push(`${relativeWorkflow(file)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`workflow contract validation: PASS (${files.length} workflows, ${QUEUE_WAIT_MINUTES}m queue / ${MIN_QUEUE_JOB_TIMEOUT_MINUTES}m job budget)`);
  }
}

if (require.main === module) main();

module.exports = {
  issueAdmissionConfigurationExpression,
  assertNativeVerificationWorkflow,
  QUEUE_WAIT_MINUTES,
  MIN_QUEUE_JOB_TIMEOUT_MINUTES,
  DEPLOYMENT_VALIDATION_TIMEOUT_MINUTES,
  PREPARE_VERSION_TIMEOUT_MINUTES,
  PREPARE_COMPILED_TIMEOUT_MINUTES,
  TAG_TIMEOUT_MINUTES,
  NPM_PUBLISH_TIMEOUT_MINUTES,
  FINALIZE_RELEASE_TIMEOUT_MINUTES,
  FAILURE_REPORT_TIMEOUT_MINUTES,
  QUEUE_WORKFLOW_MANIFEST,
  MUTATION_WORKFLOW_MANIFEST,
  BOT_GATED_WORKFLOW_FILES,
  BOT_GATE_EXPRESSION,
  FORK_SAFE_BOT_GATE_EXPRESSION,
  assertMajorActionReferences,
  assertCopilotActionInputs,
  assertIssueWorkflowProfileInput,
  assertIssueBranchConfigurationInputs,
  assertAgentInputs,
  assertRepositoryLocaleInputs,
  assertRepositoryBugbotContextExclusions,
  assertAgentInstallationPrerequisites,
  assertNoJobLevelSecrets,
  assertAgentWorkflowPermissions,
  assertLightweightBranchSyncWorkflow,
  assertDirectEventTriggers,
  assertMutationWorkflow,
  assertNoConcurrency,
  assertReviewConcurrency,
  assertQueueBudget,
  assertExactTimeout,
  assertTagPermissions,
  assertQueueWorkflow,
  assertIncrementalRangeFetch,
  assertRunner,
  assertPortableRunShell,
  assertSequentialMutationWorkflow,
  assertDeploymentContinuationWorkflow,
  assertMergeQueueWorkflowSupport,
  assertTransitiveValidationAncestry,
  validateWorkflow,
};
