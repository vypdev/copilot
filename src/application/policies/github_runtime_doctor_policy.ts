import { doctorWorkflowMatrix } from './doctor_workflow_matrix_policy';
import { isDoctorBranchReference } from '../../domain/github_runtime_doctor';
import { doctorWorkflowCondition } from './doctor_workflow_condition_policy';
import { load, JSON_SCHEMA } from 'js-yaml';
import { parseIssueWorkflowProfile } from '../../domain/issue_workflow_profile';
import { decideIssueStart } from '../../domain/issue_start_policy';
import type { DoctorConfiguration, DoctorRepositoryRead, DoctorRepositoryPath } from '../ports/github_runtime_doctor_ports';

export function validDoctorConfiguration(value: DoctorConfiguration | undefined): value is DoctorConfiguration {
    if (!value || typeof value.preBranchSdd !== 'boolean' || typeof value.issueManagedBranches !== 'boolean'
        || !isDoctorBranchReference(value.dependencyBranch)) return false;
    try {
        if ('error' in parseIssueWorkflowProfile(JSON.stringify(value.profile))) return false;
        decideIssueStart({ labels: [], issueManagedBranches: value.issueManagedBranches, preBranchSdd: value.preBranchSdd });
        return true;
    } catch { return false; }
}

export function doctorRepositoryPrerequisites(read: DoctorRepositoryRead): 'pass' | 'blocked' | 'unavailable' {
    if (read.state !== 'available') return 'unavailable';
    const paths: readonly DoctorRepositoryPath[] = ['specs/catalog.json', 'specs/_template.md', 'specs/README.md'];
    if (!completeFileSamples(read, paths) || !Array.isArray(read.trackedFiles) || read.trackedFiles.some(path => typeof path !== 'string')) return 'unavailable';
    if (paths.some(path => read.files[path].state !== 'present')) return 'blocked';
    const catalogFile = read.files['specs/catalog.json'];
    if (catalogFile.state !== 'present') return 'blocked';
    try {
        const catalog = object(JSON.parse(catalogFile.text));
        if (catalog.version !== 1 || !Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) return 'blocked';
        const files = new Set(read.trackedFiles);
        const ids = new Set<string>(), titles = new Set<string>(), specs = new Set<string>();
        for (const raw of catalog.capabilities) {
            const capability = object(raw);
            if (['id', 'title', 'status', 'scope', 'owner', 'lastVerified'].some(field =>
                typeof capability[field] !== 'string' || !capability[field].trim())) return 'blocked';
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(String(capability.id))
                || ids.has(String(capability.id)) || titles.has(String(capability.title))
                || !['as-built-baseline', 'implemented', 'proposed', 'deprecated'].includes(String(capability.status))
                || !validCatalogDate(String(capability.lastVerified))) return 'blocked';
            ids.add(String(capability.id)); titles.add(String(capability.title));
            for (const field of ['specs', 'workflows', 'entrypoints', 'code', 'tests', 'documentation']) {
                const entries = capability[field];
                if (!Array.isArray(entries) || (field !== 'workflows' && entries.length === 0)
                    || new Set(entries).size !== entries.length) return 'blocked';
                for (const path of entries) {
                    if (!validCatalogPath(field, path) || !files.has(path)) return 'blocked';
                    if (field === 'specs') {
                        if (specs.has(path)) return 'blocked';
                        specs.add(path);
                    }
                }
            }
        }
        const standardDocuments = new Set(['specs/README.md', 'specs/_template.md', 'specs/CATALOG.md']);
        if (read.trackedFiles.some(path => /^specs\/.+\.md$/u.test(path) && !standardDocuments.has(path) && !specs.has(path))) return 'blocked';
        return paths.slice(1).every(path => {
            const file = read.files[path]; return file.state === 'present' && /^#\s+\S/mu.test(file.text);
        }) ? 'pass' : 'blocked';
    } catch { return 'blocked'; }
}

