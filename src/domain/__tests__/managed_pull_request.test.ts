import {
  buildManagedPullRequestMarker,
  isSafeOperationId,
  parseManagedPullRequestMarker,
} from "../managed_pull_request";

describe("managed pull request identity", () => {
  it("round-trips a promotion marker", () => {
    const marker = buildManagedPullRequestMarker({ operationId: "operation-12345678", phase: "promotion", issue: 355 });
    expect(parseManagedPullRequestMarker(marker)).toEqual({ operationId: "operation-12345678", phase: "promotion", issue: 355 });
  });

  it("round-trips a reconciliation marker embedded in prose", () => {
    const marker = buildManagedPullRequestMarker({ operationId: "operation-12345678", phase: "reconciliation", issue: 355 });
    expect(parseManagedPullRequestMarker(`Visible body\n\n${marker}`)?.phase).toBe("reconciliation");
  });

  it("rejects a marker with an unknown phase", () => {
    expect(parseManagedPullRequestMarker('<!-- copilot-deployment operation-id="operation-12345678" phase="publish" issue="355" -->')).toBeUndefined();
  });

  it("rejects a zero issue", () => {
    expect(parseManagedPullRequestMarker('<!-- copilot-deployment operation-id="operation-12345678" phase="promotion" issue="0" -->')).toBeUndefined();
  });

  it("rejects an unsafe operation identifier on creation", () => {
    expect(() => buildManagedPullRequestMarker({ operationId: 'unsafe" --> @team', phase: "promotion", issue: 355 })).toThrow("invalid");
  });

  it("rejects an invalid issue on creation", () => {
    expect(() => buildManagedPullRequestMarker({ operationId: "operation-12345678", phase: "promotion", issue: -1 })).toThrow("invalid");
  });

  it.each(["operation-12345678", "abc_def.123", "12345678"])("accepts safe operation id %s", (value) => {
    expect(isSafeOperationId(value)).toBe(true);
  });

  it.each(["short", " leading-123", "bad/slash-123", "bad@mention-123"])("rejects unsafe operation id %s", (value) => {
    expect(isSafeOperationId(value)).toBe(false);
  });
});
