export type SourceDependencyFailureReason = 'tool-unavailable' | 'unsupported-graph' | 'install-failed' | 'candidate-changed';

export class SourceDependencyError extends Error {
    constructor(readonly reason: SourceDependencyFailureReason) {
        super(`Candidate dependency preparation blocked (${reason}). Review the source verification environment and frozen workspace graph before retrying.`);
    }
}
