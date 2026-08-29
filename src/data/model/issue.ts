import type { ExecutionInputs } from './execution_inputs';

export class Issue {
    reopenOnPush: boolean;
    branchManagementAlways: boolean;
    desiredAssigneesCount: number;
    inputs: ExecutionInputs | undefined = undefined;

    get title(): string {
        return this.inputs?.issue?.title ?? '';
    }

    get number(): number {
        return this.inputs?.issue?.number ?? -1;
    }

    get creator(): string {
        return this.inputs?.issue?.user?.login ?? '';
    }

    get url(): string {
        return this.inputs?.issue?.html_url ?? '';
    }

    get body(): string {
        return this.inputs?.issue?.body ?? '';
    }

    get opened(): boolean {
        return ['opened', 'reopened'].includes(this.inputs?.action ?? '');
    }

    /**
     * GitHub only includes `changes.body` when an issue description changed.
     * Title, label, assignment and project updates must not re-run the agent.
     */
    get descriptionEdited(): boolean {
        const changes = this.inputs?.changes;
        return this.inputs?.action === 'edited'
            && changes !== null
            && typeof changes === 'object'
            && Object.prototype.hasOwnProperty.call(changes, 'body');
    }

    get labeled(): boolean {
        return this.inputs?.action === 'labeled';
    }

    get labelAdded(): string {
        return this.inputs?.label?.name ?? '';
    }

    get isIssue(): boolean {
        return this.inputs?.eventName === 'issues';
    }

    get isIssueComment(): boolean {
        return this.inputs?.eventName === 'issue_comment';
    }

    get commentId(): number {
        return this.inputs?.comment?.id ?? -1;
    }

    get commentBody(): string {
        return this.inputs?.comment?.body ?? '';
    }

    get commentAuthor(): string {
        return this.inputs?.comment?.user?.login ?? '';
    }

    get commentUrl(): string {
        return this.inputs?.comment?.html_url ?? '';
    }

    constructor(
        branchManagementAlways: boolean,
        reopenOnPush: boolean,
        desiredAssigneesCount: number,
        inputs: ExecutionInputs | undefined = undefined,
    ) {
        this.branchManagementAlways = branchManagementAlways;
        this.reopenOnPush = reopenOnPush;
        this.desiredAssigneesCount = desiredAssigneesCount;
        this.inputs = inputs;
    }
}
