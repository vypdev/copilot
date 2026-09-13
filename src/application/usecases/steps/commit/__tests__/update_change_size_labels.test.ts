import {
  replaceSizeLabel,
  updateIssueAndRelatedPullRequests,
} from '../update_change_size_labels';
import type { ProjectReference } from '../../../../ports/project_board_link_ports';
import type { BoundProjectBoardCommandPort } from '../../../../ports/project_board_command_ports';

describe('change size label workflow', () => {
  it('replaces existing size labels while preserving unrelated labels', () => {
    expect(replaceSizeLabel(['feature', 'size: M'], ['size: S', 'size: M'], 'size: L'))
      .toEqual(['feature', 'size: L']);
  });

  it('updates the issue, project cards, and related pull requests sequentially', async () => {
    const setLabels = jest.fn().mockResolvedValue(undefined);
    const getLabels = jest.fn().mockResolvedValue(['bug', 'size: S']);
    const setTaskSize = jest.fn().mockResolvedValue(true);
    const getOpenPullRequestNumbersByHeadBranch = jest.fn().mockResolvedValue([99]);

    const result = await updateIssueAndRelatedPullRequests({
      issueNumber: 42,
      headBranch: 'feature/42',
      size: 'size: L',
      githubSize: 'L',
      currentIssueLabels: ['feature', 'size: S'],
      sizeLabels: ['size: S', 'size: L'],
      projects: [{ id: 'project' } as ProjectReference],
    }, {
      issueLabelsPort: { setLabels, getLabels },
      projectBoardCommandPort: { setTaskSize } as unknown as BoundProjectBoardCommandPort,
      pullRequestBranchQueryPort: { getOpenPullRequestNumbersByHeadBranch },
    });

    expect(result).toEqual({ issueLabelNames: ['feature', 'size: L'], openPullRequestNumbers: [99] });
    expect(setLabels).toHaveBeenNthCalledWith(1, 42, ['feature', 'size: L']);
    expect(setLabels).toHaveBeenNthCalledWith(2, 99, ['bug', 'size: L']);
    expect(setTaskSize).toHaveBeenCalledTimes(2);
  });
});
