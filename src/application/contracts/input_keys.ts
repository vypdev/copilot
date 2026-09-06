/** Canonical action and CLI input vocabulary shared by input mappers. */
export const INPUT_KEYS = {
    // Debug
    DEBUG: 'debug',

    // Welcome
    WELCOME_TITLE: 'welcome-title',
    WELCOME_MESSAGES: 'welcome-messages',

    // Single action
    SINGLE_ACTION: 'single-action',
    SINGLE_ACTION_ISSUE: 'single-action-issue',
    SINGLE_ACTION_VERSION: 'single-action-version',
    SINGLE_ACTION_TITLE: 'single-action-title',
    SINGLE_ACTION_CHANGELOG: 'single-action-changelog',
    INACTIVITY_THRESHOLD_HOURS: 'inactivity-threshold-hours',

    // Tokens
    TOKEN: 'token',
    QUEUE_GATE_ONLY: 'queue-gate-only',

    // Agent selection
    AGENT_PROVIDER: 'agent-provider',
    AGENT_MODEL_PROVIDER: 'agent-model-provider',
    AGENT_EFFORT: 'agent-effort',

    AGENT_MODEL: 'agent-model',
    AGENT_COMMAND: 'agent-command',
    FINDINGS_PROVIDER: 'findings-provider',
    FINDINGS_MODEL_PROVIDER: 'findings-model-provider',
    FINDINGS_EFFORT: 'findings-effort',

    FINDINGS_MODEL: 'findings-model',
    FINDINGS_COMMAND: 'findings-command',
    FIXER_PROVIDER: 'fixer-provider',
    FIXER_MODEL_PROVIDER: 'fixer-model-provider',
    FIXER_EFFORT: 'fixer-effort',

    FIXER_MODEL: 'fixer-model',
    FIXER_COMMAND: 'fixer-command',
    PLANNER_PROVIDER: 'planner-provider',
    PLANNER_MODEL_PROVIDER: 'planner-model-provider',
    PLANNER_EFFORT: 'planner-effort',
    PLANNER_MODEL: 'planner-model',
    PLANNER_COMMAND: 'planner-command',
    REVIEWER_PROVIDER: 'reviewer-provider',
    REVIEWER_MODEL_PROVIDER: 'reviewer-model-provider',
    REVIEWER_EFFORT: 'reviewer-effort',
    REVIEWER_MODEL: 'reviewer-model',
    REVIEWER_COMMAND: 'reviewer-command',
    TESTER_PROVIDER: 'tester-provider',
    TESTER_MODEL_PROVIDER: 'tester-model-provider',
    TESTER_EFFORT: 'tester-effort',
    TESTER_MODEL: 'tester-model',
    TESTER_COMMAND: 'tester-command',
    RELEASE_PROVIDER: 'release-provider',
    RELEASE_MODEL_PROVIDER: 'release-model-provider',
    RELEASE_EFFORT: 'release-effort',
    RELEASE_MODEL: 'release-model',
    RELEASE_COMMAND: 'release-command',

    // AI configuration
    AI_PULL_REQUEST_DESCRIPTION: 'ai-pull-request-description',
    AI_PULL_REQUEST_DESCRIPTION_MODE: 'ai-pull-request-description-mode',
    AI_MEMBERS_ONLY: 'ai-members-only',
    AI_IGNORE_FILES: 'ai-ignore-files',
    AI_INCLUDE_REASONING: 'ai-include-reasoning',
    BUGBOT_SEVERITY: 'bugbot-severity',
    BUGBOT_COMMENT_LIMIT: 'bugbot-comment-limit',
    BUGBOT_FIX_VERIFY_COMMANDS: 'bugbot-fix-verify-commands',

    // Projects
    PROJECT_IDS: 'project-ids',
    PROJECT_COLUMN_ISSUE_CREATED: 'project-column-issue-created',
    PROJECT_COLUMN_PULL_REQUEST_CREATED: 'project-column-pull-request-created',
    PROJECT_COLUMN_ISSUE_IN_PROGRESS: 'project-column-issue-in-progress',
    PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS: 'project-column-pull-request-in-progress',

    // Images
    IMAGES_ON_ISSUE: 'images-on-issue',
    IMAGES_ON_PULL_REQUEST: 'images-on-pull-request',
    IMAGES_ON_COMMIT: 'images-on-commit',
    IMAGES_ISSUE_AUTOMATIC: 'images-issue-automatic',
    IMAGES_ISSUE_FEATURE: 'images-issue-feature',
    IMAGES_ISSUE_BUGFIX: 'images-issue-bugfix',
    IMAGES_ISSUE_DOCS: 'images-issue-docs',
    IMAGES_ISSUE_CHORE: 'images-issue-chore',
    IMAGES_ISSUE_RELEASE: 'images-issue-release',
    IMAGES_ISSUE_HOTFIX: 'images-issue-hotfix',
    IMAGES_PULL_REQUEST_AUTOMATIC: 'images-pull-request-automatic',
    IMAGES_PULL_REQUEST_FEATURE: 'images-pull-request-feature',
    IMAGES_PULL_REQUEST_BUGFIX: 'images-pull-request-bugfix',
    IMAGES_PULL_REQUEST_RELEASE: 'images-pull-request-release',
    IMAGES_PULL_REQUEST_HOTFIX: 'images-pull-request-hotfix',
    IMAGES_PULL_REQUEST_DOCS: 'images-pull-request-docs',
    IMAGES_PULL_REQUEST_CHORE: 'images-pull-request-chore',
    IMAGES_COMMIT_AUTOMATIC: 'images-commit-automatic',
    IMAGES_COMMIT_FEATURE: 'images-commit-feature',
    IMAGES_COMMIT_BUGFIX: 'images-commit-bugfix',
    IMAGES_COMMIT_RELEASE: 'images-commit-release',
    IMAGES_COMMIT_HOTFIX: 'images-commit-hotfix',
    IMAGES_COMMIT_DOCS: 'images-commit-docs',
    IMAGES_COMMIT_CHORE: 'images-commit-chore',

    // Workflows
    RELEASE_WORKFLOW: 'release-workflow',
    HOTFIX_WORKFLOW: 'hotfix-workflow',

    // Emoji
    EMOJI_LABELED_TITLE: 'emoji-labeled-title',
    BRANCH_MANAGEMENT_EMOJI: 'branch-management-emoji',

    // Labels
    BRANCH_MANAGEMENT_LAUNCHER_LABEL: 'branch-management-launcher-label',
    BUGFIX_LABEL: 'bugfix-label',
    BUG_LABEL: 'bug-label',
    HOTFIX_LABEL: 'hotfix-label',
    ENHANCEMENT_LABEL: 'enhancement-label',
    FEATURE_LABEL: 'feature-label',
    RELEASE_LABEL: 'release-label',
    QUESTION_LABEL: 'question-label',
    HELP_LABEL: 'help-label',
    DEPLOY_LABEL: 'deploy-label',
    DEPLOYED_LABEL: 'deployed-label',
    DOCS_LABEL: 'docs-label',
    DOCUMENTATION_LABEL: 'documentation-label',
    CHORE_LABEL: 'chore-label',
    MAINTENANCE_LABEL: 'maintenance-label',
    PRIORITY_HIGH_LABEL: 'priority-high-label',
    PRIORITY_MEDIUM_LABEL: 'priority-medium-label',
    PRIORITY_LOW_LABEL: 'priority-low-label',
    PRIORITY_NONE_LABEL: 'priority-none-label',
    SIZE_XXL_LABEL: 'size-xxl-label',
    SIZE_XL_LABEL: 'size-xl-label',
    SIZE_L_LABEL: 'size-l-label',
    SIZE_M_LABEL: 'size-m-label',
    SIZE_S_LABEL: 'size-s-label',
    SIZE_XS_LABEL: 'size-xs-label',

    // Lifecycle label inputs
    STATE_AI_PROCESSING_LABEL: 'state-ai-processing-label',
    STATE_PLANNED_LABEL: 'state-planned-label',
    STATE_IN_PROGRESS_LABEL: 'state-in-progress-label',
    STATE_REVIEWING_LABEL: 'state-reviewing-label',
    STATE_CHANGES_REQUESTED_LABEL: 'state-changes-requested-label',
    STATE_VERIFIED_LABEL: 'state-verified-label',
    STATE_READY_LABEL: 'state-ready-label',
    STATE_BLOCKED_LABEL: 'state-blocked-label',
    STATE_AWAITING_MAINTAINER_LABEL: 'state-awaiting-maintainer-label',
    STATE_AWAITING_ISSUE_AUTHOR_LABEL: 'state-awaiting-issue-author-label',

    // Issue Types
    ISSUE_TYPE_BUG: 'issue-type-bug',
    ISSUE_TYPE_BUG_DESCRIPTION: 'issue-type-bug-description',
    ISSUE_TYPE_BUG_COLOR: 'issue-type-bug-color',

    ISSUE_TYPE_HOTFIX: 'issue-type-hotfix',
    ISSUE_TYPE_HOTFIX_DESCRIPTION: 'issue-type-hotfix-description',
    ISSUE_TYPE_HOTFIX_COLOR: 'issue-type-hotfix-color',

    ISSUE_TYPE_FEATURE: 'issue-type-feature',
    ISSUE_TYPE_FEATURE_DESCRIPTION: 'issue-type-feature-description',
    ISSUE_TYPE_FEATURE_COLOR: 'issue-type-feature-color',

    ISSUE_TYPE_DOCUMENTATION: 'issue-type-documentation',
    ISSUE_TYPE_DOCUMENTATION_DESCRIPTION: 'issue-type-documentation-description',
    ISSUE_TYPE_DOCUMENTATION_COLOR: 'issue-type-documentation-color',

    ISSUE_TYPE_MAINTENANCE: 'issue-type-maintenance',
    ISSUE_TYPE_MAINTENANCE_DESCRIPTION: 'issue-type-maintenance-description',
    ISSUE_TYPE_MAINTENANCE_COLOR: 'issue-type-maintenance-color',

    ISSUE_TYPE_RELEASE: 'issue-type-release',
    ISSUE_TYPE_RELEASE_DESCRIPTION: 'issue-type-release-description',
    ISSUE_TYPE_RELEASE_COLOR: 'issue-type-release-color',

    ISSUE_TYPE_QUESTION: 'issue-type-question',
    ISSUE_TYPE_QUESTION_DESCRIPTION: 'issue-type-question-description',
    ISSUE_TYPE_QUESTION_COLOR: 'issue-type-question-color',

    ISSUE_TYPE_HELP: 'issue-type-help',
    ISSUE_TYPE_HELP_DESCRIPTION: 'issue-type-help-description',
    ISSUE_TYPE_HELP_COLOR: 'issue-type-help-color',

    ISSUE_TYPE_TASK: 'issue-type-task',
    ISSUE_TYPE_TASK_DESCRIPTION: 'issue-type-task-description',
    ISSUE_TYPE_TASK_COLOR: 'issue-type-task-color',

    // Locale
    ISSUES_LOCALE: 'issues-locale',
    PULL_REQUESTS_LOCALE: 'pull-requests-locale',

    // Size Thresholds
    SIZE_XXL_THRESHOLD_LINES: 'size-xxl-threshold-lines',
    SIZE_XXL_THRESHOLD_FILES: 'size-xxl-threshold-files',
    SIZE_XXL_THRESHOLD_COMMITS: 'size-xxl-threshold-commits',
    SIZE_XL_THRESHOLD_LINES: 'size-xl-threshold-lines',
    SIZE_XL_THRESHOLD_FILES: 'size-xl-threshold-files',
    SIZE_XL_THRESHOLD_COMMITS: 'size-xl-threshold-commits',
    SIZE_L_THRESHOLD_LINES: 'size-l-threshold-lines',
    SIZE_L_THRESHOLD_FILES: 'size-l-threshold-files',
    SIZE_L_THRESHOLD_COMMITS: 'size-l-threshold-commits',
    SIZE_M_THRESHOLD_LINES: 'size-m-threshold-lines',
    SIZE_M_THRESHOLD_FILES: 'size-m-threshold-files',
    SIZE_M_THRESHOLD_COMMITS: 'size-m-threshold-commits',
    SIZE_S_THRESHOLD_LINES: 'size-s-threshold-lines',
    SIZE_S_THRESHOLD_FILES: 'size-s-threshold-files',
    SIZE_S_THRESHOLD_COMMITS: 'size-s-threshold-commits',
    SIZE_XS_THRESHOLD_LINES: 'size-xs-threshold-lines',
    SIZE_XS_THRESHOLD_FILES: 'size-xs-threshold-files',
    SIZE_XS_THRESHOLD_COMMITS: 'size-xs-threshold-commits',

    // Branches
    MAIN_BRANCH: 'main-branch',
    DEVELOPMENT_BRANCH: 'development-branch',
    FEATURE_TREE: 'feature-tree',
    BUGFIX_TREE: 'bugfix-tree',
    HOTFIX_TREE: 'hotfix-tree',
    RELEASE_TREE: 'release-tree',
    DOCS_TREE: 'docs-tree',
    CHORE_TREE: 'chore-tree',

    // Commit
    COMMIT_PREFIX_TRANSFORMS: 'commit-prefix-transforms',

    // Issue
    BRANCH_MANAGEMENT_ALWAYS: 'branch-management-always',
    REOPEN_ISSUE_ON_PUSH: 'reopen-issue-on-push',
    DESIRED_ASSIGNEES_COUNT: 'desired-assignees-count',

    // Pull Request
    PULL_REQUEST_DESIRED_ASSIGNEES_COUNT: 'desired-assignees-count',
    PULL_REQUEST_DESIRED_REVIEWERS_COUNT: 'desired-reviewers-count',
    PULL_REQUEST_MERGE_TIMEOUT: 'merge-timeout',

} as const;
