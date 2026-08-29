import type { BranchListQueryPort } from '../../../application/ports/branch_lifecycle_ports';
import { Execution } from '../../../data/model/execution';
import { logInfo } from '../../ports/logging_ports';

export async function findIssueBranch(
  param: Execution,
  repository: BranchListQueryPort,
): Promise<string | undefined> {
  if (param.commit.branch) return param.commit.branch;

  logInfo(`📦 Searching for branch related to issue #${param.issueNumber}...`);
  const branchTypes = [
    param.branches.featureTree,
    param.branches.bugfixTree,
    param.branches.docsTree,
    param.branches.choreTree,
    param.branches.hotfixTree,
    param.branches.releaseTree,
  ];
  const branches = await repository.getListOfBranches(
    param.owner,
    param.repo,
    param.tokens.token,
  );
  const branch = branchTypes
    .map((type) => `${type}/${param.issueNumber}-`)
    .flatMap((prefix) => branches.filter((candidate) => candidate.includes(prefix)))
    .at(0);

  if (branch) logInfo(`✅ Found branch: ${branch}`);
  return branch;
}
