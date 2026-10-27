import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { JSON_SCHEMA, load } from 'js-yaml';
import type { SetupConfiguration } from '../domain/setup';
import { ISSUE_WORKFLOW_CATALOG } from '../domain/issue_workflow_profile';
import { compareIssueFormSchema } from '../domain/issue_workflow_form';
import { effectiveIssueWorkflowProfile } from '../application/policies/setup_issue_workflow_policy';
export interface SetupIssueFormReview {
    readonly id: string;
    readonly status: 'pass' | 'fail';
    readonly summary: string;
    readonly path: string;
    readonly missing: boolean;
}
/** Fixed paths, no network or mutation; parser failures never become public diagnostics. */
export function inspectSetupIssueForms(root: string, configuration: Readonly<SetupConfiguration>): readonly SetupIssueFormReview[] {
    if (configuration.features.issues === false || configuration.features.issueTemplates === false)
        return [];
    const profile = effectiveIssueWorkflowProfile(configuration);
    return profile.enabled.map(kind => {
        const path = `.github/ISSUE_TEMPLATE/${ISSUE_WORKFLOW_CATALOG[kind].formFile}`;
        const base = { id: `issue-form.${kind}`, path };
        const remedy = 'Preserve the form; review issueWorkflows.fieldMappings or repair its governed fields, then rerun setup/doctor.';
        try {
            for (const segment of ['.github', '.github/ISSUE_TEMPLATE', path]) {
                const full = join(root, segment);
                if (!existsSync(full)) {
                    // A dangling link is not a missing file that setup may replace.
                    try {
                        lstatSync(full);
                        throw new Error('unsafe');
                    }
                    catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                            throw error;
                    }
                    return { ...base, status: 'fail' as const, summary: `${path}: form missing. ${remedy}`, missing: true };
                }
                if (lstatSync(full).isSymbolicLink())
                    throw new Error('unsafe');
            }
            const full = join(root, path);
            const stat = lstatSync(full);
            const resolved = relative(realpathSync(root), realpathSync(full));
            if (!stat.isFile() || stat.size > 65536 || resolved === '..' || resolved.startsWith(`..${sep}`))
                throw new Error('unsafe');
            const problems = compareIssueFormSchema(load(readFileSync(full, 'utf8'), { schema: JSON_SCHEMA }), profile, kind);
            return { ...base, status: problems.length ? 'fail' as const : 'pass' as const, missing: false,
                summary: problems.length ? `${path}: admission schema drift (${problems.map(problem => `${problem.reason}${problem.heading ? `: ${JSON.stringify(problem.heading)}` : ''}`).join('; ')}). ${remedy}` : `${path}: form fields match the effective admission schema.` };
        }
        catch {
            return { ...base, status: 'fail' as const, missing: false, summary: `${path}: form cannot be safely inspected (regular local file, single valid YAML document, <=64 KiB and <=100 elements required). ${remedy}` };
        }
    });
}
