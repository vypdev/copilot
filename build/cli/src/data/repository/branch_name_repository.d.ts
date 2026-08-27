import type { BranchNamePort } from '../../application/ports/branch_lifecycle_ports';
export declare class BranchNameRepository implements BranchNamePort {
    formatBranchName: (issueTitle: string, issueNumber: number) => string;
}
