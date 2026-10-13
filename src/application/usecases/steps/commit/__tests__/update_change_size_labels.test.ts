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
      projectMembershipQueryPort: { isContentLinked: jest.fn().mockResolvedValue(true) },
    });

    expect(result).toEqual({ issueLabelNames: ['feature', 'size: L'], openPullRequestNumbers: [99], pendingProjectSizes: [] });
    expect(setLabels).toHaveBeenNthCalledWith(1, 42, ['feature', 'size: L']);
    expect(setLabels).toHaveBeenNthCalledWith(2, 99, ['bug', 'size: L']);
    expect(setTaskSize).toHaveBeenCalledTimes(2);
  });
});

describe('concurrent PR creation and replay', () => {
  const project = { id: 'project' } as ProjectReference;
  const otherProject = { id: 'other-project' } as ProjectReference;
  function fixture(projects = [project]) {
    const request = { issueNumber: 42, headBranch: 'feature/42', size: 'size: L', githubSize: 'L',
      currentIssueLabels: ['feature', 'size: L'], sizeLabels: ['size: S', 'size: L'], projects };
    const ports = {
      issueLabelsPort: { setLabels: jest.fn().mockResolvedValue(undefined), getLabels: jest.fn().mockResolvedValue(['bug', 'size: L']) },
      projectBoardCommandPort: { setTaskSize: jest.fn().mockResolvedValue(false) } as unknown as BoundProjectBoardCommandPort,
      pullRequestBranchQueryPort: { getOpenPullRequestNumbersByHeadBranch: jest.fn().mockResolvedValue([99]) },
      projectMembershipQueryPort: { isContentLinked: jest.fn().mockResolvedValue(true) },
    };
    return { request, ports, update: () => updateIssueAndRelatedPullRequests(request, ports) };
  }

  it('defers only the PR membership which is verified absent across multiple Projects', async () => {
    const h = fixture([project, otherProject]);
    h.ports.projectMembershipQueryPort.isContentLinked.mockImplementation(async p => p.id === otherProject.id);
    const result = await h.update();
    expect(result.pendingProjectSizes).toEqual([{ pullRequestNumber: 99, projectId: project.id }]);
    expect(h.ports.projectBoardCommandPort.setTaskSize).not.toHaveBeenCalledWith(project, 99, 'L');
    expect(h.ports.projectBoardCommandPort.setTaskSize).toHaveBeenCalledWith(otherProject, 99, 'L');
  });

  it('repairs a pending PR Project size after linkage on the same issue-size replay', async () => {
    const h = fixture();
    h.ports.projectMembershipQueryPort.isContentLinked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await h.update()).pendingProjectSizes).toHaveLength(1);
    expect((await h.update()).pendingProjectSizes).toEqual([]);
    expect(h.ports.projectBoardCommandPort.setTaskSize).toHaveBeenCalledWith(project, 99, 'L');
  });

  it('does not rewrite already-correct labels while reconciling Project fields', async () => {
    const h = fixture();
    await h.update();
    expect(h.ports.issueLabelsPort.setLabels).not.toHaveBeenCalled();
    expect(h.ports.projectBoardCommandPort.setTaskSize).toHaveBeenCalledTimes(2);
  });

  it('continues to an already-linked PR after another PR awaits linkage', async () => {
    const h = fixture();
    h.ports.pullRequestBranchQueryPort.getOpenPullRequestNumbersByHeadBranch.mockResolvedValue([99, 100]);
    h.ports.projectMembershipQueryPort.isContentLinked.mockImplementation(async (_project, number) => number === 100);
    expect((await h.update()).pendingProjectSizes).toEqual([{ pullRequestNumber: 99, projectId: project.id }]);
    expect(h.ports.projectBoardCommandPort.setTaskSize).toHaveBeenCalledWith(project, 100, 'L');
  });

  it('does not read membership when Projects are not configured', async () => {
    const h = fixture([]);
    expect((await h.update()).pendingProjectSizes).toEqual([]);
    expect(h.ports.projectMembershipQueryPort.isContentLinked).not.toHaveBeenCalled();
    expect(h.ports.projectBoardCommandPort.setTaskSize).not.toHaveBeenCalled();
  });

  it('propagates a linked-item write failure without misclassifying it as pending', async () => {
    const h = fixture();
    (h.ports.projectBoardCommandPort.setTaskSize as jest.Mock).mockImplementation(async (_project, number) => {
      if (number === 99) throw new Error('item disappeared');
      return false;
    });
    await expect(h.update()).rejects.toThrow('item disappeared');
  });
});
