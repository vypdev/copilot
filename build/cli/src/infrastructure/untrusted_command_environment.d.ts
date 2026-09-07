export interface PreparedUntrustedCommandEnvironment {
    environment: Record<string, string>;
    cleanup(): void;
}
/**
 * Repository verification commands are untrusted process boundaries. They get
 * a fresh home and only non-secret process metadata, never agent/GitHub/cloud
 * credentials or paths to local agent authentication stores.
 */
export declare function prepareUntrustedCommandEnvironment(source?: NodeJS.ProcessEnv): PreparedUntrustedCommandEnvironment;
