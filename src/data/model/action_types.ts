/** Supported single-action commands understood by the domain model. */
export const ACTIONS = {
    DEPLOYED: 'deployed_action',
    PUBLISH_GITHUB_ACTION: 'publish_github_action',
    CREATE_RELEASE: 'create_release',
    CREATE_TAG: 'create_tag',
    THINK: 'think_action',
    INITIAL_SETUP: 'initial_setup',
    CHECK_PROGRESS: 'check_progress_action',
    DETECT_POTENTIAL_PROBLEMS: 'detect_potential_problems_action',
    RECOMMEND_STEPS: 'recommend_steps_action',
} as const;
