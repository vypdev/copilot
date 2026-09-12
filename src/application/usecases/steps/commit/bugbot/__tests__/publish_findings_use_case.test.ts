/**
 * Unit tests for publishFindings: issue comments (add/update), PR review comments (when file in prFiles), overflow.
 */

import { publishFindings as publishFindingsImpl, type PublishFindingsParam } from "../publish_findings_use_case";
import type { BugbotFinding } from '../../../../../../domain/bugbot/finding';
import type { BugbotContext } from "../types";
import { Ai } from "../../../../../../data/model/ai";

jest.mock("../../../../../../utils/logger", () => ({
    logDebugInfo: jest.fn(),
    logInfo: jest.fn(),
}));

const mockAddComment = jest.fn();
const mockUpdateComment = jest.fn();
const mockCreateReviewWithComments = jest.fn();
const mockUpdatePullRequestReviewComment = jest.fn();
const mockUnresolvePullRequestReviewThread = jest.fn();
const mockUpdatePullRequestReview = jest.fn();



function publishFindings(param: Omit<PublishFindingsParam, "ports">) {
    return publishFindingsImpl({
        ...param,
        ports: {
            issueComments: { addComment: mockAddComment, updateComment: mockUpdateComment },
            pullRequestComments: {
                createReviewWithComments: mockCreateReviewWithComments,
                updatePullRequestReviewComment: mockUpdatePullRequestReviewComment,
                unresolvePullRequestReviewThread: mockUnresolvePullRequestReviewThread,
            },
            reviewState: { updatePullRequestReview: mockUpdatePullRequestReview },
        },
    });
}

function finding(overrides: Partial<BugbotFinding> = {}): BugbotFinding {
    return {
        id: "f1",
        title: "Test",
        description: "Desc",
        fingerprint: 'fp-11111111',
        semanticFingerprint: 'sf-11111111',
        ...overrides,
    };
}

function baseContext(overrides: Partial<BugbotContext> = {}): BugbotContext {
    return {
        existingByFindingId: {},
        issueComments: [],
        canonicalPullRequest: {
            number: 50,
            state: 'open',
            baseRepository: { owner: 'o', name: 'r' },
            headRepositoryOwner: 'o',
            headRef: 'feature/42',
            headSha: 'a'.repeat(40),
        },
        selectionReason: 'exact-head',
        coverage: { status: 'complete', sources: [] },
        eligibleResolutionIds: new Set(),
        previousFindingsBlock: "",
        prContext: null,
        unresolvedFindingsWithBody: [],
        ...overrides,
    };
}

const baseExecution = {
    owner: "o",
    repo: "r",
    issueNumber: 42,
    tokens: { token: "t" },
    ai: new Ai("", "model", false, [], false, "low", 20),
} as Parameters<typeof publishFindings>[0]["execution"];

