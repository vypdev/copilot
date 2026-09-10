export declare const MERGE_QUEUE_TARGET_ROLES: readonly ["production", "development", "active-release"];
export type MergeQueueTargetRole = (typeof MERGE_QUEUE_TARGET_ROLES)[number];
export declare const MAX_MERGE_QUEUE_ATTESTATIONS = 50;
export declare const MAX_MERGE_QUEUE_ATTESTATIONS_BYTES = 16384;
export interface MergeQueueCheckAttestation {
    readonly context: string;
    readonly integrationId: number | "any";
    readonly targets: readonly MergeQueueTargetRole[];
}
export type MergeQueueProducerSupport = "supported" | "unsupported" | "unknown";
export interface MergeQueueProducerEvidence {
    readonly kind: "check" | "workflow";
    readonly name: string;
    readonly support: MergeQueueProducerSupport;
    readonly reason: string;
    readonly integrationId?: number | "any";
    readonly path?: string;
}
export interface MergeQueueObservationProblem {
    readonly area: "classic-protection" | "effective-rules" | "workflow-contract" | "queue-membership";
    readonly message: string;
}
export type MergeQueueReadinessVerdict = "not_required" | "ready" | "unknown" | "unsupported";
export type MergeQueueEvaluatedProducer = Omit<MergeQueueProducerEvidence, "support"> & {
    readonly verdict: "verified" | "attested" | "unknown" | "unsupported";
};
export interface MergeQueueReadiness {
    readonly verdict: MergeQueueReadinessVerdict;
    readonly targetRole: MergeQueueTargetRole;
    readonly targetBranch: string;
    readonly producers: readonly MergeQueueEvaluatedProducer[];
    readonly problems: readonly MergeQueueObservationProblem[];
}
export declare function parseMergeQueueCheckAttestations(value: unknown): {
    readonly value: readonly MergeQueueCheckAttestation[];
    readonly errors: readonly string[];
};
export declare function normalizeMergeQueueCheckAttestations(value: unknown): {
    readonly value: readonly MergeQueueCheckAttestation[];
    readonly errors: readonly string[];
};
export declare function evaluateMergeQueueReadiness(input: {
    readonly queueRequired: boolean;
    readonly targetRole: MergeQueueTargetRole;
    readonly targetBranch: string;
    readonly producers: readonly MergeQueueProducerEvidence[];
    readonly problems: readonly MergeQueueObservationProblem[];
    readonly attestations: readonly MergeQueueCheckAttestation[];
}): MergeQueueReadiness;
