import type { EventCommitPayload, ExecutionInputs } from './execution_inputs';

export class Commit {
    private inputs: ExecutionInputs | undefined = undefined;

    constructor(inputs: ExecutionInputs | undefined = undefined) {
        this.inputs = inputs;
    }
    
    get branchReference(): string {
        const commits = this.inputs?.commits;
        return (!Array.isArray(commits) ? commits?.ref : undefined) ?? this.inputs?.ref ?? '';
    }

    get branch(): string {
        return this.branchReference.replace('refs/heads/', '');
    }

    get commits(): EventCommitPayload[] {
        return Array.isArray(this.inputs?.commits) ? this.inputs.commits : [];
    }
}
