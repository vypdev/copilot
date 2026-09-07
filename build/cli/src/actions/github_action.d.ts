export declare function runGitHubAction(): Promise<void>;
/**
 * Runs the action entrypoint without forcing a successful process exit.
 *
 * `@actions/core.setFailed` deliberately communicates failure through
 * `process.exitCode`. Calling `process.exit(0)` after a resolved workflow would
 * overwrite that signal (for example when Bugbot is configured to fail on
 * unresolved findings), so this boundary must let Node exit naturally.
 */
export declare function runGitHubActionEntry(run?: () => Promise<void>): Promise<void>;
