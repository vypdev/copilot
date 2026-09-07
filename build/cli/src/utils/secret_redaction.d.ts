/** Redacts common credential formats from text before it reaches logs or GitHub. */
export declare function redactSecretLikeValues(value: string): string;
/** Redacts exact credential values known to the current process, including non-standard token formats. */
export declare function redactKnownEnvironmentSecrets(value: string, environment?: NodeJS.ProcessEnv): string;
