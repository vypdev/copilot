import type { GitCommitPort } from '../../../../ports/git_ports';

/**
 * Extracts repository-relative paths from `git status --porcelain` output.
 * Renames are represented by their destination path because that is what will
 * be staged by the automated commit.
 */
export function parsePorcelainWorkspacePaths(status: string): string[] {
    const paths: string[] = [];
    for (const rawLine of status.split(/\r?\n/)) {
        if (rawLine.length < 4) continue;
        const pathPart = rawLine.slice(3).trim();
        if (!pathPart) continue;
        const renameSeparator = " -> ";
        const path = pathPart.includes(renameSeparator)
            ? pathPart.slice(pathPart.lastIndexOf(renameSeparator) + renameSeparator.length).trim()
            : pathPart;
        if (path && !paths.includes(path)) paths.push(path);
    }
    return paths;
}

/** Returns true for files that must never be included in an automated commit. */
export function isSensitiveWorkspacePath(path: string): boolean {
    const normalized = path.replace(/\\\\/g, "/").trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.startsWith(".github/workflows/")) return true;

    const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
    if (basename === ".env" || basename.startsWith(".env.")) return true;
    if (basename.startsWith("id_rsa") || basename.startsWith("id_ed25519")) return true;
    if ([".pem", ".key", ".p12", ".pfx", ".jks"].some((suffix) => basename.endsWith(suffix))) {
        return true;
    }
    return /(credential|secret|token)/.test(basename);
}

/**
 * Selects paths introduced by the AI operation and removes sensitive paths.
 * The order from the post-operation status is preserved for deterministic git calls.
 */
export function selectWorkspacePathsToCommit(before: string[], after: string[]): string[] {
    const beforeSet = new Set(before);
    return after.filter((path, index) => {
        if (beforeSet.has(path) || after.indexOf(path) !== index) return false;
        return !isSensitiveWorkspacePath(path);
    });
}

/** Reads the current working tree paths without executing a shell. */
export async function listWorkspacePaths(gitCommitPort: GitCommitPort): Promise<string[]> {
    let output = "";
    await gitCommitPort.execute("git", ["status", "--porcelain"], {
        stdout: (data: Buffer) => {
            output += data.toString();
        },
    });
    return parsePorcelainWorkspacePaths(output);
}

export async function hasWorkspaceChanges(gitCommitPort: GitCommitPort): Promise<boolean> {
    return (await listWorkspacePaths(gitCommitPort)).length > 0;
}
