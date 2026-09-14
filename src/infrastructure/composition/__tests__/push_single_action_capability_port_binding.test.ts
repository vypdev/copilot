import {
  bindAuthenticatedUser,
  bindBranchChangeSize,
  bindBranchComparison,
  bindBranchDependencies,
  bindBranchListQuery,
  bindBranchSyncNotification,
  bindBranchSyncWorkspace,
  bindDeploymentContinuation,
  bindDeploymentGit,
  bindDeploymentIssues,
  bindDeploymentLabels,
  bindDeploymentPresentation,
  bindDeploymentPublicationReceipt,
  bindDeploymentState,
  bindDeploymentTargetRules,
  bindIssueCommentPublication,
  bindIssueInactivityQuery,
  bindIssueProgress,
  bindIssueReopen,
  bindIssueTypes,
  bindInitialLabels,
  bindManagedPullRequests,
  bindPullRequestBranchQuery,
  bindRepositoryDefaultBranch,
  bindRepositoryRelease,
  bindRepositoryTag,
  bindSetupRemoteConfiguration,
  bindSetupSecrets,
  bindSetupVariables,
  bindSetupWorkspace,
} from '../push_single_action_capability_port_binding';

const binding = Object.freeze({ owner: 'owner', repository: 'repo', token: 'secret-token' });

