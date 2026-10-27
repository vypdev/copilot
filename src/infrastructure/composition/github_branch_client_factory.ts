import { OctokitBranchClientAdapter, OctokitBranchComparisonClientAdapter, OctokitProgressObjectClientAdapter } from "../github/octokit_branch_adapters";
export const createBranchClient = () => new OctokitBranchClientAdapter();
export const createBranchComparisonClient = () => new OctokitBranchComparisonClientAdapter();

export const createProgressObjectClient = () => new OctokitProgressObjectClientAdapter();
