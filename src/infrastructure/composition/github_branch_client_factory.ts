import { OctokitBranchClientAdapter, OctokitBranchComparisonClientAdapter } from "../github/octokit_branch_adapters";
export const createBranchClient = () => new OctokitBranchClientAdapter();
export const createBranchComparisonClient = () => new OctokitBranchComparisonClientAdapter();
