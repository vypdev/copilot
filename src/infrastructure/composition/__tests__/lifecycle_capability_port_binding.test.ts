import {
  bindActorAuthorization,
  bindBranchLifecycle,
  bindBranchWorkflow,
  bindIssueAssignee,
  bindIssueClosure,
  bindIssueLabels,
  bindIssueTypeAssignment,
  bindLinkedBranchCommand,
  bindOrganizationMemberSelection,
  bindProjectBoardCommands,
  bindPullRequestDescription,
  bindPullRequestHeadSha,
  bindPullRequestIssueLink,
  bindPullRequestReviewer,
} from '../lifecycle_capability_port_binding';

const binding = { owner: 'acme', repository: 'demo', token: 'secret' };
const project = { id: 'P1', title: 'Delivery', type: 'organization', owner: 'acme', url: 'https://github.com/orgs/acme/projects/1', number: 1 };

describe('lifecycle capability repository bindings', () => {
  it('binds actor, assignee, organization and reviewer identities once', async () => {
    const authorize = jest.fn().mockResolvedValue(true);
    const currentAssignees = jest.fn().mockResolvedValue(['alice']);
    const assign = jest.fn().mockResolvedValue(['bob']);
    const allMembers = jest.fn().mockResolvedValue(['alice', 'bob']);
    const randomMembers = jest.fn().mockResolvedValue(['bob']);
    const currentReviewers = jest.fn().mockResolvedValue([]);
    const addReviewers = jest.fn().mockResolvedValue(['bob']);

    await bindActorAuthorization({ isActorAllowedToModifyFiles: authorize }, binding).isActorAllowedToModifyFiles('alice');
    const assignees = bindIssueAssignee({ getCurrentAssignees: currentAssignees, assignMembersToIssue: assign }, binding);
    await assignees.getCurrentAssignees(7);
    await assignees.assignMembersToIssue(7, ['bob']);
    const members = bindOrganizationMemberSelection({ getAllMembers: allMembers, getRandomMembers: randomMembers }, binding);
    await members.getAllMembers();
    await members.getRandomMembers(1, ['alice']);
    const reviewers = bindPullRequestReviewer({ getCurrentReviewers: currentReviewers, addReviewersToPullRequest: addReviewers }, binding);
    await reviewers.getCurrentReviewers(8);
    await reviewers.addReviewersToPullRequest(8, ['bob']);

    expect(authorize).toHaveBeenCalledWith('acme', 'demo', 'alice', 'secret');
    expect(currentAssignees).toHaveBeenCalledWith('acme', 'demo', 7, 'secret');
    expect(assign).toHaveBeenCalledWith('acme', 'demo', 7, ['bob'], 'secret');
    expect(allMembers).toHaveBeenCalledWith('acme', 'secret');
    expect(randomMembers).toHaveBeenCalledWith('acme', 1, ['alice'], 'secret');
    expect(addReviewers).toHaveBeenCalledWith('acme', 'demo', 8, ['bob'], 'secret');
  });

  it('binds issue closure, type, labels and pull-request head without exposing credentials to leaves', async () => {
    const closeIssue = jest.fn().mockResolvedValue(true);
    const addComment = jest.fn().mockResolvedValue(undefined);
    const setIssueType = jest.fn().mockResolvedValue(undefined);
    const getLabels = jest.fn().mockResolvedValue(['size: S']);
    const setLabels = jest.fn().mockResolvedValue(undefined);
    const getPullRequestHeadSha = jest.fn().mockResolvedValue('sha-1');
    const closure = bindIssueClosure({ closeIssue, addComment }, binding);
    await closure.closeIssue(7);
    await closure.addComment(7, 'done');
    const selected = { name: 'Feature', description: 'Feature issue', color: 'GREEN' };
    await bindIssueTypeAssignment({ setIssueType }, binding).setIssueType(7, selected);
    const labels = bindIssueLabels({ getLabels, setLabels }, binding);
    await labels.getLabels(7);
    await labels.setLabels(8, ['size: S']);
    const head = bindPullRequestHeadSha({ getPullRequestHeadSha }, binding);
    await expect(head.getPullRequestHeadSha(9)).resolves.toBe('sha-1');
    expect(closeIssue).toHaveBeenCalledWith('acme', 'demo', 7, 'secret');
    expect(addComment).toHaveBeenCalledWith('acme', 'demo', 7, 'done', 'secret');
    expect(setIssueType).toHaveBeenCalledWith('acme', 'demo', 7, selected, 'secret');
    expect(setLabels).toHaveBeenCalledWith('acme', 'demo', 8, ['size: S'], 'secret');
    expect(getPullRequestHeadSha).toHaveBeenCalledWith('acme', 'demo', 9, 'secret');
    expect(Object.isFrozen(head)).toBe(true);
  });

  it('rehydrates project commands and binds branch commands and workflow dispatch', async () => {
    const setTaskPriority = jest.fn().mockResolvedValue(true);
    const moveIssueToColumn = jest.fn().mockResolvedValue(true);
    const list = jest.fn().mockResolvedValue(['develop']);
    const remove = jest.fn().mockResolvedValue(true);
    const create = jest.fn().mockResolvedValue([]);
    const execute = jest.fn().mockResolvedValue(undefined);
    const projects = bindProjectBoardCommands({ setTaskPriority, moveIssueToColumn, setTaskSize: jest.fn() }, binding);
    await projects.setTaskPriority(project, 7, 'P0');
    await projects.moveIssueToColumn(project, 7, 'In progress');
    const branches = bindBranchLifecycle({ getListOfBranches: list, removeBranch: remove }, binding);
    await branches.getListOfBranches();
    await branches.removeBranch('feature/7');
    await bindLinkedBranchCommand({ createLinkedBranch: create }, binding).createLinkedBranch('develop', 'feature/7', 7, 'abc');
    await bindBranchWorkflow({ executeWorkflow: execute }, binding).executeWorkflow('release/1', 'release.yml', { version: '1' });
    expect(setTaskPriority).toHaveBeenCalledWith(expect.objectContaining(project), 'acme', 'demo', 7, 'P0', 'secret');
    expect(moveIssueToColumn).toHaveBeenCalledWith(expect.objectContaining(project), 'acme', 'demo', 7, 'In progress', 'secret');
    expect(list).toHaveBeenCalledWith('acme', 'demo', 'secret');
    expect(remove).toHaveBeenCalledWith('acme', 'demo', 'feature/7', 'secret');
    expect(create).toHaveBeenCalledWith('acme', 'demo', 'develop', 'feature/7', 7, 'abc', 'secret');
    expect(execute).toHaveBeenCalledWith('acme', 'demo', 'release/1', 'release.yml', { version: '1' }, 'secret');
  });

  it('binds exact PR linkage and description capabilities', async () => {
    const isLinked = jest.fn().mockResolvedValue(false);
    const getLinkDetails = jest.fn().mockResolvedValue({ body: 'body', baseBranch: 'develop' });
    const updateBaseBranch = jest.fn().mockResolvedValue(undefined);
    const updateLinkDescription = jest.fn().mockResolvedValue(undefined);
    const link = bindPullRequestIssueLink({ isLinked, getDetails: getLinkDetails, updateBaseBranch, updateDescription: updateLinkDescription }, binding);
    await link.isLinked(9);
    await link.getDetails(9);
    await link.updateBaseBranch(9, 'main');
    await link.updateDescription(9, 'linked');

    const updateDescription = jest.fn().mockResolvedValue(undefined);
    const getDetails = jest.fn().mockResolvedValue({ body: 'body', headBranch: 'feature/9', baseBranch: 'develop' });
    const description = bindPullRequestDescription({ updateDescription, getDetails }, binding);
    await description.updateDescription(9, 'generated');
    await description.getDetails(9);

    expect(isLinked).toHaveBeenCalledWith('acme', 'demo', 9, 'secret');
    expect(getLinkDetails).toHaveBeenCalledWith('acme', 'demo', 9, 'secret');
    expect(updateBaseBranch).toHaveBeenCalledWith('acme', 'demo', 9, 'main', 'secret');
    expect(updateLinkDescription).toHaveBeenCalledWith('acme', 'demo', 9, 'linked', 'secret');
    expect(updateDescription).toHaveBeenCalledWith('acme', 'demo', 9, 'generated', 'secret');
    expect(getDetails).toHaveBeenCalledWith('acme', 'demo', 9, 'secret');
    expect(Object.isFrozen(link)).toBe(true);
    expect(Object.isFrozen(description)).toBe(true);
  });

  it('fails explicitly when the raw PR description adapter lacks read capability', async () => {
    const description = bindPullRequestDescription({ updateDescription: jest.fn() }, binding);
    await expect(description.getDetails(9)).rejects.toThrow('details query is not available');
  });

  it('snapshots lifecycle label and head identity against caller mutation', async () => {
    const mutableBinding = { owner: 'acme', repository: 'demo', token: 'secret' };
    const getLabels = jest.fn().mockResolvedValue([]);
    const setLabels = jest.fn().mockResolvedValue(undefined);
    const getPullRequestHeadSha = jest.fn().mockResolvedValue('sha-1');
    const labels = bindIssueLabels({ getLabels, setLabels }, mutableBinding);
    const head = bindPullRequestHeadSha({ getPullRequestHeadSha }, mutableBinding);
    mutableBinding.owner = 'attacker';
    mutableBinding.repository = 'other';
    mutableBinding.token = 'replacement';

    await labels.getLabels(7);
    await head.getPullRequestHeadSha(8);

    expect(getLabels).toHaveBeenCalledWith('acme', 'demo', 7, 'secret');
    expect(getPullRequestHeadSha).toHaveBeenCalledWith('acme', 'demo', 8, 'secret');
  });
});
