export interface ConfigurationPersistenceContext {
    readonly isSingleAction: boolean;
    readonly singleAction: {
        readonly isRecommendStepsAction: boolean;
    };
}
/**
 * Decides whether the completion phase has persistent execution state to save.
 *
 * Release/deployment single actions use the issue configuration as read-only
 * context. Writing it back after every action is unnecessary and can race with
 * the issue-comment workflow triggered by the action's own notification.
 * Recommendation actions are the exception because they persist their
 * fingerprint and latest recommendation in the hidden issue configuration.
 */
export declare function shouldPersistConfiguration(execution: ConfigurationPersistenceContext): boolean;
