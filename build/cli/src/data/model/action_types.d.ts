/** Supported single-action commands understood by the domain model. */
export declare const ACTIONS: {
    readonly DEPLOYED: "deployed_action";
    readonly PUBLISH_GITHUB_ACTION: "publish_github_action";
    readonly CREATE_RELEASE: "create_release";
    readonly CREATE_TAG: "create_tag";
    readonly THINK: "think_action";
    readonly INITIAL_SETUP: "initial_setup";
    readonly CHECK_PROGRESS: "check_progress_action";
    readonly DETECT_POTENTIAL_PROBLEMS: "detect_potential_problems_action";
    readonly RECOMMEND_STEPS: "recommend_steps_action";
};
