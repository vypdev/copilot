'use strict';
const phaseCondition = (job, compiled) => {
  const last = compiled ? 'prepare-compiled-files' : 'prepare-version-files';
  if (job === 'promote') return "${{ !cancelled() && needs.validate.result == 'success' && ((inputs.mode == 'prepare' && needs." + last + ".result == 'success') || (inputs.mode == 'replace' && needs.candidate-preflight.result == 'success' && ((needs.candidate-preflight.outputs.mode == 'prepare' && needs." + last + ".result == 'success' && needs." + last + ".outputs.candidate-sha != '') || needs.candidate-preflight.outputs.mode == 'recover'))) }}";
  const base = "!cancelled() && needs.validate.result == 'success' && (inputs.mode == 'prepare' || (inputs.mode == 'replace' && needs.candidate-preflight.result == 'success' && needs.candidate-preflight.outputs.mode == 'prepare'))";
  return '${{ ' + base + (job === 'prepare-compiled-files' ? " && needs.prepare-version-files.result == 'success'" : '') + ' }}';
};
function assertReplacementContract(file, workflow) {
  const fail = message => { throw new Error(`${file} candidate replacement ${message}.`); };
  const jobs = workflow.jobs; const compiled = !!jobs['prepare-compiled-files']; const setup = file.startsWith('setup/');
  const inputs = workflow.on.workflow_dispatch.inputs;
  if (JSON.stringify(inputs.mode?.options) !== JSON.stringify(setup ? ['prepare', 'publish', 'resume'] : ['prepare', 'replace', 'publish', 'resume'])
    || inputs['confirm-unpublished']?.type !== 'boolean' || inputs['confirm-unpublished']?.default !== false
    || !inputs['expected-revision'] || !inputs['source-sha']
    || jobs.validate.steps[0].env.REPLACEMENT_ENABLED !== (setup ? 'false' : 'true')) fail('requires explicit bounded workflow inputs');
  const preflight = jobs['candidate-preflight'];
  if (!preflight || preflight.name !== 'Inspect unpublished candidate replacement' || preflight.if !== "${{ inputs.mode == 'replace' }}"
    || preflight.needs !== 'validate' || preflight['runs-on'] !== 'ubuntu-latest' || preflight['timeout-minutes'] !== 5
    || JSON.stringify(preflight.permissions) !== JSON.stringify({ contents: 'read', issues: 'read', 'pull-requests': 'read', actions: 'read' })
    || preflight.env !== undefined || Object.hasOwn(preflight, 'continue-on-error')) fail('requires a fixed read-only native preflight');
  const steps = preflight.steps ?? []; const inspect = steps.at(-1);
  const expectedInputs = { issue: '${{ inputs.issue }}', 'operation-id': '${{ inputs.operation-id }}', 'expected-revision': '${{ inputs.expected-revision }}',
    version: '${{ inputs.version }}', 'source-sha': '${{ inputs.source-sha }}', 'confirm-unpublished': '${{ inputs.confirm-unpublished }}',
    'issue-workflow-profile': "${{ vars.COPILOT_ISSUE_WORKFLOW_PROFILE || '' }}", 'release-label': 'release', 'hotfix-label': 'hotfix',
    'repository-locale': "${{ vars.REPOSITORY_LOCALE || 'en-US' }}", token: '${{ secrets.PAT }}' };
  if (steps.length !== (setup ? 1 : 2) || inspect?.name !== 'Read native candidate authority' || inspect.id !== 'inspect'
    || inspect.uses !== (setup ? 'vypdev/copilot/deployment-recovery@v3' : './deployment-recovery')
    || JSON.stringify(inspect.with) !== JSON.stringify(expectedInputs)
    || steps.some(step => step.if !== undefined || step.run !== undefined || step.env !== undefined || Object.hasOwn(step, 'continue-on-error'))
    || (!setup && (steps[0].uses !== 'actions/checkout@v5' || steps[0].with?.ref !== '${{ github.workflow_sha }}' || steps[0].with?.['persist-credentials'] !== false))) fail('must bind the standalone read-only entrypoint to native intent');
  const outputKeys = ['mode', 'source-branch', 'candidate-sha', 'production-base-sha', 'operation-id', 'expected-revision'];
  if (Object.keys(preflight.outputs ?? {}).length !== outputKeys.length || outputKeys.some(key => preflight.outputs[key] !== '${{ steps.inspect.outputs.' + key + ' }}')) fail('must expose only native preflight proofs');
  const last = compiled ? 'prepare-compiled-files' : 'prepare-version-files';
  for (const id of ['prepare-version-files', ...(compiled ? ['prepare-compiled-files'] : [])]) {
    const job = jobs[id]; const guard = job.steps.find(step => step.name === 'Verify reviewed replacement source');
    const identity = job.steps.find(step => step.id === 'candidate-identity');
    const checkout = job.steps[0]; const expected = id === 'prepare-version-files' ? '${{ inputs.source-sha }}' : '${{ needs.prepare-version-files.outputs.candidate-sha }}';
    if (checkout.with?.ref !== '${{ needs.candidate-preflight.outputs.source-branch || github.ref }}'
      || guard?.if !== "${{ inputs.mode == 'replace' }}" || guard.uses !== 'actions/github-script@v9' || guard.env?.EXPECTED_SHA !== expected
      || !String(guard.with?.script).includes('current !== process.env.EXPECTED_SHA') || job.steps.indexOf(guard) !== 1) fail('must pin reviewed source before preparation');
    if (job.outputs?.['candidate-sha'] !== '${{ steps.candidate-identity.outputs.candidate-sha }}'
      || identity?.if !== "${{ inputs.mode == 'replace' }}" || identity.name !== 'Confirm prepared replacement identity'
      || identity.uses !== 'actions/github-script@v9' || identity.env?.SOURCE_BRANCH !== '${{ needs.candidate-preflight.outputs.source-branch }}'
      || identity !== job.steps.at(-1) || !String(identity.with?.script).includes('response.data.object.sha !== candidate')
      || !String(identity.with?.script).includes("['status', '--porcelain']") || !String(identity.with?.script).includes("core.setOutput('candidate-sha', candidate)")) fail('must identify the exact clean validated candidate after the normal push');
  }
  const full = jobs[last]; const verification = full.steps.find(step => step.id === 'replacement-verification');
  if (verification?.name !== 'Complete fresh replacement verification' || verification.if !== "${{ inputs.mode == 'replace' }}"
    || !verification.run || Object.hasOwn(verification, 'continue-on-error')
    || full.steps.indexOf(verification) >= full.steps.findIndex(step => String(step.uses).startsWith('EndBug/add-and-commit@'))
    || full.steps.at(-1).env?.VERIFICATION_RESULT !== '${{ steps.replacement-verification.outcome }}'
    || !String(full.steps.at(-1).with?.script).includes("process.env.VERIFICATION_RESULT !== 'success'")) fail('must require complete project verification before candidate identity');
  const promotion = jobs.promote;
  const replace = promotion.steps.find(step => step.with?.['single-action'] === 'replace_deployment_action');
  const normal = promotion.steps.find(step => step.with?.['single-action'] === 'prepare_deployment_action');
  const proof = "${{ needs.candidate-preflight.outputs.mode == 'recover' && needs.candidate-preflight.outputs.candidate-sha || needs." + last + '.outputs.candidate-sha }}';
  const expectedProofs = { 'single-action-operation-id': '${{ needs.candidate-preflight.outputs.operation-id }}', 'single-action-expected-revision': '${{ needs.candidate-preflight.outputs.expected-revision }}',
    'single-action-reviewed-source-sha': '${{ inputs.source-sha }}', 'single-action-candidate-sha': proof,
    'single-action-production-base-sha': '${{ needs.candidate-preflight.outputs.production-base-sha }}', 'single-action-confirm-unpublished': '${{ inputs.confirm-unpublished }}' };
  if (replace?.if !== "${{ inputs.mode == 'replace' }}" || normal?.if !== "${{ inputs.mode == 'prepare' }}"
    || replace.with?.token !== '${{ secrets.PAT }}' || Object.entries(expectedProofs).some(([key, value]) => replace.with[key] !== value)
    || Object.entries(normal.with).some(([key, value]) => !['single-action'].includes(key) && replace.with[key] !== value)
    || promotion.steps.filter(step => step.with?.['single-action'] === 'replace_deployment_action').length !== 1
    || promotion.steps[0].with?.ref !== "${{ inputs.mode == 'replace' && (needs.candidate-preflight.outputs.mode == 'recover' && needs.candidate-preflight.outputs.candidate-sha || needs." + last + '.outputs.candidate-sha) || github.ref }}') fail('must bind replacement to the fresh producer output or recorded recovery');
}
module.exports = { phaseCondition, assertReplacementContract };
