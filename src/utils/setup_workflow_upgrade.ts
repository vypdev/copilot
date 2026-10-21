import { dump, loadAll } from 'js-yaml';
import { isDeepStrictEqual } from 'node:util';
import type { SetupRunnerConfiguration } from '../domain/setup_runner';
import { selectedSetupRunsOn, setupRunnerRole, validateSetupRunners } from '../application/policies/setup_runner_policy';
import { ACTIONS } from '../data/model/action_types';
import { copilotCommentRunner, COPILOT_COMMENT_SELF_WORKFLOW, isCopilotCommentWorkflow } from '../domain/copilot_comment_workflow';

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const document = (value: string): Record<string, unknown> | undefined => {
  try {
    const documents = loadAll(value);
    if (documents.length > 1) throw new Error('Multiple documents');
    return object(documents[0]);
  }
  catch { throw new Error('Workflow YAML cannot be inspected; review the workflow separately.'); }
};
const labels = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0
  || Array.isArray(value) && value.length > 0 && value.every(label => typeof label === 'string' && label.trim().length > 0);
const runner = (value: unknown): boolean => labels(value) || !!object(value)
  && Object.keys(value as object).every(key => key === 'group' || key === 'labels')
  && Object.keys(value as object).length > 0
  && (object(value)!.group === undefined || typeof object(value)!.group === 'string' && labels(object(value)!.group))
  && (object(value)!.labels === undefined || labels(object(value)!.labels));
const copilotCommands = new Set<string>(Object.values(ACTIONS));
const callsRootAction = (jobs: Record<string, unknown> | undefined): boolean => !!jobs && Object.values(jobs).some(job => {
  if (object(job)?.uses === COPILOT_COMMENT_SELF_WORKFLOW) return true;
  const steps = object(job)?.steps;
  return Array.isArray(steps) && steps.some(step => {
    const invocation = object(step); const inputs = object(invocation?.with);
    if (invocation?.uses !== './' || !inputs) return false;
    return typeof inputs['issue-workflow-profile'] === 'string' && typeof inputs['agent-provider'] === 'string'
      || typeof inputs['single-action'] === 'string' && copilotCommands.has(inputs['single-action'])
      || (inputs['pr-approval-observer'] === 'true' || inputs['pr-approval-observer'] === true)
        && typeof inputs['pr-approval-policy'] === 'string';
  });
});

export function hasRootLocalSetupAction(content: string): boolean {
  return callsRootAction(object(document(content)?.jobs));
}

/** Source push workflows receive only owned namespace filters, retaining native jobs. */
export function isSourceSetupPushWorkflow(file: string): boolean {
  return ['copilot_commit.yml', 'copilot_branch_sync.yml'].includes(file);
}

