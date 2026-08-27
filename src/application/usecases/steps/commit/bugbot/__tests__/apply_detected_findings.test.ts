import type { Execution } from "../../../../../../data/model/execution";
import type { BugbotFindingPublicationPorts } from "../../../../../ports/bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../../../../../ports/bugbot_finding_resolution_ports";
import { applyDetectedFindings } from "../apply_detected_findings";
import type { PreparedBugbotFindings } from "../prepare_bugbot_findings";
import type { BugbotContext } from "../types";
import { markFindingsResolved } from "../mark_findings_resolved_use_case";
import { publishFindings } from "../publish_findings_use_case";

jest.mock("../mark_findings_resolved_use_case", () => ({
  markFindingsResolved: jest.fn(),
}));

jest.mock("../publish_findings_use_case", () => ({
  publishFindings: jest.fn(),
}));

const mockMarkFindingsResolved = jest.mocked(markFindingsResolved);
const mockPublishFindings = jest.mocked(publishFindings);

function preparedFindings(): PreparedBugbotFindings {
  return {
    toPublish: [],
    resolvedFindingIds: new Set(["f1"]),
    overflowCount: 0,
    overflowTitles: [],
  };
}

describe("applyDetectedFindings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not resolve findings when publication fails", async () => {
    mockPublishFindings.mockRejectedValue(
      new Error("provider rejected secret-token"),
    );

    const errors = await applyDetectedFindings(
      {} as Execution,
      {} as BugbotContext,
      preparedFindings(),
      {} as BugbotFindingPublicationPorts,
      {} as BugbotFindingResolutionPorts,
    );

    expect(errors).toEqual([
      new Error("Unable to publish findings."),
    ]);
    expect(JSON.stringify(errors)).not.toContain("secret-token");
    expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
  });

  it("resolves only after publication succeeds", async () => {
    mockPublishFindings.mockResolvedValue(undefined);
    mockMarkFindingsResolved.mockResolvedValue([]);

    await applyDetectedFindings(
      {} as Execution,
      {} as BugbotContext,
      preparedFindings(),
      {} as BugbotFindingPublicationPorts,
      {} as BugbotFindingResolutionPorts,
    );

    expect(mockPublishFindings.mock.invocationCallOrder[0]).toBeLessThan(
      mockMarkFindingsResolved.mock.invocationCallOrder[0],
    );
  });
});
