import { OctokitBranchClientAdapter, OctokitBranchMergeClientAdapter, OctokitBranchComparisonClientAdapter } from "../github/octokit_branch_adapters";
export declare const createBranchClient: () => OctokitBranchClientAdapter;
export declare const createBranchMergeClient: () => OctokitBranchMergeClientAdapter;
export declare const createBranchComparisonClient: () => OctokitBranchComparisonClientAdapter;