describe('push and single-action capability binding', () => {
  it('binds repository tag publication and exposes no authority fields', async () => {
    const createTag = jest.fn().mockResolvedValue(true);
    const bound = bindRepositoryTag({ createTag, updateTag: jest.fn(), createOrVerifyTagAtSha: jest.fn() } as never, binding);

    await bound.createTag('develop', 'v1.2.3');

    expect(createTag).toHaveBeenCalledWith('owner', 'repo', 'develop', 'v1.2.3', 'secret-token');
    expect(bound).not.toHaveProperty('token');
    expect(bound).not.toHaveProperty('owner');
    expect(Object.isFrozen(bound)).toBe(true);
  });

  it('binds release publication with the immutable repository scope', async () => {
    const createRelease = jest.fn().mockResolvedValue(true);
    const bound = bindRepositoryRelease({ createRelease, updateRelease: jest.fn() } as never, binding);

    await bound.createRelease('1.2.3', 'Release', 'Changes', 'operation-12345678', 'a'.repeat(40));

    expect(createRelease).toHaveBeenCalledWith(
      'owner', 'repo', '1.2.3', 'Release', 'Changes', 'operation-12345678', 'a'.repeat(40), 'secret-token',
    );
  });

  it('binds issue-comment publication without accepting repository inputs', async () => {
    const addComment = jest.fn().mockResolvedValue(7);
    const bound = bindIssueCommentPublication({ addComment, updateComment: jest.fn(), listIssueComments: jest.fn() } as never, binding);

    await bound.addComment(42, 'Ready');

    expect(addComment).toHaveBeenCalledWith('owner', 'repo', 42, 'Ready', 'secret-token');
  });

  it('binds branch-sync workspace credentials only on remote operations', async () => {
    const prepare = jest.fn().mockResolvedValue(undefined);
    const validatePreparedMerge = jest.fn().mockResolvedValue(undefined);
    const abort = jest.fn().mockResolvedValue(undefined);
    const bound = bindBranchSyncWorkspace({
      prepare,
      validatePreparedMerge,
      assertRemoteHeadsUnchanged: jest.fn(),
      commitAndPush: jest.fn(),
      abort,
    } as never, binding);

    await bound.prepare('develop', 'feature/42');
    await bound.validatePreparedMerge(['src/index.ts']);
    await bound.abort();

    expect(prepare).toHaveBeenCalledWith('develop', 'feature/42', 'secret-token');
    expect(validatePreparedMerge).toHaveBeenCalledWith(['src/index.ts']);
    expect(abort).toHaveBeenCalledWith();
  });

  it('binds authenticated-user lookup to the selected credential', async () => {
    const getUserFromToken = jest.fn().mockResolvedValue('copilot-bot');
    const getTokenUserDetails = jest.fn().mockResolvedValue({ name: 'Copilot', email: 'bot@example.com' });
    const bound = bindAuthenticatedUser({ getUserFromToken, getTokenUserDetails } as never, binding);

    await bound.getUser();
    await bound.getUserDetails();

    expect(getUserFromToken).toHaveBeenCalledWith('secret-token');
    expect(getTokenUserDetails).toHaveBeenCalledWith('secret-token');
  });

  it('binds setup workspace and repository configuration ports', async () => {
    const hasValidToken = jest.fn().mockResolvedValue(true);
    const variableUpsert = jest.fn().mockResolvedValue(undefined);
    const secretUpsert = jest.fn().mockResolvedValue(undefined);
    const inspect = jest.fn().mockResolvedValue({ ownerType: 'User' });
    const workspace = bindSetupWorkspace({ prepare: jest.fn(), hasValidToken } as never, binding);
    const variables = bindSetupVariables({ upsert: variableUpsert } as never, binding);
    const secrets = bindSetupSecrets({ upsertSecrets: secretUpsert } as never, binding);
    const remote = bindSetupRemoteConfiguration({ inspect } as never, binding);

    await workspace.hasValidToken();
    await variables.upsert([{ name: 'ENABLED', value: 'true' }]);
    await secrets.upsertSecrets([{ name: 'PAT', value: 'value' }]);
    await remote.inspect();

    expect(hasValidToken).toHaveBeenCalledWith('secret-token');
    expect(variableUpsert).toHaveBeenCalledWith('owner', 'repo', 'secret-token', [{ name: 'ENABLED', value: 'true' }]);
    expect(secretUpsert).toHaveBeenCalledWith('owner', 'repo', 'secret-token', [{ name: 'PAT', value: 'value' }]);
    expect(inspect).toHaveBeenCalledWith('owner', 'repo', 'secret-token');
  });

  it('binds all deployment git operations to one repository authority', async () => {
    const getBranchSha = jest.fn().mockResolvedValue('a'.repeat(40));
    const deleteBranch = jest.fn().mockResolvedValue(true);
    const bound = bindDeploymentGit({
      getBranchSha,
      getMergeBaseSha: jest.fn(),
      isCommitReachable: jest.fn(),
      createOrVerifyBranch: jest.fn(),
      mergeCommitIntoBranch: jest.fn(),
      deleteBranch,
      listBranches: jest.fn(),
    } as never, binding);

    await bound.getBranchSha('release/1.2.3');
    await bound.deleteBranch('release/1.2.3', 'a'.repeat(40));

    expect(getBranchSha).toHaveBeenCalledWith('owner', 'repo', 'release/1.2.3', 'secret-token');
    expect(deleteBranch).toHaveBeenCalledWith('owner', 'repo', 'release/1.2.3', 'a'.repeat(40), 'secret-token');
  });

  it('binds managed pull-request reads and mutations to one repository', async () => {
    const getPullRequest = jest.fn().mockResolvedValue(undefined);
    const mergePullRequest = jest.fn().mockResolvedValue(true);
    const bound = bindManagedPullRequests({
      findManagedPullRequests: jest.fn(),
      createManagedPullRequest: jest.fn(),
      getPullRequest,
      enableAutoMerge: jest.fn(),
      isPullRequestQueued: jest.fn(),
      enqueuePullRequest: jest.fn(),
      mergePullRequest,
    } as never, binding);

    await bound.getPullRequest(363);
    await bound.mergePullRequest(363);

    expect(getPullRequest).toHaveBeenCalledWith('owner', 'repo', 363, 'secret-token');
    expect(mergePullRequest).toHaveBeenCalledWith('owner', 'repo', 363, 'secret-token');
  });

  it('binds deployment policy, continuation, and presentation ports', async () => {
    const getTargetCapabilities = jest.fn().mockResolvedValue({});
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const updateDashboard = jest.fn().mockResolvedValue(undefined);
    const policy = bindDeploymentTargetRules({ getTargetCapabilities } as never, binding);
    const continuation = bindDeploymentContinuation({ dispatch } as never, binding);
    const presentation = bindDeploymentPresentation({
      findDashboard: jest.fn(), createDashboard: jest.fn(), updateDashboard, publishMilestone: jest.fn(),
    } as never, binding);

    await policy.getTargetCapabilities('master', { pullRequest: 363 });
    await continuation.dispatch('release.yml', 'release/1.2.3', 'operation-12345678', 42, '1.2.3');
    await presentation.updateDashboard(42, 7, 'body');

    expect(getTargetCapabilities).toHaveBeenCalledWith('owner', 'repo', 'master', 'secret-token', { pullRequest: 363 });
    expect(dispatch).toHaveBeenCalledWith(
      'owner', 'repo', 'release.yml', 'release/1.2.3', 'operation-12345678', 42, '1.2.3', 'secret-token',
    );
    expect(updateDashboard).toHaveBeenCalledWith('owner', 'repo', 42, 7, 'body', 'secret-token');
  });

  it('binds deployment receipt inspection and state storage', async () => {
    const inspect = jest.fn().mockResolvedValue({ status: 'published' });
    const stateBind = jest.fn().mockReturnValue({ load: jest.fn(), save: jest.fn() });
    const receipt = bindDeploymentPublicationReceipt({ inspect } as never, binding);
    const state = bindDeploymentState({ bind: stateBind } as never, binding);

    await receipt.inspect({ version: '1.2.3' } as never);
    state.bind(42);

    expect(inspect).toHaveBeenCalledWith(expect.objectContaining({
      version: '1.2.3', owner: 'owner', repository: 'repo', token: 'secret-token',
    }));
    expect(stateBind).toHaveBeenCalledWith({ ...binding, issue: 42 });
  });

  it('binds deployment label and issue lifecycle mutations', async () => {
    const getLabels = jest.fn().mockResolvedValue(['deploy']);
    const setLabels = jest.fn().mockResolvedValue(undefined);
    const closeIssue = jest.fn().mockResolvedValue(undefined);
    const addComment = jest.fn().mockResolvedValue(undefined);
    const labels = bindDeploymentLabels({ getLabels, setLabels } as never, binding);
    const issues = bindDeploymentIssues({ closeIssue, addComment } as never, binding);

    await labels.getLabels(42);
    await labels.setLabels(42, ['deploy']);
    await issues.closeIssue(42);
    await issues.addComment(42, 'Published');

    expect(getLabels).toHaveBeenCalledWith('owner', 'repo', 42, 'secret-token');
    expect(setLabels).toHaveBeenCalledWith('owner', 'repo', 42, ['deploy'], 'secret-token');
    expect(closeIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'secret-token');
    expect(addComment).toHaveBeenCalledWith('owner', 'repo', 42, 'Published', 'secret-token');
  });

  it('forwards every remaining release, comment, and deployment operation through the fixed scope', async () => {
    const tagPort = {
      updateTag: jest.fn(), createTag: jest.fn(), createOrVerifyTagAtSha: jest.fn(),
    };
    const releasePort = { updateRelease: jest.fn(), createRelease: jest.fn() };
    const commentPort = { addComment: jest.fn(), updateComment: jest.fn(), listIssueComments: jest.fn() };
    const gitPort = {
      getBranchSha: jest.fn(), getMergeBaseSha: jest.fn(), isCommitReachable: jest.fn(),
      createOrVerifyBranch: jest.fn(), mergeCommitIntoBranch: jest.fn(), deleteBranch: jest.fn(), listBranches: jest.fn(),
    };
    const pullRequestPort = {
      findManagedPullRequests: jest.fn(), createManagedPullRequest: jest.fn(), getPullRequest: jest.fn(),
      enableAutoMerge: jest.fn(), isPullRequestQueued: jest.fn(), enqueuePullRequest: jest.fn(), mergePullRequest: jest.fn(),
    };
    const presentationPort = {
      findDashboard: jest.fn(), createDashboard: jest.fn(), updateDashboard: jest.fn(), publishMilestone: jest.fn(),
    };
    const tags = bindRepositoryTag(tagPort as never, binding);
    const releases = bindRepositoryRelease(releasePort as never, binding);
    const comments = bindIssueCommentPublication(commentPort as never, binding);
    const git = bindDeploymentGit(gitPort as never, binding);
    const pullRequests = bindManagedPullRequests(pullRequestPort as never, binding);
    const presentation = bindDeploymentPresentation(presentationPort as never, binding);

    await tags.updateTag('next', 'stable');
    await tags.createOrVerifyTagAtSha('a'.repeat(40), 'v1.2.3');
    await releases.updateRelease('next', 'stable');
    await comments.updateComment(42, 7, 'updated');
    await comments.listIssueComments(42);
    await git.getMergeBaseSha('master', 'develop');
    await git.isCommitReachable('master', 'a'.repeat(40));
    await git.createOrVerifyBranch('release/1.2.3', 'a'.repeat(40));
    await git.mergeCommitIntoBranch('develop', 'a'.repeat(40));
    await git.listBranches('release/');
    await pullRequests.findManagedPullRequests({ base: 'master' } as never);
    await pullRequests.createManagedPullRequest({ base: 'master', head: 'develop' } as never);
    await pullRequests.enableAutoMerge('node-1');
    await pullRequests.isPullRequestQueued('node-1');
    await pullRequests.enqueuePullRequest('node-1', 'a'.repeat(40));
    await presentation.findDashboard(42, '<!-- marker -->');
    await presentation.createDashboard(42, 'body');
    await presentation.publishMilestone(42, '<!-- milestone -->', 'body');

    expect(tagPort.updateTag).toHaveBeenCalledWith('owner', 'repo', 'next', 'stable', 'secret-token');
    expect(pullRequestPort.enqueuePullRequest).toHaveBeenCalledWith(
      'owner', 'repo', 'node-1', 'a'.repeat(40), 'secret-token',
    );
    expect(presentationPort.publishMilestone).toHaveBeenCalledWith(
      'owner', 'repo', 42, '<!-- milestone -->', 'body', 'secret-token',
    );
  });

  it('forwards every remaining issue, branch-query, and synchronization operation', async () => {
    const issuePushPort = { openIssue: jest.fn() };
    const inactivityPort = { listOpenIssuesByLabel: jest.fn(), getOpenIssue: jest.fn() };
    const dependencyPort = { listOpenDependencies: jest.fn(), resolveTarget: jest.fn() };
    const notificationPort = { listIssueComments: jest.fn(), addComment: jest.fn(), updateComment: jest.fn() };
    const defaultBranch = bindRepositoryDefaultBranch({ getDefaultBranch: jest.fn() } as never, binding);
    const issuePush = bindIssueReopen(issuePushPort as never, binding);
    const branches = bindBranchListQuery({ getListOfBranches: jest.fn() } as never, binding);
    const pullRequests = bindPullRequestBranchQuery({ getOpenPullRequestNumbersByHeadBranch: jest.fn() } as never, binding);
    const progress = bindIssueProgress({ setProgressLabel: jest.fn() } as never, binding);
    const inactivity = bindIssueInactivityQuery(inactivityPort as never, binding);
    const size = bindBranchChangeSize({ getSizeCategoryAndReason: jest.fn() } as never, binding);
    const dependencies = bindBranchDependencies(dependencyPort as never, binding);
    const comparison = bindBranchComparison({ compare: jest.fn() } as never, binding);
    const notifications = bindBranchSyncNotification(notificationPort as never, binding);

    await defaultBranch.getDefaultBranch();
    await issuePush.openIssue(42);
    await branches.getListOfBranches();
    await pullRequests.getOpenPullRequestNumbersByHeadBranch('feature/42');
    await progress.setProgressLabel(42, 75);
    await inactivity.listOpenIssuesByLabel('state:awaiting-maintainer');
    await inactivity.getOpenIssue(42);
    await size.getSizeCategoryAndReason('feature/42', 'develop', {} as never, {} as never);
    await dependencies.listOpenDependencies();
    await dependencies.resolveTarget(42);
    await comparison.compare('develop', 'feature/42');
    await notifications.listIssueComments(42);
    await notifications.addComment(42, 'body');
    await notifications.updateComment(42, 7, 'updated');

    expect(issuePushPort.openIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'secret-token');
    expect(dependencyPort.resolveTarget).toHaveBeenCalledWith('owner', 'repo', 42, 'secret-token');
    expect(notificationPort.updateComment).toHaveBeenCalledWith('owner', 'repo', 42, 7, 'updated', 'secret-token');
  });

  it('forwards setup provisioning and every credential-bearing workspace operation', async () => {
    const workspacePort = {
      prepare: jest.fn(), validatePreparedMerge: jest.fn(), assertRemoteHeadsUnchanged: jest.fn(),
      commitAndPush: jest.fn(), abort: jest.fn(),
    };
    const variablePort = { upsert: jest.fn(), upsertScopedVariables: jest.fn() };
    const secretPort = { upsertSecrets: jest.fn(), upsertScopedSecrets: jest.fn() };
    const setupWorkspacePort = { prepare: jest.fn(), hasValidToken: jest.fn() };
    const labels = bindInitialLabels({ ensureInitialLabels: jest.fn() } as never, binding);
    const issueTypes = bindIssueTypes({ ensureIssueTypes: jest.fn() } as never, binding);
    const workspace = bindBranchSyncWorkspace(workspacePort as never, binding);
    const setupWorkspace = bindSetupWorkspace(setupWorkspacePort as never, binding);
    const variables = bindSetupVariables(variablePort as never, binding);
    const secrets = bindSetupSecrets(secretPort as never, binding);

    await labels.ensureInitialLabels({} as never);
    await issueTypes.ensureIssueTypes({} as never);
    await workspace.assertRemoteHeadsUnchanged('develop', 'a'.repeat(40), 'feature/42', 'b'.repeat(40));
    await workspace.commitAndPush('feature/42', 'merge', { name: 'Copilot', email: 'bot@example.com' });
    await setupWorkspace.prepare({} as never);
    await variables.upsertScopedVariables!({} as never, [{ name: 'ENABLED', value: 'true' }]);
    await secrets.upsertScopedSecrets!({} as never, [{ name: 'PAT', value: 'value' }]);

    expect(workspacePort.assertRemoteHeadsUnchanged).toHaveBeenCalledWith(
      'develop', 'a'.repeat(40), 'feature/42', 'b'.repeat(40), 'secret-token',
    );
    expect(variablePort.upsertScopedVariables).toHaveBeenCalledWith(
      'owner', 'repo', 'secret-token', {}, [{ name: 'ENABLED', value: 'true' }],
    );
    expect(secretPort.upsertScopedSecrets).toHaveBeenCalledWith(
      'owner', 'repo', 'secret-token', {}, [{ name: 'PAT', value: 'value' }],
    );
  });
});
