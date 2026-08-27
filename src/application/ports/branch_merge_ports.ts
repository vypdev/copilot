import type { Result } from '../../data/model/result';

export interface BranchMergePort {
    mergeBranch(owner: string, repository: string, head: string, base: string, timeout: number, token: string): Promise<Result[]>;
}
