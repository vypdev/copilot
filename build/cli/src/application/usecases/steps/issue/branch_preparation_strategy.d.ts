export type BranchPreparationStrategy = 'hotfix' | 'release' | 'managed';
export interface BranchPreparationFlags {
    hotfixActive: boolean;
    releaseActive: boolean;
}
/**
 * Selects the branch preparation flow using the domain precedence rules.
 * Hotfix takes precedence when both special flows are active.
 */
export declare function selectBranchPreparationStrategy(flags: BranchPreparationFlags): BranchPreparationStrategy;
