import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { load, JSON_SCHEMA } from 'js-yaml';
import type { SetupInstallation, SetupInstalledWorkflow, SetupInstalledInput } from '../domain/setup_management';
import { redactSensitiveText } from '../domain/security/sensitive_text';

type Document = Record<string, unknown>;
type WorkflowStep = { job: Document; step: Document };
const object = (value: unknown): Document => value && typeof value === 'object' && !Array.isArray(value) ? value as Document : {};
const digest = (source: string) => createHash('sha256').update(source).digest('hex');

function readDocument(path: string): { source: string; document: Document } {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 262144) throw new Error('Unsafe YAML file.');
  const source = readFileSync(path, 'utf8');
  return { source, document: object(load(source, { schema: JSON_SCHEMA })) };
}

function workflowSteps(document: Document): WorkflowStep[] {
  return Object.values(object(document.jobs)).map(object).flatMap(job => {
    const steps = Array.isArray(job.steps) ? job.steps.map(object) : [];
    return steps.map(step => ({ job, step }));
  });
}

function installedInput(name: string, value: unknown): SetupInstalledInput[] {
  if (/token|secret|password|api[-_]key/iu.test(name)) return [];
  if (!['string', 'boolean', 'number'].includes(typeof value)) return [{ name, unsupported: true }];
  const text = String(value);
  if (text.length > 4096 || redactSensitiveText(text) !== text || /\bsecrets\./iu.test(text)) return [{ name, unsupported: true }];
  const match = text.match(/^\$\{\{\s*vars\.([A-Z][A-Z0-9_]*)\s*(?:\|\|\s*'([^']*)')?\s*\}\}$/u);
  if (match) return [{ name, variable: match[1], ...(match[2] !== undefined ? { fallback: match[2] } : {}) }];
  return text.includes('${{') ? [{ name, unsupported: true }] : [{ name, literal: text }];
}

function environmentScoped(document: Document, job: Document, step: Document): boolean {
  return job.environment !== undefined || [document.env, job.env, step.env]
    .some(env => Object.keys(object(env)).some(key => key.startsWith('INPUT_')));
}

/** Reads bounded regular workflow files. No Secret expression/value crosses this adapter. */
export class SetupManagementWorkspaceAdapter {
  constructor(private readonly root: string, private readonly revision: () => string) {}

  inspect(): SetupInstallation {
    let workflows: SetupInstalledWorkflow[] = [];
    let unreadable: boolean;
    let localActionDigest: string | undefined;
    const metadata = new Map<string, string | undefined>();
    const localAction = () => {
      if (!metadata.has('action')) metadata.set('action', this.localActionDigest());
      localActionDigest = metadata.get('action');
      return localActionDigest;
    };
    try {
      const inspections = this.workflowFiles().map(file => this.inspectWorkflowSafely(file, localAction));
      workflows = inspections.flatMap(result => result.workflows);
      unreadable = inspections.some(result => result.unreadable);
    } catch { unreadable = true; }
    return { revision: this.revision(), workflows, guidancePresent: existsSync(join(this.root, '.copilot', 'repository-profile.json')), unreadable,
      ...(localActionDigest === undefined ? {} : { localActionDigest }) };
  }

  private workflowFiles(): string[] {
    const directory = join(this.root, '.github', 'workflows');
    if (!existsSync(directory)) return [];
    if (lstatSync(join(this.root, '.github')).isSymbolicLink() || lstatSync(directory).isSymbolicLink()) throw new Error('Linked workflow directory.');
    const files = readdirSync(directory).filter(file => /\.ya?ml$/u.test(file)).sort();
    if (files.length > 100) throw new Error('Workflow inventory exceeds its limit.');
    return files;
  }

  private localActionDigest(): string | undefined {
    const path = join(this.root, 'action.yml');
    if (!existsSync(path)) return;
    const { source, document } = readDocument(path);
    if (document.name === 'Copilot - GitHub with super powers' && object(document.inputs)['bugbot-comment-limit']) return digest(source);
  }

  private inspectWorkflowSafely(file: string, localAction: () => string | undefined) {
    try { return { workflows: this.inspectWorkflow(file, localAction), unreadable: false }; }
    catch { return { workflows: [], unreadable: true }; }
  }

  private inspectWorkflow(file: string, localAction: () => string | undefined): SetupInstalledWorkflow[] {
    const { source, document } = readDocument(join(this.root, '.github', 'workflows', file));
    const steps = workflowSteps(document);
    const knownLocalAction = steps.some(({ step }) => step.uses === './') ? Boolean(localAction()) : false;
    return steps.flatMap(({ job, step }) => {
      if (!this.isCopilotStep(step, knownLocalAction)) return [];
      const inputs = Object.entries(object(step.with)).flatMap(([name, value]) => installedInput(name, value));
      return [{ file, action: step.uses as string, digest: digest(source), environmentScoped: environmentScoped(document, job, step), inputs }];
    });
  }

  private isCopilotStep(step: Document, knownLocalAction: boolean): boolean {
    if (typeof step.uses !== 'string') return false;
    if (step.uses === './') return knownLocalAction;
    return /^vypdev\/copilot@[^\s]+$/iu.test(step.uses) && redactSensitiveText(step.uses) === step.uses;
  }
}
