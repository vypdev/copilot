import {
    buildUnresolvedFindingSummaries,
    parseBugbotFixIntentResponse,
    selectBugbotCommentBody,
} from "../detect_bugbot_fix_intent_policy";

describe("detect bugbot fix intent policy", () => {
    describe("selectBugbotCommentBody", () => {
        it("selects an issue comment before the pull request source", () => {
            expect(
                selectBugbotCommentBody({
                    issue: { isIssueComment: true, commentBody: "issue comment" },
                    pullRequest: {
                        isPullRequestReviewComment: true,
                        commentBody: "review comment",
                    },
                }),
            ).toBe("issue comment");
        });

        it("selects a pull request review comment when no issue comment exists", () => {
            expect(
                selectBugbotCommentBody({
                    issue: { isIssueComment: false },
                    pullRequest: {
                        isPullRequestReviewComment: true,
                        commentBody: "review comment",
                    },
                }),
            ).toBe("review comment");
        });

        it("returns an empty body for unrelated events", () => {
            expect(
                selectBugbotCommentBody({
                    issue: { isIssueComment: false, commentBody: "ignored" },
                    pullRequest: {
                        isPullRequestReviewComment: false,
                        commentBody: "ignored",
                    },
                }),
            ).toBe("");
        });
    });

    describe("buildUnresolvedFindingSummaries", () => {
        it("extracts a title and bounds the description", () => {
            const summaries = buildUnresolvedFindingSummaries([
                { id: "finding-1", fullBody: "## Unsafe query\n\nDetails" },
                { id: "finding-2" },
            ]);

            expect(summaries).toEqual([
                {
                    id: "finding-1",
                    title: "Unsafe query",
                    description: "## Unsafe query\n\nDetails",
                },
                { id: "finding-2", title: "finding-2", description: "" },
            ]);
        });
    });

    describe("parseBugbotFixIntentResponse", () => {
        const unresolvedIds = new Set(["finding-1", "finding-2"]);

        it("keeps only unique unresolved ids for a fix request", () => {
            expect(
                parseBugbotFixIntentResponse(
                    {
                        is_fix_request: true,
                        is_do_request: false,
                        target_finding_ids: ["finding-1", "finding-1", "unknown", 42],
                    },
                    unresolvedIds,
                ),
            ).toEqual({
                isFixRequest: true,
                isDoRequest: false,
                isReviewRequest: false,
                targetFindingIds: ["finding-1"],
            });
        });

        it("does not allow ids when the agent did not identify a fix request", () => {
            expect(
                parseBugbotFixIntentResponse(
                    {
                        is_fix_request: false,
                        is_do_request: true,
                        target_finding_ids: ["finding-1"],
                    },
                    unresolvedIds,
                ),
            ).toEqual({
                isFixRequest: false,
                isDoRequest: true,
                isReviewRequest: false,
                targetFindingIds: [],
            });
        });

        it.each([null, undefined, "not-json", [], 42])(
            "returns undefined for a non-object response: %p",
            (response) => {
                expect(parseBugbotFixIntentResponse(response, unresolvedIds)).toBeUndefined();
            },
        );

        it("defaults malformed fields to safe values", () => {
            expect(
                parseBugbotFixIntentResponse(
                    { is_fix_request: "true", is_do_request: 1, is_review_request: false, target_finding_ids: "finding-1" },
                    unresolvedIds,
                ),
            ).toEqual({
                isFixRequest: false,
                isDoRequest: false,
                isReviewRequest: false,
                targetFindingIds: [],
            });
        });
    });
});
