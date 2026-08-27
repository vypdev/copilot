import {
    selectBranchPreparationStrategy,
} from '../branch_preparation_strategy';

describe('selectBranchPreparationStrategy', () => {
    it('prioritizes hotfix over release', () => {
        expect(selectBranchPreparationStrategy({ hotfixActive: true, releaseActive: true })).toBe('hotfix');
    });

    it('selects release when no hotfix is active', () => {
        expect(selectBranchPreparationStrategy({ hotfixActive: false, releaseActive: true })).toBe('release');
    });

    it('selects managed branches for the default flow', () => {
        expect(selectBranchPreparationStrategy({ hotfixActive: false, releaseActive: false })).toBe('managed');
    });
});
