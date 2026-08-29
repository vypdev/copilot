import {
  replaceSizeLabel,
  updateIssueAndRelatedPullRequests,
} from '../update_change_size_labels';
import type { ProjectDetail } from '../../../../../data/model/project_detail';
import type { ProjectBoardCommandPort } from '../../../../ports/project_board_command_ports';

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
      owner: 'o',
      repository: 'r',
      issueNumber: 42,
      headBranch: 'feature/42',
      size: 'size: L',
      githubSize: 'L',
      currentIssueLabels: ['feature', 'size: S'],
      sizeLabels: ['size: S', 'size: L'],
      projects: [{ id: 'project' } as unknown as ProjectDetail],
      token: 'token',
    }, {
      issueLabelsPort: { setLabels, getLabels },
      projectBoardCommandPort: { setTaskSize } as unknown as ProjectBoardCommandPort,
      pullRequestBranchQueryPort: { getOpenPullRequestNumbersByHeadBranch },
    });

    expect(result).toEqual({ issueLabelNames: ['feature', 'size: L'], openPullRequestNumbers: [99] });
    expect(setLabels).toHaveBeenNthCalledWith(1, 'o', 'r', 42, ['feature', 'size: L'], 'token');
    expect(setLabels).toHaveBeenNthCalledWith(2, 'o', 'r', 99, ['bug', 'size: L'], 'token');
    expect(setTaskSize).toHaveBeenCalledTimes(2);
  });
});