/** Keep a target's reviewed execution location while upgrading controlled workflow templates. */
export function renderSetupWorkflowUpgrade(template: string, existing?: string,
  selection?: { readonly file: string; readonly runners?: SetupRunnerConfiguration; readonly source?: boolean }): string {
  const errors = validateSetupRunners(selection?.runners);
  if (errors.length) throw new Error(errors.join(' '));
  if (!selection && !existing) return template;
  const previous = existing ? document(existing) : undefined;
  if (!selection && previous?.jobs === undefined) return template;
  const previousJobs = previous?.jobs === undefined ? {} : object(previous.jobs);
  if (!previousJobs) throw new Error('Workflow jobs cannot be inspected; review the workflow separately.');
  if (selection?.source === true && existing !== undefined && previous?.jobs === undefined) {
    throw new Error('Source workflow jobs cannot be inspected; review the workflow separately.');
  }
  // A root-local Copilot invocation is source-repository infrastructure, including its
  // release jobs and native validation. Consumer templates cannot replace it.
  if (selection?.source === true && existing !== undefined || callsRootAction(previousJobs)) {
    const events = previous!.on;
    const hasPush = events === 'push' || Array.isArray(events) && events.includes('push')
      || !!object(events) && Object.prototype.hasOwnProperty.call(events, 'push');
    // Preserve native jobs while excluding disposable probes at push admission.
    // Branch Sync still observes installer and ordinary branches, including bot pushes.
    const exclusions = selection?.file === 'copilot_commit.yml' || object(previousJobs['copilot-commits'])
      ? ['!setup/copilot/**', '!copilot-permission-test-*']
      : selection?.file === 'copilot_branch_sync.yml' || object(previousJobs['branch-sync']) ? ['!copilot-permission-test-*'] : [];
    if (hasPush && exclusions.length > 0) {
      const push = object(object(events)?.push);
      if (!push || !Array.isArray(push.branches) || !push.branches.every(branch => typeof branch === 'string')) {
        throw new Error('Source Action push filters require separate workflow review before setup.');
      }
      const branches = [...push.branches.filter(branch => !exclusions.includes(branch)), ...exclusions];
      if (!isDeepStrictEqual(push.branches, branches)) {
        push.branches = branches;
        return dump(previous, { noRefs: true, lineWidth: -1 });
      }
    }
    return existing!;
  }
  const templateJobs = object(document(template)?.jobs);
  if (!previousJobs || !templateJobs) throw new Error('Workflow jobs cannot be inspected; review the workflow separately.');
  if (Object.values(templateJobs).some(job => isCopilotCommentWorkflow(object(job)?.uses))) {
    const parsed = document(template)!;
    const jobs = object(parsed.jobs)!;
    let changed = false;
    for (const [name, value] of Object.entries(jobs)) {
      const job = object(value)!;
      if (!isCopilotCommentWorkflow(job.uses)) throw new Error('Mixed comment workflow jobs require separate workflow review before setup.');
      const previousJob = object(previousJobs[name]);
      if (Array.isArray(previousJob?.steps) && previousJob.steps.some(raw => {
        const uses = object(raw)?.uses;
        return typeof uses !== 'string' || !(uses.startsWith('actions/checkout@')
          || /^vypdev\/copilot@[^\s]+$/u.test(uses) || uses === './.git/copilot-verification-setup');
      })) throw new Error('Custom comment job steps require migration to the reviewed repository verification setup action before switching to the reusable workflow. Review the workflow separately.');
      const retained = selectedSetupRunsOn(selection?.runners, selection && setupRunnerRole(selection.file, name))
        ?? copilotCommentRunner(previousJob) ?? copilotCommentRunner(job);
      if (!runner(retained)) throw new Error('Existing runner selection is invalid; review the workflow separately.');
      if (JSON.stringify(retained).includes('${{') && existing !== template) throw new Error('Dynamic runner selection requires separate workflow review before setup.');
      changed ||= !isDeepStrictEqual(retained, copilotCommentRunner(job));
      job.with = { ...object(job.with), 'runs-on': JSON.stringify(retained) };
    }
    return changed ? dump(parsed, { noRefs: true, lineWidth: -1 }) : template;
  }
  const lines = template.split('\n');
  let job = '';
  let insideJobs = false;
  for (let index = 0; index < lines.length; index++) {
    if (/^jobs:\s*$/u.test(lines[index])) { insideJobs = true; continue; }
    if (/^\S/u.test(lines[index])) insideJobs = false;
    if (!insideJobs) continue;
    const header = /^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/u.exec(lines[index]);
    if (header) job = header[1];
    if (!/^ {4}runs-on:/u.test(lines[index])) continue;
    const role = selection && setupRunnerRole(selection.file, job);
    const retained = selectedSetupRunsOn(selection?.runners, role)
      ?? object(previousJobs[job])?.['runs-on'];
    if (retained === undefined) continue;
    if (!runner(retained)) throw new Error('Existing runner selection is invalid; review the workflow separately.');
    // Expressions can depend on an existing matrix, inputs or other workflow fields
    // that a new template does not carry. Do not transplant a partial contract.
    if (JSON.stringify(retained).includes('${{') && existing !== template) throw new Error('Dynamic runner selection requires separate workflow review before setup.');
    if (isDeepStrictEqual(retained, object(templateJobs[job])?.['runs-on'])) continue;
    let end = index + 1;
    while (end < lines.length && (/^ {6}/u.test(lines[end]) || /^\s*$/u.test(lines[end]))) end++;
    const replacement = dump({ 'runs-on': retained }, { noRefs: true, lineWidth: -1 }).trimEnd().split('\n').map(line => `    ${line}`);
    lines.splice(index, end - index, ...replacement);
    index += replacement.length - 1;
  }
  const rendered = lines.join('\n');
  const actualJobs = object(document(rendered)?.jobs);
  for (const [name, value] of Object.entries(templateJobs)) {
    const retained = selectedSetupRunsOn(selection?.runners, selection && setupRunnerRole(selection.file, name))
      ?? object(previousJobs[name])?.['runs-on'];
    if (retained !== undefined && object(value)?.['runs-on'] !== undefined
      && !isDeepStrictEqual(object(actualJobs?.[name])?.['runs-on'], retained)) {
      throw new Error('Runner preservation could not be verified; review the workflow separately.');
    }
  }
  return rendered;
}
