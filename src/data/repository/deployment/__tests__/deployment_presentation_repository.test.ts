import type { IssueCommentUpsertPort } from '../../../../application/ports/issue_lifecycle_ports';
import { DeploymentPresentationRepository } from '../deployment_presentation_repository';

const owner = 'vypdev';
const repository = 'copilot';
const issueNumber = 42;
const token = 'token';

function createIssues(): jest.Mocked<IssueCommentUpsertPort> {
  return {
    addComment: jest.fn(),
    updateComment: jest.fn(),
    listIssueComments: jest.fn(),
  };
}

describe('DeploymentPresentationRepository', () => {
  it('finds the only dashboard with the requested marker', async () => {
    const issues = createIssues();
    issues.listIssueComments.mockResolvedValue([
      { id: 7, body: 'unrelated' },
      { id: 9, body: 'dashboard\n<!-- deployment -->' },
    ]);

    await expect(new DeploymentPresentationRepository(issues).findDashboard(
      owner, repository, issueNumber, '<!-- deployment -->', token,
    )).resolves.toEqual({ id: 9, body: 'dashboard\n<!-- deployment -->' });
  });

  it('returns no dashboard when the marker is absent', async () => {
    const issues = createIssues();
    issues.listIssueComments.mockResolvedValue([{ id: 7, body: null }]);

    await expect(new DeploymentPresentationRepository(issues).findDashboard(
      owner, repository, issueNumber, '<!-- deployment -->', token,
    )).resolves.toBeUndefined();
  });

  it('rejects ambiguous dashboard ownership', async () => {
    const issues = createIssues();
    issues.listIssueComments.mockResolvedValue([
      { id: 7, body: '<!-- deployment -->' },
      { id: 9, body: '<!-- deployment -->' },
    ]);

    await expect(new DeploymentPresentationRepository(issues).findDashboard(
      owner, repository, issueNumber, '<!-- deployment -->', token,
    )).rejects.toThrow('Multiple deployment dashboards match <!-- deployment -->.');
  });

  it('forwards explicit dashboard create and update requests', async () => {
    const issues = createIssues();
    const presentation = new DeploymentPresentationRepository(issues);

    await presentation.createDashboard(owner, repository, issueNumber, 'created', token);
    await presentation.updateDashboard(owner, repository, issueNumber, 17, 'updated', token);

    expect(issues.addComment).toHaveBeenCalledWith(owner, repository, issueNumber, 'created', token);
    expect(issues.updateComment).toHaveBeenCalledWith(owner, repository, issueNumber, 17, 'updated', token);
  });

  it('publishes a milestone once with its marker', async () => {
    const issues = createIssues();
    issues.listIssueComments
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 17, body: 'Published\n\n<!-- milestone -->' }]);
    const presentation = new DeploymentPresentationRepository(issues);

    await presentation.publishMilestone(owner, repository, issueNumber, '<!-- milestone -->', 'Published', token);
    await presentation.publishMilestone(owner, repository, issueNumber, '<!-- milestone -->', 'Published', token);

    expect(issues.addComment).toHaveBeenCalledTimes(1);
    expect(issues.addComment).toHaveBeenCalledWith(
      owner, repository, issueNumber, 'Published\n\n<!-- milestone -->', token,
    );
  });
});
