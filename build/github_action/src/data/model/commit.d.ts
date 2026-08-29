import type { EventCommitPayload, ExecutionInputs } from './execution_inputs';
export declare class Commit {
    private inputs;
    constructor(inputs?: ExecutionInputs | undefined);
    get branchReference(): string;
    get branch(): string;
    get commits(): EventCommitPayload[];
}
