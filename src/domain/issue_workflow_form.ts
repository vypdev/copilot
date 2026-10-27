import { ISSUE_WORKFLOW_CATALOG, isAutomaticOrVersion, issueWorkflowHeading, type IssueWorkflowKind, type IssueWorkflowProfile } from './issue_workflow_profile';
export interface IssueFormSchemaProblem {
    readonly heading: string;
    readonly reason: 'missing' | 'duplicate' | 'required' | 'unsupported' | 'shape' | 'value';
}
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
/** Native acknowledgement checkboxes and optional context do not define admission roles. */
export function compareIssueFormSchema(value: unknown, profile: IssueWorkflowProfile, kind: IssueWorkflowKind): readonly IssueFormSchemaProblem[] {
    const body = object(value)?.body;
    if (!Array.isArray(body) || body.length > 100 || body.some(field => !object(field)))
        return [{ heading: '', reason: 'shape' }];
    const fields = body.map(field => object(field)!);
    const scalar = fields.filter(field => ['input', 'textarea', 'dropdown'].includes(String(field.type)));
    const definition = ISSUE_WORKFLOW_CATALOG[kind];
    const expected = definition.requiredHeadings.map(canonical => ({ canonical, heading: issueWorkflowHeading(profile, kind, canonical) }));
    const problems: IssueFormSchemaProblem[] = [];
    for (const { canonical, heading } of expected) {
        const matching = scalar.filter(field => typeof object(field.attributes)?.label === 'string' && (object(field.attributes)!.label as string).toLowerCase() === heading.toLowerCase());
        if (matching.length !== 1) {
            problems.push({ heading, reason: matching.length ? 'duplicate' : 'missing' });
            continue;
        }
        if (definition.requiredValueHeadings.includes(canonical) && object(matching[0].validations)?.required !== true)
            problems.push({ heading, reason: 'required' });
        const field = matching[0]; const attributes = object(field.attributes)!;
        if (kind === 'release' && canonical === 'Release Type' && field.type === 'dropdown'
            && (!Array.isArray(attributes.options) || attributes.options.length === 0 || attributes.options.some(option => typeof option !== 'string' || !/^(patch|minor|major)$/iu.test(option)))) problems.push({heading, reason:'value'});
        const versionField = kind === 'release' && canonical === 'Release Version' || kind === 'hotfix' && ['Base Version','Hotfix Version'].includes(canonical);
        if (versionField && object(field.validations)?.required !== true && !isAutomaticOrVersion(formDefault(attributes))) problems.push({heading,reason:'value'});

    }
    for (const field of fields) {
        if (['markdown', 'checkboxes'].includes(String(field.type)))
            continue;
        const label = object(field.attributes)?.label;
        if (!['input', 'textarea', 'dropdown'].includes(String(field.type)) || typeof label !== 'string') {
            problems.push({ heading: '', reason: 'shape' });
            continue;
        }
        if (object(field.validations)?.required === true && !expected.some(item => item.heading.toLowerCase() === label.toLowerCase()))
            problems.push({ heading: '', reason: 'unsupported' });
    }
    return problems;
}

function formDefault(attributes: Record<string, unknown>): string {
    if (typeof attributes.value === 'string') return attributes.value;
    if (!Array.isArray(attributes.options) || typeof attributes.default !== 'number' || !Number.isSafeInteger(attributes.default) || attributes.default < 0) return '';
    const value = attributes.options[attributes.default];
    return typeof value === 'string' ? value : '';
}
