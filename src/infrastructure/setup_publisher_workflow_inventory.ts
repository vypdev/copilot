import { JSON_SCHEMA, load } from 'js-yaml';
import type { SetupPublisherInspection, SetupPublisherObservedFile } from '../domain/setup_publisher_installation';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../domain/setup_publisher_installation';
import type { SetupPublisherInventoryReviewFact } from '../domain/setup_publisher_inventory_review';

type Classification = SetupPublisherInspection['installation']['publisher'];
type Meaning = 'ordinary' | 'publisher' | 'unknown';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Parse workflow structure; comments and display names never establish publisher absence. */
export function inspectSetupPublisherWorkflows(files: readonly SetupPublisherObservedFile[], expected: string,
  reviewed?: SetupPublisherInventoryReviewFact): Classification {
  const foreign: string[] = [], unknown: string[] = [], exact: string[] = [];
  for (const file of files) {
    if (file.path.toLowerCase() === SETUP_PUBLISHER_WORKFLOW_PATH.toLowerCase()) {
      (file.path === SETUP_PUBLISHER_WORKFLOW_PATH && file.mode === '100644' && file.content === expected ? exact : foreign).push(file.path);
      continue;
    }
    const kind = meaning(file.content);
    if (kind === 'publisher') foreign.push(file.path);
    if (kind === 'unknown') unknown.push(file.path);
  }
  const result = (kind: Classification['kind'], paths: string[]): Classification => ({ kind, paths: Object.freeze(paths.sort()) });
  if (foreign.length) return result('foreign', [...foreign, ...exact]);
  if (reviewed) {
    const paths = [...files.map(file => file.path)].sort();
    // The authenticated adapter owns authority; this final classification also
    // requires a complete supported disposition set. Positive conflicts above
    // retain priority over an independently approved claim.
    if (reviewed.workflows.length === paths.length && reviewed.workflows.every((workflow, i) => workflow.path === paths[i]
      && ['non-producer', 'serialized-producer'].includes(workflow.disposition))) return exact.length ? result('exact', exact) : result('absent', []);
  }
  if (unknown.length) return result('unknown', [...unknown, ...exact]);
  return exact.length ? result('exact', exact) : result('absent', []);
}

function meaning(content: string): Meaning {
  if (Buffer.byteLength(content, 'utf8') > 100_000 || content.includes('\0')) return 'unknown';
  try {
    const document: unknown = load(content, { schema: JSON_SCHEMA });
    if (!object(document) || !object(document.jobs) || !Object.keys(document.jobs).length
      || Object.values(document.jobs).some(job => !object(job) || !Array.isArray(job.steps) && typeof job.uses !== 'string')) return 'unknown';
    let nodes = 0;
    const stack = new Set<object>();
    const visit = (value: unknown, depth: number): void => {
      if (++nodes > 10_000 || depth > 64) throw new Error('Unsupported workflow structure.');
      if (value === null || typeof value !== 'object') return;
      if (stack.has(value)) throw new Error('Cyclic workflow.');
      stack.add(value);
      if (Array.isArray(value)) value.forEach(child => visit(child, depth + 1));
      else Object.values(value).forEach(child => visit(child, depth + 1));
      stack.delete(value);
    };
    visit(document, 0);
    let publisher = false, unknown = false;
    const own = (scope: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(scope, key);
    const environment = (scope: Record<string, unknown>): void => {
      if (!own(scope, 'env')) return;
      if (!object(scope.env)) unknown = true;
      // Windows environment lookups are case-insensitive. Runner expressions
      // may select Windows, so every case variant remains a publisher marker.
      else if (Object.keys(scope.env).some(key => key.toUpperCase() === 'COPILOT_BUGBOT_STATUS_CARD_WORKFLOW')) publisher = true;
    };
    const execution = (scope: Record<string, unknown>, step: boolean): void => {
      environment(scope);
      if (own(scope, 'uses')) {
        if (typeof scope.uses !== 'string' || scope.uses.includes('${{')) unknown = true;
        else if (/(?:^|\/)copilot_bugbot_status_card\.ya?ml(?:@|$)/iu.test(scope.uses)) publisher = true;
        // No local/remote action or reusable implementation is resolved here.
        // A ref pin establishes identity, never absence of publisher behavior.
        else unknown = true;
      }
      if (own(scope, 'with')) {
        if (!object(scope.with)) unknown = true;
        else if (own(scope.with, 'single-action')) {
          const selected = scope.with['single-action'];
          if (typeof selected !== 'string' || selected.includes('${{')) unknown = true;
          else if (selected === 'publish_bugbot_status_card_action') publisher = true;
        }
      }
      if (step && own(scope, 'run')) {
        if (typeof scope.run !== 'string') unknown = true;
        else if (/COPILOT_BUGBOT_STATUS_CARD_WORKFLOW|publish_bugbot_status_card_action/iu.test(scope.run)) publisher = true;
        // A script may invoke a publisher indirectly or construct its marker.
        // Literal marker absence cannot establish executable behavior absence.
        else unknown = true;
      }
    };
    environment(document);
    for (const value of Object.values(document.jobs)) {
      const job = value as Record<string, unknown>;
      execution(job, false);
      if (own(job, 'steps')) {
        if (!Array.isArray(job.steps) || job.steps.some(step => !object(step))) unknown = true;
        else job.steps.forEach(step => execution(step as Record<string, unknown>, true));
      }
    }
    return publisher ? 'publisher' : unknown ? 'unknown' : 'ordinary';
  } catch { return 'unknown'; }
}
