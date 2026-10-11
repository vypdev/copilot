import { doctorWorkflowCondition } from './doctor_workflow_condition_policy';
import { load, JSON_SCHEMA } from 'js-yaml';
import { parseIssueWorkflowProfile } from '../../domain/issue_workflow_profile';
import { decideIssueStart } from '../../domain/issue_start_policy';
import type { DoctorConfiguration, DoctorRepositoryRead, DoctorRepositoryPath } from '../ports/github_runtime_doctor_ports';

export function validDoctorConfiguration(value: DoctorConfiguration | undefined): value is DoctorConfiguration {
    if (!value || typeof value.preBranchSdd !== 'boolean' || typeof value.issueManagedBranches !== 'boolean'
        || !/^(?!-|.*(?:\.\.|[\s~^:?*[\]\\]))[A-Za-z0-9._/-]{1,200}$/u.test(value.dependencyBranch)) return false;
    try {
        if ('error' in parseIssueWorkflowProfile(JSON.stringify(value.profile))) return false;
        decideIssueStart({ labels: [], issueManagedBranches: value.issueManagedBranches, preBranchSdd: value.preBranchSdd });
        return true;
    } catch { return false; }
}

export function doctorRepositoryPrerequisites(read: DoctorRepositoryRead): 'pass' | 'blocked' | 'unavailable' {
    if (read.state !== 'available') return 'unavailable';
    const paths: readonly DoctorRepositoryPath[] = ['specs/catalog.json', 'specs/_template.md', 'specs/README.md'];
    if (paths.some(path => read.files[path]?.state !== 'present')) return 'blocked';
    const catalogFile = read.files['specs/catalog.json'];
    if (catalogFile.state !== 'present') return 'blocked';
    try {
        const catalog = object(JSON.parse(catalogFile.text));
        if (catalog.version !== 1 || !Array.isArray(catalog.capabilities)) return 'blocked';
        const ids = new Set<string>();
        for (const raw of catalog.capabilities) {
            const capability = object(raw);
            if (typeof capability.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(capability.id)
                || ids.has(capability.id) || !Array.isArray(capability.specs) || capability.specs.length === 0
                || capability.specs.some(path => typeof path !== 'string' || !/^specs\/[a-z0-9_-]+\.md$/u.test(path))) return 'blocked';
            ids.add(capability.id);
        }
        return paths.slice(1).every(path => {
            const file = read.files[path]; return file.state === 'present' && /^#\s+\S/mu.test(file.text);
        }) ? 'pass' : 'blocked';
    } catch { return 'blocked'; }
}

/** Structural evidence only. YAML is parsed with the JSON schema and never executed. */
export function doctorWorkflowContracts(read: DoctorRepositoryRead): 'pass' | 'blocked' | 'unavailable' {
    if (read.state !== 'available') return 'unavailable';
    const expected = [
        ['.github/workflows/copilot_issue.yml', 'issues'],
        ['.github/workflows/copilot_issue_comment.yml', 'issue_comment'],
        ['.github/workflows/copilot_pull_request.yml', 'pull_request'],
    ] as const;
    let unknown = false;
    try {
        for (const [path, event] of expected) {
            const file = read.files[path];
            if (file?.state !== 'present') return 'blocked';
            const document = object(load(file.text, { schema: JSON_SCHEMA }));
            const events = document.on;
            const admitted = typeof events === 'string' ? events === event : Array.isArray(events)
                ? events.includes(event) : Object.prototype.hasOwnProperty.call(object(events), event);
            if (!admitted) return 'blocked';
            const filter = object(object(events)[event]);
            if (Array.isArray(filter.types) && filter.types.length === 0) return 'blocked';
            let eligible = false;
            let possible = false;
            for (const rawJob of Object.values(object(document.jobs))) {
                const job = object(rawJob);
                const enabled = doctorWorkflowCondition(job.if, event);
                if (enabled === false || !Array.isArray(job.steps)) continue;
                for (const rawStep of job.steps) {
                    const step = object(rawStep);
                    if (!(step.uses === './' || typeof step.uses === 'string'
                        && /^vypdev\/copilot@[^\s${}<>]+$/iu.test(step.uses))) continue;
                    const stepEnabled = doctorWorkflowCondition(step.if, event);
                    if (stepEnabled === false) continue;
                    if (enabled === true && stepEnabled === true) eligible = true;
                    else possible = true;
                }
            }
            if (!eligible && !possible) return 'blocked';
            if (!eligible) unknown = true;
        }
        return unknown ? 'unavailable' : 'pass';
    } catch { return 'blocked'; }
}
function object(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
