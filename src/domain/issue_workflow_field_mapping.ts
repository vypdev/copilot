export type WorkflowFieldMappings<Kind extends string = string> = Readonly<Partial<Record<Kind, Readonly<Record<string, string>>>>>;
export const ISSUE_FIELD_HEADING_MAX_BYTES = 128;
type Definitions = Readonly<Record<string, {
    readonly requiredHeadings: readonly string[];
}>>;
/** One explicit replacement per canonical semantic field; never guesses an alias from an issue body. */
export function normalizeWorkflowFieldMappings(value: unknown, definitions: Definitions, enabled: readonly string[]): WorkflowFieldMappings | undefined {
    if (value === undefined)
        return undefined;
    if (!isRecord(value))
        throw new Error('Issue field mappings must be an object.');
    const mappings: Record<string, Readonly<Record<string, string>>> = {};
    for (const kind of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(definitions, kind) || !enabled.includes(kind)) {
            throw new Error('Issue field mappings must refer only to known enabled workflows.');
        }
        const fields = value[kind];
        if (!isRecord(fields))
            throw new Error('Each issue field mapping must be an object.');
        const headings = definitions[kind].requiredHeadings;
        if (Object.keys(fields).some(key => !headings.includes(key)))
            throw new Error('Issue field mapping contains an unknown canonical field.');
        const entries = headings.filter(heading => Object.prototype.hasOwnProperty.call(fields, heading)).map(heading => {
            const target = fields[heading];
            if (!isIssueFieldHeading(target))
                throw new Error('Mapped issue headings must be nonempty single-line text of at most 128 UTF-8 bytes.');
            return [heading, target] as const;
        });
        const mapped = Object.fromEntries(entries);
        const effective = headings.map(heading => (mapped[heading] ?? heading).toLowerCase());
        if (new Set(effective).size !== effective.length)
            throw new Error('Issue field mappings cannot make two semantic fields share a heading.');
        if (entries.length)
            mappings[kind] = Object.freeze(mapped);
    }
    return Object.keys(mappings).length ? Object.freeze(Object.fromEntries(Object.keys(definitions)
        .filter(kind => Object.prototype.hasOwnProperty.call(mappings, kind)).map(kind => [kind, mappings[kind]]))) : undefined;
}
export function isIssueFieldHeading(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.trim() === value
        && new TextEncoder().encode(value).length <= ISSUE_FIELD_HEADING_MAX_BYTES
        && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    // Native structuredClone and plain maps from another realm remain dictionaries.
    return prototype === null || Object.getPrototypeOf(prototype) === null;
}

export function escapeIssueFieldHeadingMarkdown(field: string): string {
  return field.replace(/[&<>|`\\*_[\]{}!#]/gu, char => `&#${char.codePointAt(0)};`).replace(/@/gu, '&#64;');
}
