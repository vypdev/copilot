import { Config } from '../config';
import { restorePreviousBranchState } from '../previous_branch_state_policy';

describe('previous branch state policy', () => {
    it('restores release state', () => {
        const state = restorePreviousBranchState(
            new Config({ releaseBranch: 'release/1.2.3', parentBranch: 'develop' }),
            'release',
            'release',
            'hotfix',
        );
        expect(state).toEqual({
            releaseVersion: '1.2.3',
            releaseBranch: 'release/1.2.3',
            parentBranch: 'develop',
        });
    });

    it('restores hotfix state', () => {
        const state = restorePreviousBranchState(
            new Config({ hotfixOriginBranch: 'tags/v1.2.3', hotfixBranch: 'hotfix/1.2.4' }),
            'hotfix',
            'release',
            'hotfix',
        );
        expect(state.hotfixBaseBranch).toBe('tags/v1.2.3');
        expect(state.hotfixBranch).toBe('hotfix/1.2.4');
        expect(state.parentBranch).toBe('tags/v1.2.3');
    });
});
