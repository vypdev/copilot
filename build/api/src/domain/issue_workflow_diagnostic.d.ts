import { type IssueWorkflowAdmission } from './issue_workflow_profile';
export interface IssueWorkflowDiagnosticFacts {
    readonly kind: string;
    readonly reason: 'missing-fields' | 'invalid-fields' | 'disabled-kind' | 'conflicting-kinds' | 'unmanaged';
    readonly fields: string;
}
export declare function issueWorkflowDiagnostic(admission: IssueWorkflowAdmission | undefined): IssueWorkflowDiagnosticFacts | undefined;
export declare function isIssueWorkflowDiagnostic(value: Readonly<Record<string, unknown>>): boolean;
/** Bound heading data stays inert in Markdown tables, HTML, mentions and code spans. */
export declare function issueWorkflowDiagnosticPresentation(facts: IssueWorkflowDiagnosticFacts): Readonly<Record<string, string>>;
