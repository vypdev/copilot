import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { selectedSetupRunsOn, setupRunnerRole } from '../../application/policies/setup_runner_policy';
const { validateWorkflow } = require('../../../scripts/validate-workflow-contract.cjs');
const paths = ['.github/workflows/release_workflow.yml', '.github/workflows/hotfix_workflow.yml', 'setup/workflows/release_workflow.yml', 'setup/workflows/hotfix_workflow.yml'];
const read = (file: string): any => load(readFileSync(resolve(file), 'utf8'));
const runCondition = (expression: string, inputs: Record<string, unknown>, needs: any, cancelled = false) => runInNewContext(expression.slice(3, -3).replace(/needs\.([a-z-]+)/g, (_: string, name: string) => `needs['${name}']`).replace(/outputs\.([a-z-]+)/g, (_: string, name: string) => `outputs['${name}']`), { inputs, needs, cancelled: () => cancelled });
it.each(paths)('runs only the correct fresh/recovery/no-op phases in %s', file => {
  const workflow = read(file); const compiled = !!workflow.jobs['prepare-compiled-files']; const last = compiled ? 'prepare-compiled-files' : 'prepare-version-files';
  for (const mode of ['prepare', 'replace', 'publish', 'resume']) for (const preflightMode of ['prepare', 'recover', 'recorded']) {
    const needs = { validate: { result: 'success' }, 'candidate-preflight': { result: mode === 'replace' ? 'success' : 'skipped', outputs: { mode: preflightMode } },
      'prepare-version-files': { result: 'success', outputs: { 'candidate-sha': 'a'.repeat(40) } }, 'prepare-compiled-files': { result: 'success', outputs: { 'candidate-sha': 'a'.repeat(40) } } };
    const fresh = mode === 'prepare' || mode === 'replace' && preflightMode === 'prepare';
    expect(runCondition(workflow.jobs['prepare-version-files'].if, { mode }, needs)).toBe(fresh);
    if (compiled) expect(runCondition(workflow.jobs['prepare-compiled-files'].if, { mode }, needs)).toBe(fresh);
    expect(runCondition(workflow.jobs.promote.if, { mode }, needs)).toBe(fresh || mode === 'replace' && preflightMode === 'recover');
    expect(runCondition(workflow.jobs.promote.if, { mode }, needs, true)).toBe(false);
    needs.validate.result = 'failure'; expect(runCondition(workflow.jobs.promote.if, { mode }, needs)).toBe(false);
    needs.validate.result = 'success'; needs[last as keyof typeof needs].result = 'failure';
    expect(runCondition(workflow.jobs.promote.if, { mode }, needs)).toBe(mode === 'replace' && preflightMode === 'recover');
    needs[last as keyof typeof needs].result = 'skipped'; expect(runCondition(workflow.jobs.promote.if, { mode }, needs)).toBe(mode === 'replace' && preflightMode === 'recover');
    needs[last as 'prepare-version-files'].result = 'success'; needs[last as 'prepare-version-files'].outputs['candidate-sha'] = '';
    expect(runCondition(workflow.jobs.promote.if, { mode }, needs)).toBe(mode === 'prepare' || mode === 'replace' && preflightMode === 'recover');
  }
});
it.each(paths)('executes strict replace input validation in %s before credentials', file => {
  const script = read(file).jobs.validate.steps[0].with.script;
  const intent = { MODE: 'replace', OPERATION_ID: 'operation-previous', EXPECTED_REVISION: '3', SOURCE_SHA: 'a'.repeat(40), CONFIRM_UNPUBLISHED: 'true', VERSION: '1.5.2', ISSUE: '170', TITLE: '', CHANGELOG: '', REPLACEMENT_ENABLED: 'true' };
  for (const patch of [{}, { OPERATION_ID: '' }, { EXPECTED_REVISION: '0' }, { EXPECTED_REVISION: '9007199254740991' }, { SOURCE_SHA: 'short' }, { CONFIRM_UNPUBLISHED: 'false' }, { TITLE: 'changed' }, { CHANGELOG: 'changed' }, { MODE: 'prepare' }]) {
    const setFailed = jest.fn(); runInNewContext(script, { process: { env: { ...intent, ...patch } }, core: { setFailed } });
    expect(setFailed).toHaveBeenCalledTimes(Object.keys(patch).length ? 1 : 0);
  }
});
it.each(paths)('executes reviewed source guard and final native identity proof in %s', async file => {
  const job = read(file).jobs['prepare-version-files']; const guard = job.steps.find((step: any) => step.name === 'Verify reviewed replacement source');
  const candidate = 'a'.repeat(40); const execFileSync = jest.fn(() => candidate); const setFailed = jest.fn();
  for (const expected of [candidate, 'b'.repeat(40), '', 'short']) {
    setFailed.mockClear(); runInNewContext(guard.with.script, { require: () => ({ execFileSync }), process: { env: { EXPECTED_SHA: expected } }, core: { setFailed } }); expect(setFailed).toHaveBeenCalledTimes(expected === candidate ? 0 : 1);
  }
  const proof = job.steps.at(-1); const setOutput = jest.fn();
  const getRef = jest.fn().mockResolvedValue({ data: { object: { type: 'commit', sha: candidate } } });
  execFileSync.mockImplementation((_command?: unknown, args?: unknown) => (args as string[])[0] === 'rev-parse' ? candidate : '');
  const invoke = (env: any) => runInNewContext('(async () => {' + proof.with.script + '})()', { require: () => ({ execFileSync }), github: { rest: { git: { getRef } } }, context: { repo: { owner: 'owner', repo: 'project' } }, process: { env }, core: { setOutput } });
  await invoke({ SOURCE_BRANCH: 'release/1.5.2', VERIFICATION_RESULT: 'success' }); expect(setOutput).toHaveBeenCalledWith('candidate-sha', candidate);
  setOutput.mockClear(); getRef.mockResolvedValue({ data: { object: { type: 'commit', sha: 'b'.repeat(40) } } });
  await expect(invoke({ SOURCE_BRANCH: 'release/1.5.2', VERIFICATION_RESULT: 'success' })).rejects.toThrow('source moved'); expect(setOutput).not.toHaveBeenCalled();
  execFileSync.mockReturnValue('dirty'); await expect(invoke({ SOURCE_BRANCH: 'release/1.5.2', VERIFICATION_RESULT: 'success' })).rejects.toThrow('exact clean commit');
  if (file.startsWith('setup/')) await expect(invoke({ SOURCE_BRANCH: 'release/1.5.2', VERIFICATION_RESULT: 'skipped' })).rejects.toThrow('verification was not confirmed');
});
const mutations: [string, (w: any) => void][] = [
  ['candidate controls preflight code', w => { if (w.jobs['candidate-preflight'].steps.length > 1) w.jobs['candidate-preflight'].steps[0].with.ref = '${{ inputs.source-sha }}'; else w.jobs['candidate-preflight'].steps[0].uses = './deployment-recovery'; }],
  ['write authority', w => w.jobs['candidate-preflight'].permissions.contents = 'write'],
  ['mutable preflight runtime', w => w.jobs['candidate-preflight'].steps.at(-1).uses = './'],
  ['preflight bypass', w => w.jobs['candidate-preflight'].steps.at(-1)['continue-on-error'] = true],
  ['source guard missing', w => w.jobs['prepare-version-files'].steps.splice(1, 1)],
  ['source proof fallback', w => w.jobs.promote.steps.at(-1).with['single-action-candidate-sha'] = '${{ inputs.source-sha }}'],
  ['changed policy', w => w.jobs.promote.steps.at(-1).with['reconciliation-cleanup'] = 'none'],
  ['ignored full validation', w => { const job = w.jobs['prepare-compiled-files'] ?? w.jobs['prepare-version-files']; job.steps.find((s: any) => s.id === 'replacement-verification')['continue-on-error'] = true; }],
  ['identity before push', w => { const job = w.jobs['prepare-version-files']; job.steps.unshift(job.steps.pop()); }],
  ['all-phase mutation', w => w.jobs.promote.if = '${{ !cancelled() }}'],
];
it.each(paths.flatMap(file => mutations.map(([reason, mutate]) => [file, reason, mutate] as const)))('rejects %s replacement bypass: %s', (file, _reason, mutate) => {
  const workflow = read(file); mutate(workflow); expect(() => validateWorkflow(resolve(file), workflow)).toThrow();
});
it.each(['release_workflow.yml', 'hotfix_workflow.yml'])('keeps %s preflight fixed hosted under every supported runner choice', file => {
  expect(setupRunnerRole(file, 'candidate-preflight')).toBe('isolated');
  expect(selectedSetupRunsOn({ mode: 'hosted', profileId: '', group: '', labels: [], validation: 'hosted' }, setupRunnerRole(file, 'candidate-preflight'))).toBeUndefined();
  expect(selectedSetupRunsOn({ mode: 'retain', profileId: '', group: '', labels: [], validation: 'hosted' }, setupRunnerRole(file, 'candidate-preflight'))).toBeUndefined();
});

