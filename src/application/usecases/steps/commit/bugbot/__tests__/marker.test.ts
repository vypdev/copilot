/**
 * Unit tests for bugbot marker: sanitize, build, parse, replace, extractTitle, buildCommentBody.
 */

import {
  sanitizeFindingIdForMarker,
  normalizeFindingIdForMarker,
  buildMarker,
  parseMarker,
  markerRegexForFinding,
  replaceMarkerInBody,
  extractTitleFromBody,
  buildCommentBody,
} from "../marker";
import type { BugbotFinding } from "../types";

jest.mock("../../../../../../utils/logger", () => ({
  logError: jest.fn(),
}));

describe("marker", () => {
  describe("sanitizeFindingIdForMarker", () => {
    it("preserves internal marker-breaking characters for lossless validation", () => {
      expect(sanitizeFindingIdForMarker("id-->x")).toBe("id-->x");
      expect(normalizeFindingIdForMarker("id-->x")).toBeNull();
      expect(normalizeFindingIdForMarker("id-ab")).toBe("id-ab");
      expect(normalizeFindingIdForMarker("id-a-->b")).toBeNull();
    });

    it("rejects newlines instead of deleting identity content", () => {
      expect(sanitizeFindingIdForMarker("a\nb\r\nc")).toBe("a\nb\r\nc");
      expect(normalizeFindingIdForMarker("a\nb\r\nc")).toBeNull();
    });

    it("trims whitespace", () => {
      expect(sanitizeFindingIdForMarker("  id-1  ")).toBe("id-1");
    });

    it("returns safe id unchanged", () => {
      expect(sanitizeFindingIdForMarker("src/foo.ts:10:issue")).toBe(
        "src/foo.ts:10:issue",
      );
    });
  });

  describe("buildMarker", () => {
    it("produces comment with prefix and resolved true", () => {
      const m = buildMarker("finding-1", true);
      expect(m).toContain("copilot-bugbot");
      expect(m).toContain('finding_id:"finding-1"');
      expect(m).toContain("resolved:true");
    });

  it("round-trips a locally computed fingerprint without breaking legacy markers", () => {
      const marker = buildMarker("finding-1", false, "fp-0123abcd");

      expect(marker).toContain('finding_fingerprint:"fp-0123abcd"');
      expect(parseMarker(marker)).toEqual([{
        findingId: "finding-1",
        resolved: false,
        fingerprint: "fp-0123abcd",
      }]);
    });

    it("rejects marker-breaking ids instead of changing identity", () => {
      expect(() => buildMarker("id-->x", false)).toThrow(
        "Finding ID contains marker-breaking characters.",
      );
    });
  });

  it("round-trips an explicit resolution reason", () => {
    const marker = buildMarker("finding-1", true, "fp-0123abcd", "dismissed");
    expect(parseMarker(marker)).toEqual([{
      findingId: "finding-1",
      resolved: true,
      fingerprint: "fp-0123abcd",
      resolution: "dismissed",
    }]);
  });

  describe("parseMarker", () => {
    it("returns empty array for null or empty body", () => {
      expect(parseMarker(null)).toEqual([]);
      expect(parseMarker("")).toEqual([]);
    });

    it("parses single marker", () => {
      const body = `Some text\n<!-- copilot-bugbot finding_id:"f1" resolved:false -->`;
      expect(parseMarker(body)).toEqual([{ findingId: "f1", resolved: false }]);
    });

    it("parses resolved true", () => {
      const body = `<!-- copilot-bugbot finding_id:"f2" resolved:true -->`;
      expect(parseMarker(body)).toEqual([{ findingId: "f2", resolved: true }]);
    });

    it("parses multiple markers", () => {
      const body = `<!-- copilot-bugbot finding_id:"a" resolved:false -->\n<!-- copilot-bugbot finding_id:"b" resolved:true -->`;
      expect(parseMarker(body)).toEqual([
        { findingId: "a", resolved: false },
        { findingId: "b", resolved: true },
      ]);
    });

    it("tolerates extra whitespace around prefix and key", () => {
      const body = `<!--   copilot-bugbot   finding_id: "f1"   resolved:false   -->`;
      expect(parseMarker(body)).toEqual([{ findingId: "f1", resolved: false }]);
    });
  });

  describe("markerRegexForFinding", () => {
    it("matches marker for given finding id", () => {
      const body = `x <!-- copilot-bugbot finding_id:"my-id" resolved:false --> y`;
      const regex = markerRegexForFinding("my-id");
      expect(regex.test(body)).toBe(true);
    });

    it("escapes regex-special chars in id", () => {
      const body = `<!-- copilot-bugbot finding_id:"file.ts:1" resolved:true -->`;
      const regex = markerRegexForFinding("file.ts:1");
      expect(regex.test(body)).toBe(true);
    });

    it("rejects finding ids that cannot be represented losslessly", () => {
      const longId = "a".repeat(300);

      expect(() => buildMarker(longId, false)).toThrow(
        "Finding ID exceeds the maximum marker length.",
      );
      expect(() => markerRegexForFinding(longId)).toThrow(
        "Finding ID exceeds the maximum marker length.",
      );
    });

    it("matches when id has only safe chars (no escape needed)", () => {
      const body = `<!-- copilot-bugbot finding_id:"src/foo.ts:10" resolved:false -->`;
      const regex = markerRegexForFinding("src/foo.ts:10");
      expect(regex.test(body)).toBe(true);
    });
  });

  describe("replaceMarkerInBody", () => {
    it("replaces marker with new resolved state", () => {
      const body = `## Title\n\n<!-- copilot-bugbot finding_id:"f1" resolved:false -->`;
      const { updated, found, changed } = replaceMarkerInBody(body, "f1", true);
      expect(found).toBe(true);
      expect(changed).toBe(true);
      expect(updated).toContain("resolved:true");
    });

    it("uses custom replacement when provided", () => {
      const body = `<!-- copilot-bugbot finding_id:"f1" resolved:false -->`;
      const { updated, found, changed } = replaceMarkerInBody(
        body,
        "f1",
        true,
        "CUSTOM",
      );
      expect(found).toBe(true);
      expect(changed).toBe(true);
      expect(updated).toBe("CUSTOM");
    });

    it("reports an already-resolved marker as found without logging external context", () => {
      const { logError } = require("../../../../../../utils/logger");
      logError.mockClear();
      const body = `<!-- copilot-bugbot finding_id:"external-id" resolved:true -->`;

      const { updated, found, changed } = replaceMarkerInBody(
        body,
        "external-id",
        true,
      );

      expect(found).toBe(true);
      expect(changed).toBe(false);
      expect(updated).toBe(body);
      expect(logError).not.toHaveBeenCalled();
    });

    it("returns found false when marker not found", () => {
      const { logError } = require("../../../../../../utils/logger");
      logError.mockClear();
      const body = "No marker here.";
      const { updated, found, changed } = replaceMarkerInBody(body, "f1", true);
      expect(found).toBe(false);
      expect(changed).toBe(false);
      expect(updated).toBe(body);
      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe("extractTitleFromBody", () => {
    it("returns empty for null or empty", () => {
      expect(extractTitleFromBody(null)).toBe("");
      expect(extractTitleFromBody("")).toBe("");
    });

    it("extracts first ## line", () => {
      const body = "## My Title\n\nDescription.";
      expect(extractTitleFromBody(body)).toBe("My Title");
    });

    it("trims title", () => {
      expect(extractTitleFromBody("##  Spaced Title  \n")).toBe("Spaced Title");
    });

    it("returns empty when no ## line", () => {
      expect(extractTitleFromBody("No heading")).toBe("");
    });
  });

  describe("buildCommentBody", () => {
    it("includes title, description, and marker", () => {
      const finding: BugbotFinding = {
        id: "f1",
        title: "Test Finding",
        description: "Description text",
      };
      const body = buildCommentBody(finding, false);
      expect(body).toContain("## Test Finding");
      expect(body).toContain("Description text");
      expect(body).toContain("copilot-bugbot");
      expect(body).toContain('finding_id:"f1"');
      expect(body).toContain("resolved:false");
    });

    it("includes severity when present", () => {
      const finding: BugbotFinding = {
        id: "f2",
        title: "T",
        description: "D",
        severity: "medium",
      };
      const body = buildCommentBody(finding, false);
      expect(body).toContain("**Severity:** medium");
    });

    it("includes location when file present", () => {
      const finding: BugbotFinding = {
        id: "f3",
        title: "T",
        description: "D",
        file: "src/foo.ts",
        line: 10,
      };
      const body = buildCommentBody(finding, false);
      expect(body).toContain("**Location:**");
      expect(body).toContain("src/foo.ts:10");
    });

    it("includes suggestion when present", () => {
      const finding: BugbotFinding = {
        id: "f4",
        title: "T",
        description: "D",
        suggestion: "Use X instead.",
      };
      const body = buildCommentBody(finding, false);
      expect(body).toContain("**Suggested fix:**");
      expect(body).toContain("Use X instead.");
    });

    it("adds Resolved note when resolved is true", () => {
      const finding: BugbotFinding = { id: "f5", title: "T", description: "D" };
      const body = buildCommentBody(finding, true);
      expect(body).toContain("**Resolved**");
      expect(body).toContain("resolved:true");
    });
  });
});
