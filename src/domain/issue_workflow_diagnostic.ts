import { ISSUE_WORKFLOW_KINDS, type IssueWorkflowAdmission } from './issue_workflow_profile';
import { isIssueFieldHeading, escapeIssueFieldHeadingMarkdown } from './issue_workflow_field_mapping';
export interface IssueWorkflowDiagnosticFacts {
    readonly kind: string;
    readonly reason: 'missing-fields' | 'invalid-fields' | 'disabled-kind' | 'conflicting-kinds' | 'unmanaged';
    readonly fields: string;
}
export function issueWorkflowDiagnostic(admission: IssueWorkflowAdmission | undefined): IssueWorkflowDiagnosticFacts | undefined {
    if (!admission || admission.status === 'eligible')
        return undefined;
    if (admission.status === 'invalid') {
        if (!admission.missingHeadings.length && !admission.invalidFields?.length)
            return undefined;
        return Object.freeze({ kind: admission.kind,
            reason: admission.missingHeadings.length ? 'missing-fields' : 'invalid-fields',
            fields: JSON.stringify(admission.missingHeadings.length ? admission.missingHeadings : admission.invalidFields!) });
    }
    return Object.freeze({ kind: admission.status === 'conflict' ? 'conflict' : admission.status === 'unmanaged' ? 'unmanaged' : admission.kind,
        reason: admission.status === 'conflict' ? 'conflicting-kinds' : admission.status === 'disabled' ? 'disabled-kind' : 'unmanaged',
        fields: JSON.stringify(admission.status === 'conflict' ? admission.kinds : []) });
}
export function isIssueWorkflowDiagnostic(value: Readonly<Record<string, unknown>>): boolean {
    if (typeof value.kind !== 'string' || typeof value.fields !== 'string' || value.fields.length > 1500)
        return false;
    let fields: unknown;
    try {
        fields = JSON.parse(value.fields);
    }
    catch {
        return false;
    }
    if (!Array.isArray(fields) || fields.length > 7 || fields.some(field => typeof field !== 'string'))
        return false;
    if (value.reason === 'conflicting-kinds')
        return value.kind === 'conflict' && fields.length > 1 && new Set(fields).size === fields.length && fields.every(field => ISSUE_WORKFLOW_KINDS.includes(field));
    if (value.reason === 'unmanaged')
        return value.kind === 'unmanaged' && fields.length === 0;
    if (!ISSUE_WORKFLOW_KINDS.some(kind => kind === value.kind))
        return false;
    if (value.reason === 'disabled-kind')
        return fields.length === 0;
    if (value.reason !== 'missing-fields' && value.reason !== 'invalid-fields')
        return false;
    return fields.length > 0 && fields.length <= 5 && fields.every(field => isIssueFieldHeading(field.replace(/ \(duplicate\)$/u, '')));
}
/** Bound heading data stays inert in Markdown tables, HTML, mentions and code spans. */
export function issueWorkflowDiagnosticPresentation(facts: IssueWorkflowDiagnosticFacts): Readonly<Record<string, string>> {
    const fields = (JSON.parse(facts.fields) as string[]).map(escapeIssueFieldHeadingMarkdown);
    return { kind: facts.kind, reason: facts.reason, fields: fields.length ? fields.join('; ') : '—' };
}
