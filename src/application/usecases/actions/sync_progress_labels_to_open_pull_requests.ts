import { PROGRESS_LABEL_PATTERN } from '../../../application/policies/progress_labels';
import type { BoundIssueLabelsPort } from '../../../application/ports/issue_management_ports';
import type { BoundPullRequestBranchQueryPort } from '../../../application/ports/pull_request_branch_ports';
import { logInfo } from '../../ports/logging_ports';

export async function syncProgressLabelsToOpenPullRequests(
  branch: string,
  progress: number,
  issueRepository: BoundIssueLabelsPort,
  pullRequestRepository: BoundPullRequestBranchQueryPort,
): Promise<void> {
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress / 5) * 5));
  const newProgressLabel = `${roundedProgress}%`;
  const pullRequestNumbers = await pullRequestRepository.getOpenPullRequestNumbersByHeadBranch(
    branch,
  );

  for (const prNumber of pullRequestNumbers) {
    const prLabels = await issueRepository.getLabels(prNumber);
    const withoutProgress = prLabels.filter((name) => !PROGRESS_LABEL_PATTERN.test(name));
    const nextLabels = withoutProgress.includes(newProgressLabel)
      ? withoutProgress
      : [...withoutProgress, newProgressLabel];
    await issueRepository.setLabels(prNumber, nextLabels);
    logInfo(`Progress label set to ${newProgressLabel} on PR #${prNumber}.`);
  }
}