/** Structural evidence only. YAML is parsed with the JSON schema and never executed. */
export function doctorWorkflowContracts(read: DoctorRepositoryRead): 'pass' | 'blocked' | 'unavailable' {
    if (read.state !== 'available') return 'unavailable';
    const expected = [
        ['.github/workflows/copilot_issue.yml', 'issues', 'labeled'],
        ['.github/workflows/copilot_issue_comment.yml', 'issue_comment', 'created'],
        ['.github/workflows/copilot_pull_request.yml', 'pull_request', 'opened'],
    ] as const;
    if (!completeFileSamples(read, expected.map(([path]) => path))) return 'unavailable';
    let unknown = false;
    try {
        for (const [path, event, activity] of expected) {
            const file = read.files[path];
            if (file?.state !== 'present') return 'blocked';
            const document = object(load(file.text, { schema: JSON_SCHEMA }));
            const events = document.on;
            const admitted = typeof events === 'string' ? events === event : Array.isArray(events)
                ? events.includes(event) : Object.prototype.hasOwnProperty.call(object(events), event);
            if (!admitted) return 'blocked';
            const filter = object(object(events)[event]);
            if (Object.prototype.hasOwnProperty.call(filter, 'types')
                && (!Array.isArray(filter.types) || filter.types.length === 0
                    || filter.types.some(type => typeof type !== 'string' || type.length === 0)
                    || !filter.types.includes(activity))) return 'blocked';
            let eligible = false;
            let possible = false;
            const jobs = object(document.jobs);
            for (const rawJob of Object.values(jobs)) {
                const job = object(rawJob);
                const enabled = doctorWorkflowCondition(job.if, event);
                if (enabled === false || !Array.isArray(job.steps)) continue;
                const matrixEnabled = doctorWorkflowMatrix(job.strategy);
                if (matrixEnabled === false) continue;
                const dependenciesEnabled = doctorWorkflowDependencies(job, jobs, event, enabled);
                if (dependenciesEnabled === false) continue;
                for (const rawStep of job.steps) {
                    const step = object(rawStep);
                    if (!(step.uses === './' || typeof step.uses === 'string'
                        && /^vypdev\/copilot@[^\s${}<>]+$/iu.test(step.uses))) continue;
                    const stepEnabled = doctorWorkflowCondition(step.if, event);
                    if (stepEnabled === false) continue;
                    if (enabled === true && stepEnabled === true && matrixEnabled === true && dependenciesEnabled === true) eligible = true;
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

function validCatalogDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function validCatalogPath(field: string, value: unknown): value is string {
    if (typeof value !== 'string' || value !== value.trim() || value.includes('\\')
        || value.split('/').some(part => part === '' || part === '.' || part === '..')) return false;
    const boundaries: Record<string, RegExp> = {
        specs: /^specs\/(?!README\.md$|_template\.md$|CATALOG\.md$).+\.md$/u,
        workflows: /^(?:\.github|setup)\/workflows\/.+\.ya?ml$/u,
        entrypoints: /^(?:src\/.+|web\/src\/main\.ts|action\.yml|package\.json)$/u,
        code: /^(?:(?:src|scripts)\/|web\/src\/.+\.(?:ts|svelte|css)$)/u,
        tests: /^src\/.*(?:__tests__\/.*\.test\.ts|\.test\.ts)$/u,
        documentation: /^(?:docs\/.*\.(?:md|mdx)|README\.md|CONTRIBUTING\.md)$/u,
    };
    return boundaries[field].test(value);
}

/** Only a directly skipped prerequisite is proved; runtime success and override expressions stay unknown. */
function doctorWorkflowDependencies(job: Record<string, unknown>, jobs: Record<string, unknown>, event: string, enabled: boolean | undefined): boolean | undefined {
    if (!Object.prototype.hasOwnProperty.call(job, 'needs')) return true;
    if (enabled !== true) return undefined;
    const needs = typeof job.needs === 'string' ? [job.needs] : Array.isArray(job.needs) ? job.needs : undefined;
    if (!needs || needs.length === 0 || needs.length > 20 || needs.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,99}$/u.test(name))) return undefined;
    for (const name of needs) {
        if (Object.prototype.hasOwnProperty.call(jobs, name) && doctorWorkflowCondition(object(jobs[name]).if, event) === false) return false;
    }
    return undefined;
}

/** Explicit missing evidence differs from an incomplete or malformed provider sample. */
function completeFileSamples(read: Extract<DoctorRepositoryRead, { state: 'available' }>, paths: readonly DoctorRepositoryPath[]): boolean {
    return read.files !== null && typeof read.files === 'object' && !Array.isArray(read.files)
        && paths.every(path => { const sample = read.files[path];
            return sample?.state === 'missing' || sample?.state === 'present' && typeof sample.text === 'string';
        });
}
