export const MERGE_QUEUE_TARGET_ROLES = ["production", "development", "active-release"] as const;
export type MergeQueueTargetRole = (typeof MERGE_QUEUE_TARGET_ROLES)[number];

export const MAX_MERGE_QUEUE_ATTESTATIONS = 50;
export const MAX_MERGE_QUEUE_ATTESTATIONS_BYTES = 16_384;

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

export function parseMergeQueueCheckAttestations(
  value: unknown,
): { readonly value: readonly MergeQueueCheckAttestation[]; readonly errors: readonly string[] } {
  if (value === undefined || value === null || String(value).trim() === "") return { value: [], errors: [] };
  const serialized = String(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_MERGE_QUEUE_ATTESTATIONS_BYTES) {
    return { value: [], errors: [`merge-queue-check-attestations must be at most ${MAX_MERGE_QUEUE_ATTESTATIONS_BYTES} bytes.`] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { value: [], errors: ["merge-queue-check-attestations must be a valid JSON array."] };
  }
  return normalizeMergeQueueCheckAttestations(parsed);
}

export function normalizeMergeQueueCheckAttestations(
  value: unknown,
): { readonly value: readonly MergeQueueCheckAttestation[]; readonly errors: readonly string[] } {
  if (!Array.isArray(value)) return { value: [], errors: ["Merge queue check attestations must be an array."] };
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { value: [], errors: ["Merge queue check attestations must be serializable JSON data."] };
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_MERGE_QUEUE_ATTESTATIONS_BYTES) {
    return { value: [], errors: [`Merge queue check attestations must be at most ${MAX_MERGE_QUEUE_ATTESTATIONS_BYTES} bytes.`] };
  }
  if (value.length > MAX_MERGE_QUEUE_ATTESTATIONS) {
    return { value: [], errors: [`Merge queue check attestations must contain at most ${MAX_MERGE_QUEUE_ATTESTATIONS} entries.`] };
  }
  const attestations: MergeQueueCheckAttestation[] = [];
  const errors: string[] = [];
  const identities = new Set<string>();
  value.forEach((candidate, index) => {
    const prefix = `Merge queue check attestation ${index + 1}`;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    const item = candidate as Record<string, unknown>;
    const unexpected = Object.keys(item).filter((key) => !["context", "integrationId", "targets"].includes(key));
    if (unexpected.length > 0) errors.push(`${prefix} has unknown field(s): ${unexpected.join(", ")}.`);
    const context = typeof item.context === "string" ? item.context.trim() : "";
    if (!context || context.length > 255 || hasUnsafeControlCharacter(context)) {
      errors.push(`${prefix} context must be a non-empty check name of at most 255 characters without control characters.`);
    }
    const integrationId = item.integrationId;
    if (integrationId !== "any" && !(typeof integrationId === "number" && Number.isSafeInteger(integrationId) && integrationId > 0)) {
      errors.push(`${prefix} integrationId must be a positive integer or "any".`);
    }
    const targets = Array.isArray(item.targets) ? item.targets : [];
    const normalizedTargets = targets.filter((target): target is MergeQueueTargetRole =>
      typeof target === "string" && MERGE_QUEUE_TARGET_ROLES.includes(target as MergeQueueTargetRole));
    const targetsValid = targets.length >= 1
      && targets.length <= MERGE_QUEUE_TARGET_ROLES.length
      && normalizedTargets.length === targets.length
      && new Set(normalizedTargets).size === normalizedTargets.length;
    if (!targetsValid) {
      errors.push(`${prefix} targets must contain 1-${MERGE_QUEUE_TARGET_ROLES.length} unique values from: ${MERGE_QUEUE_TARGET_ROLES.join(", ")}.`);
    }
    const identityValid = context.length > 0
      && context.length <= 255
      && !hasUnsafeControlCharacter(context)
      && (integrationId === "any"
        || (typeof integrationId === "number" && Number.isSafeInteger(integrationId) && integrationId > 0));
    if (identityValid) {
      const identity = `${context}\0${integrationId}`;
      if (identities.has(identity)) errors.push(`${prefix} duplicates check identity ${context}.`);
      identities.add(identity);
    }
    if (unexpected.length === 0 && identityValid && targetsValid) {
      attestations.push({ context, integrationId, targets: normalizedTargets });
    }
  });
  return errors.length > 0 ? { value: [], errors } : { value: attestations, errors: [] };
}

export function evaluateMergeQueueReadiness(input: {
  readonly queueRequired: boolean;
  readonly targetRole: MergeQueueTargetRole;
  readonly targetBranch: string;
  readonly producers: readonly MergeQueueProducerEvidence[];
  readonly problems: readonly MergeQueueObservationProblem[];
  readonly attestations: readonly MergeQueueCheckAttestation[];
}): MergeQueueReadiness {
  if (!input.queueRequired) {
    return {
      verdict: "not_required",
      targetRole: input.targetRole,
      targetBranch: input.targetBranch,
      producers: [],
      problems: input.problems,
    };
  }
  const producers: MergeQueueEvaluatedProducer[] = input.producers.map((producer) => {
    if (producer.support === "supported") return { ...producer, verdict: "verified" };
    if (producer.support === "unsupported") return { ...producer, verdict: "unsupported" };
    const attested = producer.kind === "check"
      && producer.integrationId !== undefined
      && input.attestations.some((attestation) =>
        attestation.context === producer.name
        && attestation.integrationId === producer.integrationId
        && attestation.targets.includes(input.targetRole));
    return { ...producer, verdict: attested ? "attested" : "unknown" };
  });
  const verdict: MergeQueueReadinessVerdict = producers.some((producer) => producer.verdict === "unsupported")
    ? "unsupported"
    : input.problems.length > 0 || producers.some((producer) => producer.verdict === "unknown")
      ? "unknown"
      : "ready";
  return {
    verdict,
    targetRole: input.targetRole,
    targetBranch: input.targetBranch,
    producers,
    problems: input.problems,
  };
}

function hasUnsafeControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}
