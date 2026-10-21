const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const contract = require('./generate-native-verification-workflows.cjs');
const { copilotCommentRunner, isCopilotCommentRunner } = require('../src/domain/copilot_comment_workflow.ts');

function assertCommentWorkflowCaller(file, workflow) {
  const source = !file.replaceAll(path.sep, '/').includes('/setup/workflows/');
  const expected = contract.commentWorkflow(path.basename(file), source);
  const expectedJob = Object.values(expected.jobs)[0];
  const actualJob = Object.values(workflow.jobs ?? {})[0];
  let route;
  try { route = copilotCommentRunner(actualJob); } catch { /* Fixed contract error below. */ }
  if (!isCopilotCommentRunner(route)) throw new Error(`${file} native comment runner must be reviewed literal JSON.`);
  if (source) {
    const labels = typeof route === 'string' || Array.isArray(route) ? route : route.labels;
    if (!Array.isArray(labels) || !['self-hosted', 'codex'].every(label => labels.includes(label))) throw new Error(`${file} native source comment caller must retain its self-hosted codex role.`);
  }
  expectedJob.with['runs-on'] = actualJob.with['runs-on'];
  if (actualJob?.if !== expectedJob.if) {
    throw new Error(`${file} native comment caller must keep its required bot actor and same-repository PR gate.`);
  }
  if (!isDeepStrictEqual(workflow, expected)) {
    throw new Error(`${file} must pass consistent policy to the native comment coordinator, retaining only its event, bot/fork gate, reviewed runner, scoped Secrets and least-privilege permissions.`);
  }
}

function assertCommentWorkflowRuntime(file, workflow) {
  if (!isDeepStrictEqual(workflow, contract.runtimeWorkflow())) {
    throw new Error(`${file} must retain the canonical native comment runtime: same-commit Action, input bindings, isolated setup/continue/finish steps, timeout and cleanup.`);
  }
}

module.exports = { assertCommentWorkflowCaller, assertCommentWorkflowRuntime };
