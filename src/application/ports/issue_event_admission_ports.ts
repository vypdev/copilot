/** Read-only native issue admission; receipts are local files, never issue mutations. */
export interface IssueEventAdmissionContext {
    readonly owner: string;
    readonly repository: string;
    readonly eventName: string;
    readonly action: string;
    readonly actor: string;
    readonly issueNumber: number;
    readonly runId: number;
    readonly workflowRevision: string;
    readonly runtimeRevision: string;
    readonly configuration: string;
    readonly deployLabel: string;
    readonly releaseLabel: string;
    readonly hotfixLabel: string;
    readonly changedLabel: string;
}

export interface IssueAdmissionSnapshot {
    readonly id: number;
    readonly number: number;
    readonly title: string;
    readonly body: string;
    readonly state: 'open' | 'closed';
    readonly updatedAt: string;
    readonly author: string;
    readonly labels: readonly string[];
    readonly assignees: readonly string[];
    readonly milestone: number | null;
    readonly issueType: string | null;
    readonly locked: boolean;
}

export interface IssueEventAdmissionPort {
    authenticatedLogin(): Promise<string>;
    readIssue(issueNumber: number): Promise<IssueAdmissionSnapshot>;
    /** Missing/unproven receipts mean execute; errors never grant a skip. */
    hasSuccessfulReceipt(name: string, context: IssueEventAdmissionContext): Promise<boolean>;
}

export interface IssueEventAdmissionDecision {
    readonly execute: boolean;
    readonly reason: 'self-event' | 'lifecycle-event' | 'reconciliation-needed' | 'already-reconciled';
    readonly receiptKey?: string;
}
