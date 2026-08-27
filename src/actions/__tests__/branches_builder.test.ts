import { buildBranches } from '../branches_builder';

describe('buildBranches', () => {
    it('builds the branch configuration from named values', () => {
        const branches = buildBranches({
            main: 'main',
            defaultBranch: 'main',
            development: 'develop',
            featureTree: 'feature',
            bugfixTree: 'bugfix',
            hotfixTree: 'hotfix',
            releaseTree: 'release',
            docsTree: 'docs',
            choreTree: 'chore',
        });

        expect(branches).toMatchObject({
            main: 'main',
            defaultBranch: 'main',
            development: 'develop',
            featureTree: 'feature',
            bugfixTree: 'bugfix',
            hotfixTree: 'hotfix',
            releaseTree: 'release',
            docsTree: 'docs',
            choreTree: 'chore',
        });
    });
});
