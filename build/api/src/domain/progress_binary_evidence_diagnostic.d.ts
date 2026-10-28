export interface ProgressBinaryEvidenceFacts {
    readonly paths: string;
    readonly pathCount: number;
}
/** Canonical, bounded exact paths. The total discloses additional unreviewed paths in the pinned inventory. */
export declare function progressBinaryEvidenceFacts(paths: readonly string[]): ProgressBinaryEvidenceFacts;
export declare function isProgressBinaryEvidenceFacts(value: Readonly<Record<string, unknown>>): boolean;
/** JSON renders control characters literally; a noncolliding code span keeps paths inert in Markdown and plain CLI text. */
export declare function progressBinaryEvidencePresentation(facts: ProgressBinaryEvidenceFacts): Readonly<Record<string, string | number>>;
