import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { load, JSON_SCHEMA } from 'js-yaml';
import type { SetupInstallation, SetupInstalledWorkflow, SetupInstalledInput } from '../domain/setup_management';
import { redactSensitiveText } from '../domain/security/sensitive_text';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Reads bounded regular workflow files. No Secret expression/value crosses this adapter. */
export class SetupManagementWorkspaceAdapter {
  constructor(private readonly root: string, private readonly revision: () => string) {}

  inspect(): SetupInstallation {
    const workflows: SetupInstalledWorkflow[] = [];
    let unreadable = false;
    let localActionDigest: string | undefined;
    const directory = join(this.root, '.github', 'workflows');
    try {
      if (existsSync(directory)) {
        if (lstatSync(join(this.root, '.github')).isSymbolicLink() || lstatSync(directory).isSymbolicLink()) throw new Error('Linked workflow directory.');
        const files = readdirSync(directory).filter(file => /\.ya?ml$/u.test(file)).sort();
        if (files.length > 100) throw new Error('Workflow inventory exceeds its limit.');
        for (const file of files) {
          try {
            const path = join(directory, file);
            const stat = lstatSync(path);
            if (!stat.isFile() || stat.size > 262144) throw new Error('Unsafe workflow file.');
            const source = readFileSync(path, 'utf8');
            const document = object(load(source, { schema: JSON_SCHEMA }));
            for (const job of Object.values(object(document.jobs)).map(object)) {
              for (const step of Array.isArray(job.steps) ? job.steps.map(object) : []) {
                if (typeof step.uses !== 'string') continue;
                if (step.uses === './') {
                  const actionPath = join(this.root, 'action.yml');
                  if (!existsSync(actionPath)) continue;
                  const actionStat = lstatSync(actionPath);
                  if (!actionStat.isFile() || actionStat.size > 262144) throw new Error('Unsafe local Action metadata.');
                  const actionSource = readFileSync(actionPath, 'utf8');
                  const action = object(load(actionSource, { schema: JSON_SCHEMA }));
                  if (action.name !== 'Copilot - GitHub with super powers' || !object(action.inputs)['bugbot-comment-limit']) continue;
                  localActionDigest = createHash('sha256').update(actionSource).digest('hex');
                } else if (!/^vypdev\/copilot@[^\s]+$/iu.test(step.uses) || redactSensitiveText(step.uses) !== step.uses) continue;
                const inputs = Object.entries(object(step.with)).flatMap(([name, value]): SetupInstalledInput[] => {
                  if (/token|secret|password|api[-_]key/iu.test(name)) return [];
                  if (!['string', 'boolean', 'number'].includes(typeof value)) return [{ name, unsupported: true }];
                  const text = String(value);
                  if (text.length > 4096 || redactSensitiveText(text) !== text || /\bsecrets\./iu.test(text)) return [{ name, unsupported: true }];
                  const match = text.match(/^\$\{\{\s*vars\.([A-Z][A-Z0-9_]*)\s*(?:\|\|\s*'([^']*)')?\s*\}\}$/u);
                  return match ? [{ name, variable: match[1], ...(match[2] !== undefined ? { fallback: match[2] } : {}) }]
                    : text.includes('${{') ? [{ name, unsupported: true }] : [{ name, literal: text }];
                });
                workflows.push({ file, action: step.uses, digest: createHash('sha256').update(source).digest('hex'),
                  environmentScoped: job.environment !== undefined || [document.env, job.env, step.env].some(env => Object.keys(object(env)).some(key => key.startsWith('INPUT_'))), inputs });
              }
            }
          } catch { unreadable = true; }
        }
      }
    } catch { unreadable = true; }
    return { revision: this.revision(), workflows, guidancePresent: existsSync(join(this.root, '.copilot', 'repository-profile.json')), unreadable,
      ...(localActionDigest === undefined ? {} : { localActionDigest }) };
  }
}
