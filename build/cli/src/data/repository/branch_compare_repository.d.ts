import type { GithubBranchComparisonClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { Labels } from '../model/labels';
import { SizeThresholds } from '../model/size_thresholds';
import type { SizeCategoryResult } from './branch_change_size_policy';
export interface BranchComparisonFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    blobUrl: string;
    rawUrl: string;
    contentsUrl: string;
    patch: string | undefined;
}
export interface BranchComparisonCommit {
    sha: string;
    message: string;
    author: {
        name: string;
        email: string;
        date: string;
    };
    date: string;
}
export interface BranchComparison {
    aheadBy: number;
    behindBy: number;
    totalCommits: number;
    files: BranchComparisonFile[];
    commits: BranchComparisonCommit[];
}
/**
 * Repository for comparing branches and computing size categories.
 * Isolated to allow unit tests with mocked Octokit and pure size logic.
 */
export declare class BranchCompareRepository {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubBranchComparisonClient>);
    getChanges: (owner: string, repository: string, head: string, base: string, token: string) => Promise<BranchComparison>;
    getSizeCategoryAndReason: (owner: string, repository: string, head: string, base: string, sizeThresholds: SizeThresholds, labels: Labels, token: string) => Promise<SizeCategoryResult>;
}
