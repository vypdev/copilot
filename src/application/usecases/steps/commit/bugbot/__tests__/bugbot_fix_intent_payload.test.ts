/**
 * Unit tests for bugbot_fix_intent_payload: getBugbotFixIntentPayload, canRunBugbotAutofix, canRunDoUserRequest.
 */

import {
    getBugbotFixIntentPayload,
    canRunBugbotAutofix,
    canRunDoUserRequest,
    type BugbotFixIntentPayload,
} from "../bugbot_fix_intent_payload";
import { Result } from "../../../../../../data/model/result";

describe("bugbot_fix_intent_payload", () => {
    describe("getBugbotFixIntentPayload", () => {
        it("returns undefined when results is empty", () => {
            expect(getBugbotFixIntentPayload([])).toBeUndefined();
        });

        it("returns undefined when last result has no payload", () => {
            const results = [
                new Result({
                    id: "DetectBugbotFixIntentUseCase",
                    success: true,
                    executed: true,
                    steps: [],
                    payload: undefined,
                }),
            ];
            expect(getBugbotFixIntentPayload(results)).toBeUndefined();
        });

        it("returns undefined when last result payload is not an object", () => {
            const results = [
                new Result({
                    id: "DetectBugbotFixIntentUseCase",
                    success: true,
                    executed: true,
                    steps: [],
                    payload: "not an object",
                }),
            ];
            expect(getBugbotFixIntentPayload(results)).toBeUndefined();
        });

        it("returns payload from last result when valid", () => {
            const payload: BugbotFixIntentPayload = {
                isFixRequest: true,
                isDoRequest: false,
                targetFindingIds: ["f1"],
                branchOverride: "feature/42-foo",
            };
            const results = [
                new Result({
                    id: "DetectBugbotFixIntentUseCase",
                    success: true,
                    executed: true,
                    steps: [],
                    payload,
                }),
            ];
            expect(getBugbotFixIntentPayload(results)).toEqual(payload);
        });
    });

    describe("canRunBugbotAutofix", () => {
        it("returns false when payload is undefined", () => {
            expect(canRunBugbotAutofix(undefined)).toBe(false);
        });

        it("returns false when isFixRequest is false", () => {
            expect(
                canRunBugbotAutofix({
                    isFixRequest: false,
                    isDoRequest: false,
                    targetFindingIds: ["f1"],
                    context: { existingByFindingId: {}, issueComments: [], openPrNumbers: [], previousFindingsBlock: "", prContext: null, unresolvedFindingsWithBody: [] },
                })
            ).toBe(false);
        });

        it("returns true when fix request with targets and context", () => {
            const payload: BugbotFixIntentPayload & { context: NonNullable<BugbotFixIntentPayload["context"]> } = {
                isFixRequest: true,
                isDoRequest: false,
                targetFindingIds: ["f1"],
                context: { existingByFindingId: {}, issueComments: [], openPrNumbers: [], previousFindingsBlock: "", prContext: null, unresolvedFindingsWithBody: [] },
            };
            expect(canRunBugbotAutofix(payload)).toBe(true);
        });
    });

    describe("canRunDoUserRequest", () => {
        it("returns false when payload is undefined", () => {
            expect(canRunDoUserRequest(undefined)).toBe(false);
        });

        it("returns true when isDoRequest is true", () => {
            expect(
                canRunDoUserRequest({
                    isFixRequest: false,
                    isDoRequest: true,
                    targetFindingIds: [],
                })
            ).toBe(true);
        });
    });
});
