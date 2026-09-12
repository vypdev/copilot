import {
  bindIssueCommentUpdate,
  bindIssueDescriptionQuery,
  bindIssueNotification,
  bindIssueTitle,
  bindOrganizationMembers,
  bindProjectContent,
} from '../shared_capability_port_binding';

const binding = { owner: 'acme', repository: 'demo', token: 'secret' };

describe('shared capability repository bindings', () => {
  it('binds organization, description, notification, and comment-update credentials once', async () => {
    const getAllMembers = jest.fn().mockResolvedValue(['alice']);
    const getDescription = jest.fn().mockResolvedValue('body');
    const addComment = jest.fn().mockResolvedValue(undefined);
    const updateComment = jest.fn().mockResolvedValue(undefined);

    await expect(bindOrganizationMembers({ getAllMembers } as never, binding).getAllMembers())
      .resolves.toEqual(['alice']);
    await expect(bindIssueDescriptionQuery({ getDescription } as never, binding).getDescription(7))
      .resolves.toBe('body');
    await bindIssueNotification({ addComment } as never, binding).addComment(7, 'done');
    await bindIssueCommentUpdate({ updateComment } as never, binding).updateComment(7, 70, 'translated');

    expect(getAllMembers).toHaveBeenCalledWith('acme', 'secret');
    expect(getDescription).toHaveBeenCalledWith('acme', 'demo', 7, 'secret');
    expect(addComment).toHaveBeenCalledWith('acme', 'demo', 7, 'done', 'secret');
    expect(updateComment).toHaveBeenCalledWith('acme', 'demo', 7, 70, 'translated', 'secret');
  });

  it('binds every issue-title operation without exposing credentials to the use case', async () => {
    const getTitle = jest.fn().mockResolvedValue('Issue');
    const updateTitleIssueFormat = jest.fn().mockResolvedValue('✨ Issue');
    const updateTitlePullRequestFormat = jest.fn().mockResolvedValue('✨ Pull request');
    const labels = {
      isHotfix: false,
      isRelease: false,
      isBugfix: false,
      isBug: false,
      isFeature: true,
      isEnhancement: false,
      isDocs: false,
      isDocumentation: false,
      isChore: false,
      isMaintenance: false,
      isHelp: false,
      isQuestion: false,
      containsBranchedLabel: true,
    };
    const port = bindIssueTitle({ getTitle, updateTitleIssueFormat, updateTitlePullRequestFormat } as never, binding);

    await port.getTitle(8);
    await port.updateIssueTitle({
      version: '1.0.0',
      currentTitle: 'Issue',
      issueNumber: 8,
      branchManagementAlways: true,
      branchManagementEmoji: '🌿',
      labelFacts: labels,
    });
    await port.updatePullRequestTitle({
      pullRequestTitle: 'Pull request',
      issueTitle: 'Issue',
      issueNumber: 8,
      pullRequestNumber: 9,
      labelFacts: labels,
    });

    expect(getTitle).toHaveBeenCalledWith('acme', 'demo', 8, 'secret');
    expect(updateTitleIssueFormat).toHaveBeenCalledWith(
      'acme', 'demo', '1.0.0', 'Issue', 8, true, '🌿', labels, 'secret',
    );
    expect(updateTitlePullRequestFormat).toHaveBeenCalledWith(
      'acme', 'demo', 'Pull request', 'Issue', 8, 9, false, '', labels, 'secret',
    );
  });

  it('rehydrates project references only inside the bound project adapter', async () => {
    const getId = jest.fn().mockResolvedValue('ISSUE_10');
    const linkContentId = jest.fn().mockResolvedValue(true);
    const moveIssueToColumn = jest.fn().mockResolvedValue(true);
    const project = {
      id: 'PVT_1',
      title: 'Delivery',
      type: 'organization',
      owner: 'acme',
      url: 'https://github.com/orgs/acme/projects/1',
      number: 1,
    };
    const port = bindProjectContent(
      { getId } as never,
      { moveIssueToColumn } as never,
      { linkContentId } as never,
      binding,
    );

    await port.resolveIssueContentId(10);
    await port.linkContentId(project, 'ISSUE_10');
    await port.moveContent(project, 10, 'In progress');

    expect(getId).toHaveBeenCalledWith('acme', 'demo', 10, 'secret');
    expect(linkContentId).toHaveBeenCalledWith(expect.objectContaining(project), 'ISSUE_10', 'secret');
    expect(moveIssueToColumn).toHaveBeenCalledWith(
      expect.objectContaining(project), 'acme', 'demo', 10, 'In progress', 'secret',
    );
  });
});
