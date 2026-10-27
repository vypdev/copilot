import { type WorkflowFieldMappings } from './issue_workflow_field_mapping';
/** Stable workflow identifiers used by setup, generated guidance, and Actions. */
export type IssueWorkflowKind = 'feature' | 'bugfix' | 'documentation' | 'chore' | 'help' | 'hotfix' | 'release';
export declare const ISSUE_WORKFLOW_KINDS: readonly IssueWorkflowKind[];
export interface IssueWorkflowDefinition {
    readonly id: IssueWorkflowKind;
    readonly label: string;
    readonly formFile: string;
    readonly nativeIssueType: 'Feature' | 'Bug' | 'Documentation' | 'Maintenance' | 'Question' | 'Help' | 'Hotfix' | 'Release';
    readonly labels: readonly string[];
    readonly branchManaged: boolean;
    readonly requiredHeadings: readonly string[];
    readonly requiredValueHeadings: readonly string[];
}
export declare const ISSUE_WORKFLOW_CATALOG: Readonly<Record<IssueWorkflowKind, IssueWorkflowDefinition>>;
export interface IssueWorkflowProfile {
    readonly schemaVersion: 1 | 2;
    readonly enabled: readonly IssueWorkflowKind[];
    readonly fieldMappings?: WorkflowFieldMappings<IssueWorkflowKind>;
}
export type IssueWorkflowProfileParseResult = {
    readonly profile: IssueWorkflowProfile;
} | {
    readonly error: string;
};
export type IssueWorkflowAdmission = {
    readonly status: 'eligible';
    readonly kind: IssueWorkflowKind;
} | {
    readonly status: 'unmanaged';
    readonly reason: 'no-recognized-kind';
} | {
    readonly status: 'disabled';
    readonly kind: IssueWorkflowKind;
} | {
    readonly status: 'conflict';
    readonly kinds: readonly IssueWorkflowKind[];
} | {
    readonly status: 'invalid';
    readonly kind: IssueWorkflowKind;
    readonly missingHeadings: readonly string[];
    readonly invalidFields?: readonly string[];
};
export interface IssueWorkflowLabelConfiguration {
    readonly feature?: readonly string[];
    readonly bugfix?: readonly string[];
    readonly documentation?: readonly string[];
    readonly chore?: readonly string[];
    readonly help?: readonly string[];
    readonly hotfix?: readonly string[];
    readonly release?: readonly string[];
}
export declare const ALL_ISSUE_WORKFLOWS: IssueWorkflowProfile;
export declare function createIssueWorkflowProfile(enabled: readonly IssueWorkflowKind[], fieldMappings?: WorkflowFieldMappings<IssueWorkflowKind>): IssueWorkflowProfile;
/** Empty input selects all workflows with the same admission checks as an explicit profile. */
export declare function parseIssueWorkflowProfile(raw: string | undefined): IssueWorkflowProfileParseResult;
export declare function serializeIssueWorkflowProfile(profile: IssueWorkflowProfile): string;
export declare function classifyIssueWorkflow(labels: readonly string[], profile?: IssueWorkflowProfile, labelConfiguration?: IssueWorkflowLabelConfiguration, body?: string, validateBody?: boolean): IssueWorkflowAdmission;
export declare function hasMarkdownHeading(body: string, heading: string): boolean;
export declare function issueWorkflowFormFiles(profile: IssueWorkflowProfile): readonly string[];
export declare function isAutomaticOrVersion(value: string): boolean;
export declare function issueWorkflowHeading(profile: IssueWorkflowProfile, kind: IssueWorkflowKind, canonical: string): string;
export declare function issueWorkflowRequiredHeadings(profile: IssueWorkflowProfile, kind: IssueWorkflowKind): readonly string[];
export type IssueWorkflowFieldMappings = WorkflowFieldMappings<IssueWorkflowKind>;
