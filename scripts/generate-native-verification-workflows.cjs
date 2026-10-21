const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const MAX_REQUESTS = 20;
const ACTION = './.git/copilot-verification-setup';
const { SOURCE_ACTION } = require('./prepare-native-source-action.cjs');
const CALLBACKS = ['copilot_issue_comment.yml', 'copilot_pull_request_comment.yml'];
const { COPILOT_COMMENT_RUNTIME: RUNTIME, COPILOT_COMMENT_REMOTE_WORKFLOW: REMOTE_WORKFLOW, COPILOT_COMMENT_SELF_WORKFLOW: SELF_WORKFLOW } = require('../src/domain/copilot_comment_workflow.ts');
const SELF_ACTION = '$/';
const SECRET_NAMES = ['PAT', 'OPENCODE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'CURSOR_API_KEY', 'CODEX_API_KEY'];
const BINDINGS = require('../src/infrastructure/copilot_comment_inputs.json');
const expr = value => '${{ ' + value + ' }}';

function phaseSteps(action, inputAlias = 'copilot-inputs', id = 'copilot') {
  const steps = [];
  let previous = id;
  for (let count = 1; count <= MAX_REQUESTS; count++) {
    const setup = `verification_setup_${count}`;
    const continuation = `verification_continue_${count}`;
    const pending = `steps.${previous}.outputs.verification-setup-pending == 'true'`;
    const output = key => `\${{ steps.${previous}.outputs.verification-${key} }}`;
    steps.push({ name: `Prepare repository verification ${count}`, id: setup,
      if: `\${{ !cancelled() && steps.${previous}.outcome == 'success' && ${pending} }}`, uses: ACTION, 'timeout-minutes': 5,
      env: Object.fromEntries(['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATH', 'JAVA_HOME', 'TMP', 'TEMP', 'TMPDIR'].map(key => [key, output(key.toLowerCase())])) });
    steps.push({ name: `Continue repository verification ${count}`, id: continuation,
      if: `\${{ always() && ${pending} }}`, uses: action, with: { alias: inputAlias },
      env: { COPILOT_NATIVE_PHASE: 'continue', COPILOT_NATIVE_SOURCE: `\${{ steps.${id}.outputs.verification-source }}`, COPILOT_NATIVE_DIGEST: `\${{ steps.${id}.outputs.verification-digest }}`, COPILOT_NATIVE_GIT: `\${{ steps.${id}.outputs.verification-git }}`, COPILOT_NATIVE_TICKET: `\${{ steps.${id}.outputs.verification-ticket }}`,
        COPILOT_NATIVE_REQUEST: `\${{ steps.${previous}.outputs.verification-request }}`,
        COPILOT_NATIVE_OUTCOME: `\${{ steps.${setup}.outcome }}` } });
    previous = continuation;
  }
  steps.push({ name: 'Complete repository verification', id: 'verification_complete',
    if: `\${{ always() && steps.${id}.outputs.verification-ticket != '' }}`, uses: action, with: { alias: inputAlias },
    env: { COPILOT_NATIVE_PHASE: 'finish', COPILOT_NATIVE_SOURCE: `\${{ steps.${id}.outputs.verification-source }}`, COPILOT_NATIVE_DIGEST: `\${{ steps.${id}.outputs.verification-digest }}`, COPILOT_NATIVE_GIT: `\${{ steps.${id}.outputs.verification-git }}`, COPILOT_NATIVE_TICKET: `\${{ steps.${id}.outputs.verification-ticket }}` } });
  return steps;
}

function renderSteps(action, alias = 'copilot-inputs', id = 'copilot') {
  return yaml.dump(phaseSteps(action, alias, id), { lineWidth: -1, noRefs: true, quotingType: '"' })
    .replace(/with:\n    alias: ([^\n]+)/g, 'with: *$1')
    .split('\n').map(line => line ? `      ${line}` : '').join('\n');
}

function commentWorkflow(file, source = false) {
  const pr = path.basename(file) === CALLBACKS[1];
  return {
    name: `Copilot - ${pr ? 'Pull Request' : 'Issue'} Comment`,
    on: { [pr ? 'pull_request_review_comment' : 'issue_comment']: { types: ['created', 'edited'] } },
    jobs: { [pr ? 'copilot-pull-requests' : 'copilot-issues']: {
      if: expr(pr ? "(vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN) && github.event.pull_request.head.repo.full_name == github.repository" : "vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN"),
      uses: source ? SELF_WORKFLOW : REMOTE_WORKFLOW,
      permissions: { checks: 'write', contents: 'read' },
      with: { 'runs-on': JSON.stringify(source ? ['self-hosted', 'codex', 'Linux'] : 'ubuntu-latest'),
        ...(source ? { 'issue-managed-branches': 'true', 'pre-branch-sdd': 'true', 'ai-ignore-files': 'build/*,specs/CATALOG.md', 'prepare-source-verification': true } : {}) },
      secrets: Object.fromEntries(SECRET_NAMES.map(name => [name, expr(`secrets.${name}`)])),
    } },
  };
}

function runtimeWorkflow() {
  const inputs = { ...BINDINGS, token: expr('secrets.PAT') };
  for (const key of ['issue-managed-branches', 'pre-branch-sdd', 'ai-ignore-files']) {
    inputs[key] = BINDINGS[key].replace('${{ ', '${{ inputs.' + key + ' || ');
  }
  const initial = { name: 'Run Copilot', id: 'copilot', uses: SELF_ACTION, with: inputs,
    env: { COPILOT_NATIVE_PHASE: 'prepare',
      ...Object.fromEntries(['PROVIDER', 'MODEL_PROVIDER', 'MODEL', 'EFFORT', 'EXECUTABLE'].map(name => ['AGENT_' + name, expr('vars.AGENT_' + name + (name === 'PROVIDER' ? " || 'codex'" : name === 'MODEL_PROVIDER' ? " || 'openai'" : ''))])),
      AGENT_ALLOWED_MODEL_PROVIDERS: expr("vars.AGENT_ALLOWED_MODEL_PROVIDERS || 'openai'"),
      AGENT_ALLOWED_MODELS: expr("vars.AGENT_ALLOWED_MODELS || 'openai/gpt-6-luna'"),
      ...Object.fromEntries(SECRET_NAMES.filter(name => name !== 'PAT').map(name => [name, expr('secrets.' + name)])),
      COPILOT_EVIDENCE_TOKEN: expr('github.token') } };
  initial.env.CURSOR_API_KEY = expr("(vars.AGENT_PROVIDER == 'cursor' || vars.FINDINGS_PROVIDER == 'cursor' || vars.FIXER_PROVIDER == 'cursor' || vars.PLANNER_PROVIDER == 'cursor' || vars.REVIEWER_PROVIDER == 'cursor' || vars.TESTER_PROVIDER == 'cursor') && secrets.CURSOR_API_KEY || ''");
  const preparation = "env.COPILOT_PREPARE_VERIFICATION == 'true'";
  const steps = [
    { name: 'Checkout Repository', uses: 'actions/checkout@v5', with: { 'persist-credentials': false, 'fetch-depth': 0 } },
    { name: 'Prepare repository pnpm', if: preparation, uses: 'pnpm/action-setup@v5', with: { version: '10.12.4', standalone: false, dest: expr('runner.temp') + '/setup-pnpm-' + expr('github.run_id') + '-' + expr('github.run_attempt') + '-' + expr('github.job') } },
    { name: 'Prepare repository Node', if: preparation, uses: 'actions/setup-node@v7', with: { 'node-version': '24.x' } },
    { name: 'Install repository verification dependencies', if: preparation, run: 'pnpm install --frozen-lockfile --ignore-scripts', shell: 'bash' },
    initial,
    ...phaseSteps(SELF_ACTION).map(step => ({ ...step, ...(step.with ? { with: inputs } : {}) })),
  ];
  return { name: 'Copilot - Comment Runtime', on: { workflow_call: {
    inputs: { 'runs-on': { description: 'JSON runner labels or group retained by setup.', type: 'string', default: '"ubuntu-latest"' },
      ...Object.fromEntries(['issue-managed-branches', 'pre-branch-sdd', 'ai-ignore-files'].map(key => [key, { description: `Optional ${key} override; otherwise use the caller repository Variable.`, type: 'string', default: '' }])),
      'prepare-source-verification': { description: 'Retain Copilot source-repository verification prerequisites; ignored in consumer repositories.', type: 'boolean', default: false } },
    secrets: Object.fromEntries(SECRET_NAMES.map(name => [name, { required: false }])) } },
    jobs: { copilot: { name: 'Copilot',
      if: expr("(vars.COPILOT_BOT_LOGIN == '' || github.actor != vars.COPILOT_BOT_LOGIN) && (github.event_name == 'issue_comment' || (github.event_name == 'pull_request_review_comment' && github.event.pull_request.head.repo.full_name == github.repository))"),
      'runs-on': expr("fromJSON(inputs.runs-on)"), 'timeout-minutes': 120,
      permissions: { checks: 'write', contents: 'read' },
      env: { COPILOT_PREPARE_VERIFICATION: expr("github.repository == 'vypdev/copilot' && inputs.prepare-source-verification && vars.BUGBOT_AUTOFIX_VERIFY_COMMANDS != '' && ((contains(github.event.comment.body, '/copilot') && ((contains(github.event.comment.body, 'sync-branch') && !contains(github.event.comment.body, '--dry-run')) || contains(github.event.comment.body, 'implement') || contains(github.event.comment.body, 'fix') || contains(github.event.comment.body, 'remember'))) || (vars.COPILOT_BOT_LOGIN != '' && contains(github.event.comment.body, format('@{0}', vars.COPILOT_BOT_LOGIN)) && !contains(github.event.comment.body, '--dry-run')))" ) }, steps } } };
}

function generate() {
  for (const directory of ['.github/workflows', 'setup/workflows']) for (const file of CALLBACKS) {
    fs.writeFileSync(path.join(directory, file), '# Generated by scripts/generate-native-verification-workflows.cjs\n# Project runtimes: .copilot/verification-prerequisites.json\n# Dependencies: .github/actions/copilot-verification-setup/action.yml\n# https://docs.page/vypdev/copilot/security-operations/operations/verification#repository-verification-prerequisites\n' + yaml.dump(commentWorkflow(file, directory.startsWith('.github')), { lineWidth: -1, noRefs: true }));
  }
  fs.writeFileSync(path.join('.github/workflows', RUNTIME), '# Generated by scripts/generate-native-verification-workflows.cjs\n' + yaml.dump(runtimeWorkflow(), { lineWidth: -1 }));
}

if (require.main === module) generate();
module.exports = { MAX_REQUESTS, ACTION, SOURCE_ACTION, CALLBACKS, RUNTIME, SELF_ACTION, REMOTE_WORKFLOW, SELF_WORKFLOW, SECRET_NAMES, BINDINGS, phaseSteps, renderSteps, commentWorkflow, runtimeWorkflow, generate };
