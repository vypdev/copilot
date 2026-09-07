import type { ExecutionInputs } from './execution_inputs';
export declare class Issue {
    reopenOnPush: boolean;
    branchManagementAlways: boolean;
    desiredAssigneesCount: number;
    inputs: ExecutionInputs | undefined;
    get title(): string;
    get number(): number;
    get creator(): string;
    get url(): string;
    get body(): string;
    get opened(): boolean;
    /**
     * GitHub only includes `changes.body` when an issue description changed.
     * Title, label, assignment and project updates must not re-run the agent.
     */
    get descriptionEdited(): boolean;
    get labeled(): boolean;
    get labelAdded(): string;
    get isIssue(): boolean;
    get isIssueComment(): boolean;
    get commentId(): number;
    get commentBody(): string;
    get commentAuthor(): string;
    get commentUrl(): string;
    constructor(branchManagementAlways: boolean, reopenOnPush: boolean, desiredAssigneesCount: number, inputs?: ExecutionInputs | undefined);
}
