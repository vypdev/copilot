import type { BranchPropagationDelayPort } from "../../application/ports/branch_preparation_ports";
export declare class TimerBranchPropagationDelayAdapter implements BranchPropagationDelayPort {
    private readonly delayMilliseconds;
    constructor(delayMilliseconds?: number);
    waitForLinkedBranch: () => Promise<void>;
}
