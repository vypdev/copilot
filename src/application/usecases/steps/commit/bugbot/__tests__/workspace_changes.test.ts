import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeWorkspaceMutation } from '../../workspace_mutation_guard';
import {
    isSensitiveWorkspacePath,
    parsePorcelainWorkspacePaths,
    selectWorkspacePathsToCommit,
    listWorkspacePaths,
} from "../workspace_changes";

describe("workspace change policy", () => {
    function repository() {
        const root = mkdtempSync(join(tmpdir(), 'copilot-untracked-paths-'));
        execFileSync('git', ['init', root], { stdio: 'ignore' });
        const port: Parameters<typeof listWorkspacePaths>[0] = { execute: async (program, args, options) => {
            options?.stdout?.(Buffer.from(execFileSync(program, args, { cwd: root, encoding: 'utf8' })));
            return 0;
        } };
        return { root, port };
    }

    it('expands new directories to inspect runtime data and reject nested sensitive files', async () => {
        const { root, port } = repository();
        try {
            mkdirSync(join(root, 'Microsoft', 'Windows', 'PowerShell'), { recursive: true });
            mkdirSync(join(root, 'config'));
            writeFileSync(join(root, 'Microsoft', 'Windows', 'PowerShell', 'ModuleAnalysisCache'), 'fixture');
            writeFileSync(join(root, 'config', 'service.pem'), 'fixture');
            expect(await listWorkspacePaths(port)).toEqual(['Microsoft/Windows/PowerShell/ModuleAnalysisCache', 'config/service.pem']);
            await expect(finalizeWorkspaceMutation(port, [], 'Fixture')).rejects.toMatchObject({ code: 'agent.policy-rejected' });
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('enforces the automated file limit when more than 100 files are inside one new directory', async () => {
        const { root, port } = repository();
        try {
            mkdirSync(join(root, 'generated'));
            for (let index = 0; index < 101; index++) writeFileSync(join(root, 'generated', `file-${index}.ts`), 'export {};');
            expect(await listWorkspacePaths(port)).toHaveLength(101);
            await expect(finalizeWorkspaceMutation(port, [], 'Fixture')).rejects.toThrow('101 paths; maximum is 100');
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

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
