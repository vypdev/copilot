import type { BoundBranchListQueryPort } from '../../../application/ports/branch_lifecycle_ports';
import type { ProgressContext } from '../push_single_action_contexts';
import { logInfo } from '../../ports/logging_ports';

export async function findIssueBranch(
  param: ProgressContext,
  repository: BoundBranchListQueryPort,
): Promise<string | undefined> {
  if (param.pushedBranch) return param.pushedBranch;

  logInfo(`📦 Searching for branch related to issue #${param.issueNumber}...`);
  const branches = await repository.getListOfBranches();
  const branch = param.branchTypes
    .map((type) => `${type}/${param.issueNumber}-`)
    .flatMap((prefix) => branches.filter((candidate) => candidate.includes(prefix)))
    .at(0);

  if (branch) logInfo(`✅ Found branch: ${branch}`);
  return branch;
}
