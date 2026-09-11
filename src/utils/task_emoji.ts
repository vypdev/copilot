/**
 * Representative emoji per task for "Executing {taskId}" logs.
 * Makes it easier to visually identify the step type in the action output.
 */
const TASK_EMOJI: Record<string, string> = {
    // Main use cases
    CommitUseCase: '📤',
    IssueUseCase: '📋',
    PullRequestUseCase: '🔀',
    IssueCommentUseCase: '💬',
    PullRequestReviewCommentUseCase: '💬',
    SingleActionUseCase: '⚡',
    // Issue steps
    PrepareBranchesUseCase: '🌿',
    CheckPermissionsUseCase: '🔐',
    UpdateTitleUseCase: '✏️',
    AssignMemberToIssueUseCase: '👤',
    AssignReviewersToIssueUseCase: '👀',
    LinkIssueProjectUseCase: '🔗',
    LinkPullRequestProjectUseCase: '🔗',
    LinkPullRequestIssueUseCase: '🔗',
    CheckPriorityIssueSizeUseCase: '📏',
    CheckPriorityPullRequestSizeUseCase: '📏',
    CloseNotAllowedIssueUseCase: '🚫',
    CloseIssueAfterMergingUseCase: '✅',
    RemoveIssueBranchesUseCase: '🧹',
    RemoveNotNeededBranchesUseCase: '🧹',
    DeployAddedUseCase: '🏷️',
    MoveIssueToInProgressUseCase: '📥',
    UpdateIssueTypeUseCase: '🏷️',
    // Commit steps
    NotifyNewCommitOnIssueUseCase: '📢',
    CheckChangesIssueSizeUseCase: '📐',
    DetectPotentialProblemsUseCase: '🔍',
    // PR steps
    SyncSizeAndProgressLabelsFromIssueToPrUseCase: '🔄',
    UpdatePullRequestDescriptionUseCase: '✏️',
    CheckIssueCommentLanguageUseCase: '🌐',
    CheckPullRequestCommentLanguageUseCase: '🌐',
    // Common steps
    PublishResultUseCase: '📄',
    StoreConfigurationUseCase: '⚙️',
    GetReleaseVersionUseCase: '🏷️',
    GetReleaseTypeUseCase: '🏷️',
    GetHotfixVersionUseCase: '🏷️',
    CommitPrefixBuilderUseCase: '📜',
    ThinkUseCase: '💭',
    // Actions
    CheckProgressUseCase: '📊',
    RecommendStepsUseCase: '💡',
    CreateReleaseUseCase: '🎉',
    CreateTagUseCase: '🏷️',
    PublishGithubActionUseCase: '📦',
    InitialSetupUseCase: '🛠️',
};

const DEFAULT_EMOJI = '▶️';

export function getTaskEmoji(taskId: string): string {
    return TASK_EMOJI[taskId] ?? DEFAULT_EMOJI;
}
