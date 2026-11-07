export type ProgressCapacityPhase = 'input' | 'source' | 'scope' | 'partition' | 'aggregate' | 'assessment';
export type ProgressCapacityUnit = 'bytes' | 'parts' | 'lines' | 'code-points' | 'units';
export type ProgressCapacityBound = 'minimum' | 'maximum' | 'unavailable';
export type ProgressCapacityCount = number | 'unavailable';
export declare const PROGRESS_CAPACITY_DIMENSIONS: Readonly<{
    'source-unit-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'source-part-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'source-part-count': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'source-unit-count': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'source-manifest-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'source-line-count': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'source-line-points': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'input-text-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'native-prompt-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'native-prompt-reserve-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'aggregate-reserve-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'aggregate-allocation-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'aggregate-envelope-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'minimum-fact-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'evidence-unit-count': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'aggregate-fact-bytes': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'assessment-summary-points': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'assessment-remaining-points': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
    'invalid-allocation': Readonly<{
        phases: readonly ProgressCapacityPhase[];
        unit: ProgressCapacityUnit;
        bounds: readonly ProgressCapacityBound[];
    }>;
}>;
export type ProgressCapacityDimension = keyof typeof PROGRESS_CAPACITY_DIMENSIONS;
export type ProgressCapacityContext = Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'source-line';
    sourceLineId: string;
}> | Readonly<{
    kind: 'assessment';
    requirementCount: number;
    batch: number;
    requirementId: string;
}> | Readonly<{
    kind: 'comparison';
    baseSha: string;
    headSha: string;
    manifestDigest: string;
    sourceLineId: string;
    requiredPathsDigest: string;
    reviewedPathsDigest: string;
    uncoveredPathsDigest: string;
    requiredPathCount: number;
    reviewedPathCount: number;
    uncoveredPathCount: number;
    paths: readonly string[];
}>;
export interface ProgressCapacityDiagnostic {
    readonly phase: ProgressCapacityPhase;
    readonly dimension: ProgressCapacityDimension;
    readonly unit: ProgressCapacityUnit;
    readonly bound: ProgressCapacityBound;
    readonly observedCount: ProgressCapacityCount;
    readonly supportedLimit: ProgressCapacityCount;
    readonly countKind: 'exact' | 'at-least' | 'unavailable';
    readonly context: ProgressCapacityContext;
}
export interface ProgressCapacityInput {
    readonly phase: ProgressCapacityPhase;
    readonly dimension: ProgressCapacityDimension;
    readonly observedCount: ProgressCapacityCount;
    readonly supportedLimit: ProgressCapacityCount;
    readonly bound?: ProgressCapacityBound;
    readonly countKind?: ProgressCapacityDiagnostic['countKind'];
    readonly context?: ProgressCapacityContext;
}
/** Shape validation does not certify a source; host call sites own attribution. */
export declare function normalizeProgressCapacityContext(value: unknown): ProgressCapacityContext;
/** Reject incoherent or arbitrary metadata and copy/freeze the complete public value. */
export declare function normalizeProgressCapacityDiagnostic(value: unknown): ProgressCapacityDiagnostic;
/** Unit/bound defaults are host policy, never text supplied by a model. */
export declare function progressCapacityDiagnostic(input: ProgressCapacityInput): ProgressCapacityDiagnostic;
