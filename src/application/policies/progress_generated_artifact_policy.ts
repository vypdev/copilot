/** Reports these generated paths as inventory metadata, without presenting their contents as source. */
export function isProgressGeneratedArtifact(path: string): boolean {
    return path.startsWith('build/') || path === 'specs/CATALOG.md'
        || /^quality\/bugbot\/evidence\/issue-\d+\/.+\.(?:jsonl|log\.gz)$/u.test(path);
}
