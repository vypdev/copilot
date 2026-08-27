import { OctokitBranchClientAdapter, OctokitBranchMergeClientAdapter, OctokitBranchComparisonClientAdapter } from "../github/octokit_branch_adapters";
export const createBranchClient = () => new OctokitBranchClientAdapter();
export const createBranchMergeClient = () => new OctokitBranchMergeClientAdapter();
export const createBranchComparisonClient = () => new OctokitBranchComparisonClientAdapter();
