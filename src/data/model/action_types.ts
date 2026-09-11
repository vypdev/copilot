/** Supported single-action commands understood by the domain model. */
export const ACTIONS = {
    PUBLISH_GITHUB_ACTION: 'publish_github_action',
    CREATE_RELEASE: 'create_release',
    CREATE_TAG: 'create_tag',
    THINK: 'think_action',
    INITIAL_SETUP: 'initial_setup',
    CHECK_PROGRESS: 'check_progress_action',
    DETECT_POTENTIAL_PROBLEMS: 'detect_potential_problems_action',
    RECOMMEND_STEPS: 'recommend_steps_action',
    CLOSE_INACTIVE_ISSUES: 'close_inactive_issues_action',
    PUBLISH_ISSUE_COMMENT: 'publish_issue_comment',
    CHECK_BRANCH_SYNC: 'check_branch_sync_action',
    PREPARE_DEPLOYMENT: 'prepare_deployment_action',
    CONTINUE_DEPLOYMENT: 'continue_deployment_action',
    PUBLISHED_DEPLOYMENT: 'published_deployment_action',
    FAILED_DEPLOYMENT: 'failed_deployment_action',
} as const;