describe("publishFindings", () => {
    beforeEach(() => {
        mockAddComment.mockReset().mockResolvedValue(undefined);
        mockUpdateComment.mockReset().mockResolvedValue(undefined);
        mockCreateReviewWithComments.mockReset().mockResolvedValue(undefined);
        mockUpdatePullRequestReviewComment.mockReset().mockResolvedValue(undefined);
        mockUnresolvePullRequestReviewThread.mockReset().mockResolvedValue(undefined);
        mockUpdatePullRequestReview.mockReset().mockResolvedValue(undefined);
    });

    it("adds issue comment for new finding", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext(),
            findings: [finding()],
        });

        expect(mockAddComment).toHaveBeenCalledTimes(1);
        expect(mockAddComment).toHaveBeenCalledWith("o", "r", 42, expect.stringContaining("## Test"), "t", undefined);
        expect(mockUpdateComment).not.toHaveBeenCalled();
    });

    it("publishes a PR-only finding without calling the issue API", async () => {
        await publishFindings({
            execution: { ...baseExecution, issueNumber: -1 } as typeof baseExecution,
            context: baseContext({
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/foo.ts", status: "modified" }],
                    pathToFirstDiffLine: { "src/foo.ts": 5 },
                },
            }),
            findings: [finding({ file: "src/foo.ts" })],
        });

        expect(mockAddComment).not.toHaveBeenCalled();
        expect(mockCreateReviewWithComments).toHaveBeenCalledTimes(1);
    });

    it("updates issue comment when finding already has issueCommentId", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                existingByFindingId: {
                    f1: {
                        issue: {
                            commentId: 100,
                            resolved: false,
                            fingerprint: "fp-11111111",
                            semanticFingerprint: "sf-11111111",
                        },
                    },
                },
            }),
            findings: [finding()],
        });

        expect(mockUpdateComment).toHaveBeenCalledWith("o", "r", 42, 100, expect.any(String), "t", undefined);
        expect(mockAddComment).not.toHaveBeenCalled();
    });

    it("creates PR review comment when finding.file is in prFiles", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/foo.ts", status: "modified" }],
                    pathToFirstDiffLine: { "src/foo.ts": 5 },
                },
            }),
            findings: [finding({ file: "src/foo.ts", line: 10 })],
        });

        expect(mockAddComment).not.toHaveBeenCalled();
        expect(mockCreateReviewWithComments).toHaveBeenCalledTimes(1);
        expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
            "o",
            "r",
            50,
            "sha1",
            expect.stringContaining("## 🤖 Bugbot review"),
            expect.arrayContaining([
                expect.objectContaining({ path: "src/foo.ts", line: 5, body: expect.any(String) }),
            ]),
            "t"
        );
        expect(mockCreateReviewWithComments.mock.calls[0][4]).toContain('Bugbot review snapshot');
        expect(mockCreateReviewWithComments.mock.calls[0][4]).not.toContain('active potential problem');
    });

    it('traces included, truncated, and omitted rule sources in the review summary without rule contents', async () => {
        const execution = {
            ...baseExecution,
            ai: { getBugbotReviewConfiguration: () => ({ traceRules: true }) },
        } as typeof baseExecution;
        await publishFindings({
            execution,
            context: baseContext({
                reviewRuleSources: [
                    'organization:1',
                    'path:src/.copilot/BUGBOT.md (truncated)',
                ],
                omittedReviewRules: 2,
                prContext: {
                    prHeadSha: 'sha1',
                    prFiles: [{ filename: 'src/foo.ts', status: 'modified' }],
                    pathToFirstDiffLine: { 'src/foo.ts': 5 },
                },
            }),
            findings: [finding({ file: 'src/foo.ts' })],
        });

        const summary = mockCreateReviewWithComments.mock.calls[0][4] as string;
        expect(summary).toContain('### Review configuration');
        expect(summary).toContain('| `organization:1` | included |');
        expect(summary).toContain('| `path:src/.copilot/BUGBOT.md` | truncated |');
        expect(summary).toContain('2 omitted by duplicate, empty, or combined-budget policy');
        expect(summary).not.toContain('team rule content');
    });

    it('renders a suggested change only on an exact RIGHT-side line anchor', async () => {
        const execution = {
            ...baseExecution,
            ai: { getBugbotReviewConfiguration: () => ({ suggestedChanges: true }) },
        } as typeof baseExecution;
        await publishFindings({
            execution,
            context: baseContext({
                prContext: {
                    prHeadSha: 'sha1',
                    prFiles: [{ filename: 'src/foo.ts', status: 'modified' }],
                    pathToFirstDiffLine: { 'src/foo.ts': 10 },
                    pathToDiffLocations: { 'src/foo.ts': [{ line: 10, side: 'RIGHT' }] },
                },
            }),
            findings: [finding({ file: 'src/foo.ts', line: 10, suggestedCode: 'return safeValue;' })],
        });

        expect(mockCreateReviewWithComments.mock.calls[0][5][0].body).toContain('```suggestion\nreturn safeValue;');
    });

    it('does not render a suggested change on a LEFT-side line anchor', async () => {
        const execution = {
            ...baseExecution,
            ai: { getBugbotReviewConfiguration: () => ({ suggestedChanges: true }) },
        } as typeof baseExecution;
        await publishFindings({
            execution,
            context: baseContext({
                prContext: {
                    prHeadSha: 'sha1',
                    prFiles: [{ filename: 'src/foo.ts', status: 'modified' }],
                    pathToFirstDiffLine: {},
                    pathToDiffLocations: { 'src/foo.ts': [{ line: 10, side: 'LEFT' }] },
                },
            }),
            findings: [finding({ file: 'src/foo.ts', line: 10, suggestedCode: 'return unsafe;' })],
        });

        expect(mockCreateReviewWithComments.mock.calls[0][5][0].body).not.toContain('```suggestion');
    });

    it("publishes an exact multi-line diff range when both endpoints are addressable", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/foo.ts", status: "modified" }],
                    pathToFirstDiffLine: { "src/foo.ts": 10 },
                    pathToDiffLocations: {
                        "src/foo.ts": [10, 11, 12].map((line) => ({ line, side: "RIGHT" as const })),
                    },
                },
            }),
            findings: [finding({ file: "src/foo.ts", line: 10, endLine: 12 })],
        });

        expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
            "o",
            "r",
            50,
            "sha1",
            expect.any(String),
            [expect.objectContaining({
                path: "src/foo.ts",
                line: 12,
                side: "RIGHT",
                startLine: 10,
                startSide: "RIGHT",
            })],
            "t",
        );
    });

    it("keeps a finding inside the review when its reported file is not in the PR", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/bar.ts", status: "modified" }],
                    pathToFirstDiffLine: { "src/bar.ts": 3 },
                },
            }),
            findings: [finding({ file: "src/foo.ts" })],
        });

        expect(mockAddComment).not.toHaveBeenCalled();
        expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
            "o",
            "r",
            50,
            "sha1",
            expect.stringContaining("src/foo.ts"),
            [expect.objectContaining({
                path: "src/bar.ts",
                line: 3,
                body: expect.stringContaining("Review-level finding"),
            })],
            "t",
        );
    });

    it("uses pathToFirstDiffLine when finding has no line", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/a.ts", status: "modified" }],
                    pathToFirstDiffLine: { "src/a.ts": 20 },
                },
            }),
            findings: [finding({ id: "f2", file: "src/a.ts" })],
        });

        expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
            "o",
            "r",
            50,
            "sha1",
            expect.stringContaining("## 🤖 Bugbot review"),
            expect.arrayContaining([
                expect.objectContaining({ path: "src/a.ts", line: 20 }),
            ]),
            "t"
        );
    });

    it("updates existing PR review comment when finding has prCommentId for same PR", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                existingByFindingId: {
                    f1: {
                        pullRequest: {
                            commentIdentity: "PRRC_300",
                            pullRequestNumber: 50,
                            resolved: false,
                            fingerprint: "fp-11111111",
                            semanticFingerprint: "sf-11111111",
                        },
                    },
                },
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/foo.ts", status: "modified" }],
                    pathToFirstDiffLine: {},
                },
            }),
            findings: [finding({ file: "src/foo.ts" })],
        });

        expect(mockUpdatePullRequestReviewComment).toHaveBeenCalledWith(
            "o",
            "r",
            "PRRC_300",
            expect.any(String),
            "t"
        );
        expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
    });

    it("persists the open marker before reopening a finding that is active again", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                existingByFindingId: {
                    f1: {
                        pullRequest: {
                            commentIdentity: "PRRC_resolved",
                            pullRequestNumber: 50,
                            resolved: true,
                            fingerprint: "fp-11111111",
                            semanticFingerprint: "sf-11111111",
                        },
                    },
                },
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/foo.ts", status: "modified" }],
                    pathToFirstDiffLine: {},
                },
            }),
            findings: [finding({ file: "src/foo.ts" })],
        });

        expect(mockUnresolvePullRequestReviewThread).toHaveBeenCalledWith(
            "o", "r", 50, "PRRC_resolved", "t",
        );
        expect(mockUpdatePullRequestReviewComment).toHaveBeenCalledTimes(1);
        expect(mockUpdatePullRequestReviewComment.mock.invocationCallOrder[0]).toBeLessThan(
            mockUnresolvePullRequestReviewThread.mock.invocationCallOrder[0],
        );
    });

    it('does not let model output silently reopen a human dismissal', async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                existingByFindingId: {
                    f1: {
                        pullRequest: {
                            commentIdentity: 'PRRC_dismissed',
                            pullRequestNumber: 50,
                            resolved: true,
                            threadResolved: true,
                            resolution: 'dismissed',
                            fingerprint: 'fp-11111111',
                            semanticFingerprint: 'sf-11111111',
                        },
                    },
                },
                prContext: {
                    prHeadSha: 'sha1',
                    prFiles: [{ filename: 'src/foo.ts', status: 'modified' }],
                    pathToFirstDiffLine: { 'src/foo.ts': 5 },
                },
            }),
            findings: [finding({ file: 'src/foo.ts', line: 5 })],
        });

        expect(mockUpdatePullRequestReviewComment).not.toHaveBeenCalled();
        expect(mockUnresolvePullRequestReviewThread).not.toHaveBeenCalled();
        expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
    });

    it("adds overflow comment when overflowCount > 0", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext(),
            findings: [finding()],
            overflowCount: 3,
            overflowTitles: ["Extra 1", "Extra 2", "Extra 3"],
        });

        expect(mockAddComment).toHaveBeenCalledTimes(2);
        const overflowCall = mockAddComment.mock.calls.find(
            (c: unknown[]) => (c[3] as string).includes("More findings")
        );
        expect(overflowCall).toBeDefined();
        expect(overflowCall[3]).toContain("3");
        expect(overflowCall[3]).toContain("Extra 1");
    });

    it("adds overflow comment with 'and N more' when overflowTitles length > 15", async () => {
        const manyTitles = Array.from({ length: 20 }, (_, i) => `Finding ${i}`);
        await publishFindings({
            execution: baseExecution,
            context: baseContext(),
            findings: [],
            overflowCount: 20,
            overflowTitles: manyTitles,
        });

        const overflowCall = mockAddComment.mock.calls.find(
            (c: unknown[]) => (c[3] as string).includes("More findings")
        );
        expect(overflowCall).toBeDefined();
        expect(overflowCall[3]).toContain("5 more");
        expect(overflowCall[3]).toContain("Finding 0");
        expect(overflowCall[3]).not.toContain("Finding 19");
    });

    it("uses commitSha for watermark and passes commitSha to addComment when provided", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext(),
            findings: [finding()],
            commitSha: "abc123",
        });

        expect(mockAddComment).toHaveBeenCalledWith(
            "o",
            "r",
            42,
            expect.any(String),
            "t",
            { commitSha: "abc123" }
        );
    });

    it("passes commitSha to updateComment when finding has issueCommentId and commitSha is provided", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                existingByFindingId: {
                    f1: {
                        issue: {
                            commentId: 100,
                            resolved: false,
                            fingerprint: "fp-11111111",
                            semanticFingerprint: "sf-11111111",
                        },
                    },
                },
            }),
            findings: [finding()],
            commitSha: "def456",
        });

        expect(mockUpdateComment).toHaveBeenCalledWith(
            "o",
            "r",
            42,
            100,
            expect.any(String),
            "t",
            { commitSha: "def456" }
        );
    });

    it("keeps a finding in the review summary when the PR has no commentable diff line", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/b.ts", status: "modified" }],
                    pathToFirstDiffLine: {},
                },
            }),
            findings: [finding({ id: "f2", file: "src/b.ts" })],
        });

        expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
            "o",
            "r",
            50,
            "sha1",
            expect.stringContaining("### Review-level findings"),
            [],
            "t"
        );
    });

    it("creates new PR review comment when existing prCommentId is for a different PR", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                existingByFindingId: {
                    f1: {
                        pullRequest: {
                            commentIdentity: "PRRC_300",
                            pullRequestNumber: 99,
                            resolved: false,
                            fingerprint: "fp-11111111",
                            semanticFingerprint: "sf-11111111",
                        },
                    },
                },
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/foo.ts", status: "modified" }],
                    pathToFirstDiffLine: { "src/foo.ts": 1 },
                },
            }),
            findings: [finding({ file: "src/foo.ts" })],
        });

        expect(mockUpdatePullRequestReviewComment).not.toHaveBeenCalled();
        expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
            "o",
            "r",
            50,
            "sha1",
            expect.stringContaining("## 🤖 Bugbot review"),
            expect.arrayContaining([
                expect.objectContaining({ path: "src/foo.ts", body: expect.any(String) }),
            ]),
            "t"
        );
    });

    it("adds overflow comment with no titles list when overflowTitles is empty", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext(),
            findings: [],
            overflowCount: 2,
            overflowTitles: [],
        });

        const overflowCall = mockAddComment.mock.calls.find(
            (c: unknown[]) => (c[3] as string).includes("More findings")
        );
        expect(overflowCall).toBeDefined();
        expect(overflowCall[3]).toContain("**2**");
        expect(overflowCall[3]).not.toMatch(/\n- /);
    });

    it("passes commitSha to addComment when adding overflow comment", async () => {
        await publishFindings({
            execution: baseExecution,
            context: baseContext(),
            findings: [],
            overflowCount: 1,
            overflowTitles: [],
            commitSha: "overflow-sha",
        });

        const overflowCall = mockAddComment.mock.calls.find(
            (c: unknown[]) => (c[3] as string).includes("More findings")
        );
        expect(overflowCall).toBeDefined();
        expect(overflowCall[5]).toEqual({ commitSha: "overflow-sha" });
    });

    it("publishes findings without a reported file in the same summarized review", async () => {
        const { logInfo } = await import("../../../../../../utils/logger");
        (logInfo as jest.Mock).mockClear();
        await publishFindings({
            execution: baseExecution,
            context: baseContext({
                prContext: {
                    prHeadSha: "sha1",
                    prFiles: [{ filename: "src/only.ts", status: "modified" }],
                    pathToFirstDiffLine: { "src/only.ts": 4 },
                },
            }),
            findings: [
                finding({ id: "no-file", file: undefined }),
                finding({ id: "empty-file", file: "" }),
                finding({ id: "whitespace-file", file: "   " }),
            ],
        });

        expect(mockAddComment).not.toHaveBeenCalled();
        expect(mockCreateReviewWithComments).toHaveBeenCalledTimes(1);
        expect(mockCreateReviewWithComments.mock.calls[0][5]).toHaveLength(3);
        expect(mockCreateReviewWithComments.mock.calls[0][5]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: "src/only.ts", line: 4 }),
            ]),
        );
    });
});
