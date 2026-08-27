import {
    isSensitiveWorkspacePath,
    parsePorcelainWorkspacePaths,
    selectWorkspacePathsToCommit,
} from "../workspace_changes";

describe("workspace change policy", () => {
    it("parses tracked, untracked, deleted and renamed porcelain paths", () => {
        const status = [
            " M src/fixed.ts",
            "?? src/new.ts",
            " D src/removed.ts",
            "R  src/old.ts -> src/new-name.ts",
        ].join("\n");

        expect(parsePorcelainWorkspacePaths(status)).toEqual([
            "src/fixed.ts",
            "src/new.ts",
            "src/removed.ts",
            "src/new-name.ts",
        ]);
    });

    it("rejects sensitive files from an automated commit", () => {
        expect(isSensitiveWorkspacePath(".env")).toBe(true);
        expect(isSensitiveWorkspacePath("config/service.pem")).toBe(true);
        expect(isSensitiveWorkspacePath(".github/workflows/deploy.yml")).toBe(true);
        expect(isSensitiveWorkspacePath("src/fix.ts")).toBe(false);
    });

    it("returns only newly changed, non-sensitive paths", () => {
        expect(
            selectWorkspacePathsToCommit(
                ["src/preexisting.ts"],
                ["src/preexisting.ts", "src/fixed.ts", ".env"]
            )
        ).toEqual(["src/fixed.ts"]);
    });
});
