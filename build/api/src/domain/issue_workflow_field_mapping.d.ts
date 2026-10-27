export type WorkflowFieldMappings<Kind extends string = string> = Readonly<Partial<Record<Kind, Readonly<Record<string, string>>>>>;
export declare const ISSUE_FIELD_HEADING_MAX_BYTES = 128;
type Definitions = Readonly<Record<string, {
    readonly requiredHeadings: readonly string[];
}>>;
/** One explicit replacement per canonical semantic field; never guesses an alias from an issue body. */
export declare function normalizeWorkflowFieldMappings(value: unknown, definitions: Definitions, enabled: readonly string[]): WorkflowFieldMappings | undefined;
export declare function isIssueFieldHeading(value: unknown): value is string;
export declare function escapeIssueFieldHeadingMarkdown(field: string): string;
export {};
