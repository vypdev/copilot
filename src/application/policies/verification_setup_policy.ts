export const VERIFICATION_SETUP_PATH = '.copilot/verification-setup.mjs';
export const VERIFICATION_SETUP_LIMITS = Object.freeze({ timeoutMs: 300_000, outputBytes: 65_536, resultBytes: 16_384, scriptBytes: 65_536 });
export const VERIFICATION_SETUP_HELP = 'https://docs.page/vypdev/copilot/security-operations/operations/verification#repository-owned-setup';

export type VerificationSetupFailure = 'source-unavailable' | 'helper-invalid' | 'workspace-changed' | 'process-failed' | 'timeout' | 'cancelled' | 'output-limit' | 'result-invalid';

/** Closed facts only. Provider/helper output and raw exception causes never cross this boundary. */
export class VerificationSetupError extends Error {
    constructor(readonly reason: VerificationSetupFailure, sourceSha?: string, readonly exitCode?: number) {
        const sha = sourceSha && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(sourceSha) ? sourceSha : 'unavailable';
        const exit = Number.isInteger(exitCode) && exitCode! >= 0 && exitCode! <= 255 ? ` Exit status: ${exitCode}.` : '';
        super(`Repository setup blocked verification (${reason}). Review ${VERIFICATION_SETUP_PATH} on the trusted main branch and rerun. Trusted source SHA: ${sha}.${exit} Verification, commit and push are withheld. Help: ${VERIFICATION_SETUP_HELP}`);
        this.name = 'VerificationSetupError';
    }
}

export interface VerificationSetupResult {
    readonly path: readonly string[];
    readonly javaHome?: string;
}

function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pathString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 2048
        && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

/** Filesystem containment is checked by the adapter, after this closed schema is parsed. */
export function parseVerificationSetupResult(value: unknown): VerificationSetupResult {
    if (!record(value) || value.schemaVersion !== 1 || Object.keys(value).some(key => !['schemaVersion', 'path', 'environment'].includes(key))) {
        throw new VerificationSetupError('result-invalid');
    }
    const paths = value.path === undefined ? [] : value.path;
    const environment = value.environment === undefined ? {} : value.environment;
    if (!Array.isArray(paths) || paths.length > 8 || !paths.every(pathString) || new Set(paths).size !== paths.length
        || !record(environment) || Object.keys(environment).some(key => key !== 'JAVA_HOME')
        || ('JAVA_HOME' in environment && !pathString(environment.JAVA_HOME))) {
        throw new VerificationSetupError('result-invalid');
    }
    return Object.freeze({ path: Object.freeze([...paths]), ...(environment.JAVA_HOME ? { javaHome: environment.JAVA_HOME as string } : {}) });
}