it.each(['.github/workflows/release_workflow.yml', '.github/workflows/hotfix_workflow.yml'])('loads the preflight runtime only from the GitHub workflow revision in %s', file => {
  const job = read(file).jobs['candidate-preflight'];
  expect(job.steps[0].with.ref).toBe('${{ github.workflow_sha }}');
  expect(job.steps.at(-1).with['source-sha']).toBe('${{ inputs.source-sha }}');
  expect(JSON.stringify(job.steps[0])).not.toContain('inputs.source-sha');
});
it.each(['setup/workflows/release_workflow.yml', 'setup/workflows/hotfix_workflow.yml'])('does not expose unconfigured candidate replacement in %s', file => {
  const workflow = read(file); expect(workflow.on.workflow_dispatch.inputs.mode.options).not.toContain('replace');
  const step = workflow.jobs.validate.steps[0]; expect(step.env.REPLACEMENT_ENABLED).toBe('false');
  const setFailed = jest.fn(); runInNewContext(step.with.script, { process: { env: { MODE: 'replace', OPERATION_ID: 'operation-previous', EXPECTED_REVISION: '3', SOURCE_SHA: 'a'.repeat(40), CONFIRM_UNPUBLISHED: 'true', VERSION: '1.5.2', ISSUE: '170', TITLE: '', CHANGELOG: '', REPLACEMENT_ENABLED: 'false' } }, core: { setFailed } });
  expect(setFailed).toHaveBeenCalledWith(expect.stringContaining('disabled'));
});
