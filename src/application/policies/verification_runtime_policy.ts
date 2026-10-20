export const VERIFICATION_RUNTIME_MANIFEST = '.copilot/verification-prerequisites.json';
export const VERIFICATION_RUNTIME_HELP = 'https://docs.page/vypdev/copilot/security-operations/operations/verification#repository-verification-prerequisites';
export const VERIFICATION_RUNTIME_SPECS = {
    java: { label: 'Java', program: 'java', args: ['-version'] },
    node: { label: 'Node.js', program: 'node', args: ['--version'] },
    pnpm: { label: 'pnpm', program: 'pnpm', args: ['--version'] },
    python: { label: 'Python', program: 'python3', args: ['--version'] },
    go: { label: 'Go', program: 'go', args: ['version'] },
    dotnet: { label: '.NET SDK', program: 'dotnet', args: ['--version'] },
    ruby: { label: 'Ruby', program: 'ruby', args: ['--version'] },
    rust: { label: 'Rust', program: 'rustc', args: ['--version'] },
} as const;
export type VerificationRuntimeId = keyof typeof VERIFICATION_RUNTIME_SPECS;
export interface VerificationRuntimeRequirement { readonly runtime: VerificationRuntimeId; readonly version: string }
type PrerequisiteFailure = 'manifest-invalid' | 'unavailable' | 'version-mismatch' | 'unreadable-version';
const VERSION_PREFIX = /^[1-9]\d{0,2}(?:\.(?:0|[1-9]\d{0,2})){0,2}$/u;

/** Only reviewed, closed runtime/version facts enter user-visible diagnostics. Raw tool output never does. */
export class VerificationPrerequisiteError extends Error {
    constructor(reason: PrerequisiteFailure, requirement?: VerificationRuntimeRequirement, observed?: string, job?: string) {
        const jobLabel = job && /^[A-Za-z_][A-Za-z0-9_-]{0,99}$/u.test(job) ? ` in job ${job}` : ' in this job';
        const runtime = requirement && Object.prototype.hasOwnProperty.call(VERIFICATION_RUNTIME_SPECS, requirement.runtime)
            ? VERIFICATION_RUNTIME_SPECS[requirement.runtime].label : 'Required runtime';
        const version = requirement && VERSION_PREFIX.test(requirement.version) ? requirement.version : 'declared version';
        const actual = observed && /^[1-9]\d{0,2}(?:\.(?:0|[1-9]\d{0,2})){0,3}$/u.test(observed) ? observed : 'unavailable';
        const cause = reason === 'manifest-invalid' ? `${VERIFICATION_RUNTIME_MANIFEST} is invalid or unsafe`
            : reason === 'version-mismatch' ? `${runtime} ${version} is required; observed ${actual}`
                : reason === 'unreadable-version' ? `${runtime} ${version} could not be verified`
                    : `${runtime} ${version} is unavailable`;
        const action = reason === 'manifest-invalid' ? 'Correct the reviewed runtime declaration.'
            : `Provision the declared runtime in the same job before Copilot, then retry.${requirement?.runtime === 'java' ? ' For Java, configure actions/setup-java or a managed JAVA_HOME.' : ''}`;
        super(`Repository verification is blocked${jobLabel}: ${cause}. ${action} The repository verification command was not run. Help: ${VERIFICATION_RUNTIME_HELP}`);
        this.name = 'VerificationPrerequisiteError';
    }
}

export function parseVerificationRuntimeManifest(value: unknown): readonly VerificationRuntimeRequirement[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VerificationPrerequisiteError('manifest-invalid');
    const object = value as Record<string, unknown>;
    if (object.schemaVersion !== 1 || Object.keys(object).some(key => !['schemaVersion', 'runtimes'].includes(key))
        || !object.runtimes || typeof object.runtimes !== 'object' || Array.isArray(object.runtimes)) {
        throw new VerificationPrerequisiteError('manifest-invalid');
    }
    const runtimes = object.runtimes as Record<string, unknown>;
    if (Object.keys(runtimes).length > 8) throw new VerificationPrerequisiteError('manifest-invalid');
    return Object.entries(runtimes).map(([runtime, version]) => {
        if (!Object.prototype.hasOwnProperty.call(VERIFICATION_RUNTIME_SPECS, runtime) || typeof version !== 'string' || !VERSION_PREFIX.test(version)) {
            throw new VerificationPrerequisiteError('manifest-invalid');
        }
        return Object.freeze({ runtime: runtime as VerificationRuntimeId, version });
    });
}

export function verificationRuntimeVersion(runtime: VerificationRuntimeId, output: string): string | undefined {
    const patterns: Record<VerificationRuntimeId, RegExp> = {
        java: /^(?:openjdk|java) (?:version )?["']?(\d+(?:\.\d+){0,3})/imu,
        node: /^v(\d+\.\d+\.\d+)/mu,
        pnpm: /^(\d+\.\d+\.\d+)/mu,
        python: /^Python (\d+\.\d+\.\d+)/mu,
        go: /^go version go(\d+\.\d+(?:\.\d+)?)/mu,
        dotnet: /^(\d+\.\d+\.\d+)/mu,
        ruby: /^ruby (\d+\.\d+\.\d+)/mu,
        rust: /^rustc (\d+\.\d+\.\d+)/mu,
    };
    const version = patterns[runtime].exec(output)?.[1];
    return runtime === 'java' && version?.startsWith('1.') ? version.slice(2) : version;
}

export function verificationRuntimeMatches(required: string, observed: string): boolean {
    return observed === required || observed.startsWith(`${required}.`);
}
