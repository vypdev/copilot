import {
  MAX_MERGE_QUEUE_ATTESTATIONS,
  evaluateMergeQueueReadiness,
  normalizeMergeQueueCheckAttestations,
  parseMergeQueueCheckAttestations,
  type MergeQueueProducerEvidence,
} from "../merge_queue_readiness";

const unknownCheck = (overrides: Partial<MergeQueueProducerEvidence> = {}): MergeQueueProducerEvidence => ({
  kind: "check",
  name: "External CI",
  integrationId: 1234,
  support: "unknown",
  reason: "External producer cannot be inspected.",
  ...overrides,
});

describe("merge queue readiness", () => {
  it("parses and normalizes exact attestations", () => {
    expect(parseMergeQueueCheckAttestations(JSON.stringify([
      { context: " External CI ", integrationId: 1234, targets: ["production"] },
    ]))).toEqual({
      value: [{ context: "External CI", integrationId: 1234, targets: ["production"] }],
      errors: [],
    });
  });

  it("treats an omitted input as no attestations", () => {
    expect(parseMergeQueueCheckAttestations("")).toEqual({ value: [], errors: [] });
  });

  it("rejects invalid JSON", () => {
    expect(parseMergeQueueCheckAttestations("[").errors).toContain(
      "merge-queue-check-attestations must be a valid JSON array.",
    );
  });

  it("rejects serialized input above the byte limit before parsing", () => {
    const oversized = JSON.stringify([{ context: "x".repeat(17_000), integrationId: 1, targets: ["production"] }]);
    expect(parseMergeQueueCheckAttestations(oversized).errors[0]).toContain("at most 16384 bytes");
  });

  it("applies the byte limit to structured setup values too", () => {
    const oversized = [{ context: "x".repeat(17_000), integrationId: 1, targets: ["production"] }];
    expect(normalizeMergeQueueCheckAttestations(oversized).errors[0]).toContain("at most 16384 bytes");
  });

  it("rejects structured values that cannot be serialized", () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(normalizeMergeQueueCheckAttestations(cyclic).errors[0]).toContain("serializable JSON data");
  });

  it("rejects a non-array decoded value", () => {
    expect(normalizeMergeQueueCheckAttestations({}).errors).toContain("Merge queue check attestations must be an array.");
  });

  it("rejects non-object entries", () => {
    expect(normalizeMergeQueueCheckAttestations([null]).errors).toContain(
      "Merge queue check attestation 1 must be an object.",
    );
  });

  it("rejects empty, oversized, and control-character check names", () => {
    for (const context of ["", "x".repeat(256), "CI\nCheck"]) {
      expect(normalizeMergeQueueCheckAttestations([
        { context, integrationId: 1, targets: ["production"] },
      ]).errors[0]).toContain("context must be a non-empty check name");
    }
  });

  it("accepts an explicit any-source identity across every target role", () => {
    expect(normalizeMergeQueueCheckAttestations([
      { context: "Internal gate", integrationId: "any", targets: ["production", "development", "active-release"] },
    ])).toEqual({
      value: [{ context: "Internal gate", integrationId: "any", targets: ["production", "development", "active-release"] }],
      errors: [],
    });
  });

  it("rejects missing and duplicate target roles", () => {
    for (const targets of [undefined, [], ["production", "production"]]) {
      expect(normalizeMergeQueueCheckAttestations([
        { context: "Internal gate", integrationId: "any", targets },
      ]).errors[0]).toContain("targets must contain");
    }
  });

  it("rejects unknown fields instead of silently accepting them", () => {
    expect(normalizeMergeQueueCheckAttestations([
      { context: "External CI", integrationId: 1234, targets: ["production"], wildcard: true },
    ]).errors[0]).toContain("unknown field(s): wildcard");
  });

  it("rejects wildcard-like or invalid integration identities", () => {
    expect(normalizeMergeQueueCheckAttestations([
      { context: "External CI", integrationId: "*", targets: ["production"] },
    ]).errors[0]).toContain('positive integer or "any"');
  });

  it("rejects duplicate check identities", () => {
    const result = normalizeMergeQueueCheckAttestations([
      { context: "External CI", integrationId: 1234, targets: ["production"] },
      { context: "External CI", integrationId: 1234, targets: ["development"] },
    ]);
    expect(result.errors).toContain("Merge queue check attestation 2 duplicates check identity External CI.");
  });

  it("enforces the attestation count bound", () => {
    const values = Array.from({ length: MAX_MERGE_QUEUE_ATTESTATIONS + 1 }, (_, index) => ({
      context: `CI ${index}`,
      integrationId: index + 1,
      targets: ["production"],
    }));
    expect(normalizeMergeQueueCheckAttestations(values).errors[0]).toContain(`at most ${MAX_MERGE_QUEUE_ATTESTATIONS}`);
  });

  it("does not require readiness when the target does not require a queue", () => {
    expect(evaluateMergeQueueReadiness({
      queueRequired: false,
      targetRole: "production",
      targetBranch: "master",
      producers: [unknownCheck()],
      problems: [],
      attestations: [],
    }).verdict).toBe("not_required");
  });

  it("accepts automatically verified producers", () => {
    const result = evaluateMergeQueueReadiness({
      queueRequired: true,
      targetRole: "production",
      targetBranch: "master",
      producers: [unknownCheck({ support: "supported" })],
      problems: [],
      attestations: [],
    });
    expect(result).toEqual(expect.objectContaining({ verdict: "ready" }));
    expect(result.producers[0].verdict).toBe("verified");
  });

  it("allows an exact attestation for an unknown external producer", () => {
    const result = evaluateMergeQueueReadiness({
      queueRequired: true,
      targetRole: "production",
      targetBranch: "master",
      producers: [unknownCheck()],
      problems: [],
      attestations: [{ context: "External CI", integrationId: 1234, targets: ["production"] }],
    });
    expect(result.verdict).toBe("ready");
    expect(result.producers[0].verdict).toBe("attested");
  });

  it("does not broaden an attestation across integration or target identities", () => {
    const result = evaluateMergeQueueReadiness({
      queueRequired: true,
      targetRole: "development",
      targetBranch: "develop",
      producers: [unknownCheck()],
      problems: [],
      attestations: [{ context: "External CI", integrationId: 1234, targets: ["production"] }],
    });
    expect(result.verdict).toBe("unknown");
  });

  it("never lets an attestation override proven incompatibility", () => {
    const result = evaluateMergeQueueReadiness({
      queueRequired: true,
      targetRole: "production",
      targetBranch: "master",
      producers: [unknownCheck({ support: "unsupported" })],
      problems: [],
      attestations: [{ context: "External CI", integrationId: 1234, targets: ["production"] }],
    });
    expect(result.verdict).toBe("unsupported");
    expect(result.producers[0].verdict).toBe("unsupported");
  });

  it("fails closed when policy observation is incomplete", () => {
    expect(evaluateMergeQueueReadiness({
      queueRequired: true,
      targetRole: "production",
      targetBranch: "master",
      producers: [],
      problems: [{ area: "effective-rules", message: "Forbidden" }],
      attestations: [],
    }).verdict).toBe("unknown");
  });
});
