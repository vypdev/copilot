import { dump, loadAll } from 'js-yaml';
import { isDeepStrictEqual } from 'node:util';

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

/** Keep a target's reviewed execution location while upgrading controlled workflow templates. */
export function renderSetupWorkflowUpgrade(template: string, existing?: string): string {
  if (!existing) return template;
  const previous = document(existing);
  if (previous?.jobs === undefined) return template;
  const previousJobs = object(previous.jobs);
  // A root-local Action is source-repository infrastructure, including its
  // release jobs and native validation. Consumer templates cannot replace it.
  if (previousJobs && Object.values(previousJobs).some(job => {
    const steps = object(job)?.steps;
    return Array.isArray(steps) && steps.some(step => object(step)?.uses === './');
  })) {
    const events = previous.on;
    const hasPush = events === 'push' || Array.isArray(events) && events.includes('push')
      || !!object(events) && Object.prototype.hasOwnProperty.call(events, 'push');
    if (hasPush) {
      const push = object(object(events)?.push);
      if (!push || !Array.isArray(push.branches) || !push.branches.every(branch => typeof branch === 'string')) {
        throw new Error('Source Action push filters require separate workflow review before setup.');
      }
      if (!push.branches.includes('!setup/copilot/**')) {
        push.branches.push('!setup/copilot/**');
        return dump(previous, { noRefs: true, lineWidth: -1 });
      }
    }
    return existing;
  }
  const templateJobs = object(document(template)?.jobs);
  if (!previousJobs || !templateJobs) throw new Error('Workflow jobs cannot be inspected; review the workflow separately.');
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
    const retained = object(previousJobs[job])?.['runs-on'];
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
    const retained = object(previousJobs[name])?.['runs-on'];
    if (retained !== undefined && object(value)?.['runs-on'] !== undefined
      && !isDeepStrictEqual(object(actualJobs?.[name])?.['runs-on'], retained)) {
      throw new Error('Runner preservation could not be verified; review the workflow separately.');
    }
  }
  return rendered;
}
