import { branchesForManagement, typesForIssue } from '../label_utils';
import { Branches } from '../../data/model/branches';
import type { Execution } from '../../data/model/execution';

function minimalExecution(branches: Branches): Pick<Execution, 'branches'> {
  return { branches };
}

describe('label_utils', () => {
  const branches = new Branches(
    'main',
    'main',
    'develop',
    'feature',
    'bugfix',
    'hotfix',
    'release',
    'docs',
    'chore'
  );

  const labelNames = {
    feature: 'feature',
    enhancement: 'enhancement',
    bugfix: 'bugfix',
    bug: 'bug',
    hotfix: 'hotfix',
    release: 'release',
    docs: 'docs',
    documentation: 'documentation',
    chore: 'chore',
    maintenance: 'maintenance',
  };

  describe('branchesForManagement', () => {
    it('returns hotfixTree when hotfix label is present', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        branchesForManagement(
          params,
          ['hotfix'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('bugfix');
    });

    it('returns bugfixTree for bugfix or bug labels', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        branchesForManagement(
          params,
          ['bugfix'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('bugfix');
      expect(
        branchesForManagement(
          params,
          ['bug'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('bugfix');
    });

    it('returns releaseTree for release label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        branchesForManagement(
          params,
          ['release'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('release');
    });

    it('returns docsTree for docs or documentation label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        branchesForManagement(
          params,
          ['docs'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('docs');
      expect(
        branchesForManagement(
          params,
          ['documentation'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('docs');
    });

    it('returns choreTree for chore or maintenance label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        branchesForManagement(
          params,
          ['chore'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('chore');
      expect(
        branchesForManagement(
          params,
          ['maintenance'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('chore');
    });

    it('returns featureTree for feature or enhancement or no matching label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        branchesForManagement(
          params,
          ['feature'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('feature');
      expect(
        branchesForManagement(
          params,
          ['enhancement'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('feature');
      expect(
        branchesForManagement(
          params,
          [],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('feature');
    });
  });

  describe('typesForIssue', () => {
    it('returns hotfixTree for hotfix label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        typesForIssue(
          params,
          ['hotfix'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('hotfix');
    });

    it('returns bugfixTree for bugfix or bug', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        typesForIssue(
          params,
          ['bugfix'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('bugfix');
    });

    it('returns releaseTree for release label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        typesForIssue(
          params,
          ['release'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('release');
    });

    it('returns docsTree for docs or documentation label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        typesForIssue(
          params,
          ['docs'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('docs');
      expect(
        typesForIssue(
          params,
          ['documentation'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('docs');
    });

    it('returns choreTree for chore or maintenance label', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        typesForIssue(
          params,
          ['chore'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('chore');
      expect(
        typesForIssue(
          params,
          ['maintenance'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('chore');
    });

    it('returns featureTree for feature, enhancement, or default', () => {
      const params = minimalExecution(branches) as Execution;
      expect(
        typesForIssue(
          params,
          ['feature'],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('feature');
      expect(
        typesForIssue(
          params,
          [],
          labelNames.feature,
          labelNames.enhancement,
          labelNames.bugfix,
          labelNames.bug,
          labelNames.hotfix,
          labelNames.release,
          labelNames.docs,
          labelNames.documentation,
          labelNames.chore,
          labelNames.maintenance
        )
      ).toBe('feature');
    });
  });
});
