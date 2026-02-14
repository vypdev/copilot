/**
 * Unit tests for IssueRepository: getDescription, addComment, getIssueDescription, isIssue, isPullRequest,
 * getLabels, setLabels, getTitle, getId, getMilestone, updateDescription, cleanTitle, getHeadBranch,
 * updateComment, listIssueComments, closeIssue, openIssue, getCurrentAssignees, assignMembersToIssue,
 * listLabelsForRepo, createLabel, ensureLabel, setProgressLabel, ensureProgressLabels.
 */

import { IssueRepository, PROGRESS_LABEL_PATTERN } from '../issue_repository';
import { Labels } from '../../model/labels';
import { IssueTypes } from '../../model/issue_types';

jest.mock('../../../utils/logger', () => ({
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockSetFailed = jest.fn();
jest.mock('@actions/core', () => ({
  setFailed: (...args: unknown[]) => mockSetFailed(...args),
}));

const mockRest = {
  issues: {
    get: jest.fn(),
    update: jest.fn(),
    createComment: jest.fn(),
    updateComment: jest.fn(),
    listLabelsOnIssue: jest.fn(),
    setLabels: jest.fn(),
    addAssignees: jest.fn(),
    listLabelsForRepo: jest.fn(),
    createLabel: jest.fn(),
    listComments: jest.fn(),
  },
  pulls: {
    get: jest.fn(),
  },
};

const mockPaginateIterator = jest.fn();
const mockGraphql = jest.fn();

jest.mock('@actions/github', () => ({
  getOctokit: () => ({
    rest: mockRest,
    graphql: (...args: unknown[]) => mockGraphql(...args),
    paginate: {
      iterator: (...args: unknown[]) => mockPaginateIterator(...args),
    },
  }),
}));

/** Build Labels with optional currentIssueLabels (for isHotfix, containsBranchedLabel, etc.). */
function makeLabels(overrides: { currentIssueLabels?: string[] } = {}): Labels {
  const labels = new Labels(
    'launch',
    'bug',
    'bugfix',
    'hotfix',
    'enhancement',
    'feature',
    'release',
    'question',
    'help',
    'deploy',
    'deployed',
    'docs',
    'documentation',
    'chore',
    'maintenance',
    'priority-high',
    'priority-medium',
    'priority-low',
    'priority-none',
    'xxl',
    'xl',
    'l',
    'm',
    's',
    'xs'
  );
  if (overrides.currentIssueLabels) {
    labels.currentIssueLabels = overrides.currentIssueLabels;
  }
  return labels;
}

describe('IssueRepository', () => {
  const repo = new IssueRepository();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateTitleIssueFormat', () => {
    it('updates title with emoji when hotfix and branched', async () => {
      const labels = makeLabels({ currentIssueLabels: ['hotfix', 'launch'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat(
        'o',
        'r',
        '',
        'Fix login',
        1,
        false,
        'x',
        labels,
        'token'
      );
      expect(result).toBe('🔥x - Fix login');
      expect(mockRest.issues.update).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 1,
        title: '🔥x - Fix login',
      });
    });

    it('returns undefined when formatted title equals current title', async () => {
      const labels = makeLabels();
      const result = await repo.updateTitleIssueFormat(
        'o',
        'r',
        '',
        '🤖 - Clean title',
        1,
        false,
        'x',
        labels,
        'token'
      );
      expect(result).toBeUndefined();
      expect(mockRest.issues.update).not.toHaveBeenCalled();
    });

    it('includes version in title when version length > 0', async () => {
      const labels = makeLabels({ currentIssueLabels: ['feature', 'launch'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat(
        'o',
        'r',
        'v1.0',
        'Add API',
        2,
        true,
        'y',
        labels,
        'token'
      );
      expect(result).toContain('v1.0');
      expect(result).toContain('Add API');
    });

    it('returns undefined and setFailed when update throws', async () => {
      const labels = makeLabels({ currentIssueLabels: ['bug'] });
      mockRest.issues.update.mockRejectedValue(new Error('API error'));
      const result = await repo.updateTitleIssueFormat(
        'o',
        'r',
        '',
        'Broken',
        1,
        false,
        'x',
        labels,
        'token'
      );
      expect(result).toBeUndefined();
      expect(mockSetFailed).toHaveBeenCalled();
    });

    it('uses hotfix emoji only (no branched) when labels are hotfix only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['hotfix'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'Fix prod', 1, false, 'x', labels, 'token');
      expect(result).toBe('🔥 - Fix prod');
    });

    it('uses release emoji only when labels are release only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['release'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'Release v2', 1, false, 'x', labels, 'token');
      expect(result).toBe('🚀 - Release v2');
    });

    it('uses docs emoji when labels are docs only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['docs'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'Update README', 1, false, 'x', labels, 'token');
      expect(result).toBe('📝 - Update README');
    });

    it('uses chore emoji when labels are chore only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['chore'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'Bump deps', 1, false, 'x', labels, 'token');
      expect(result).toBe('🔧 - Bump deps');
    });

    it('uses bugfix emoji when labels are bugfix only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['bugfix'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'Fix crash', 1, false, 'x', labels, 'token');
      expect(result).toBe('🐛 - Fix crash');
    });

    it('uses feature emoji when labels are feature only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['feature'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'New API', 1, false, 'x', labels, 'token');
      expect(result).toBe('✨ - New API');
    });

    it('uses help emoji when labels are help only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['help'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'Need support', 1, false, 'x', labels, 'token');
      expect(result).toBe('🆘 - Need support');
    });

    it('uses question emoji when labels are question only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['question'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitleIssueFormat('o', 'r', '', 'How to X', 1, false, 'x', labels, 'token');
      expect(result).toBe('❓ - How to X');
    });
  });

  describe('updateTitlePullRequestFormat', () => {
    it('updates PR title with [#N] and emoji when title differs', async () => {
      const labels = makeLabels({ currentIssueLabels: ['feature'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitlePullRequestFormat(
        'o',
        'r',
        'Old PR title',
        'Add feature',
        42,
        10,
        false,
        'x',
        labels,
        'token'
      );
      expect(result).toBe('[#42] ✨ - Add feature');
      expect(mockRest.issues.update).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 10,
        title: '[#42] ✨ - Add feature',
      });
    });

    it('returns undefined when formatted title equals pullRequestTitle', async () => {
      const labels = makeLabels();
      const result = await repo.updateTitlePullRequestFormat(
        'o',
        'r',
        '[#1] 🤖 - Same',
        'Same',
        1,
        5,
        false,
        'x',
        labels,
        'token'
      );
      expect(result).toBeUndefined();
      expect(mockRest.issues.update).not.toHaveBeenCalled();
    });

    it('returns undefined and setFailed when update throws', async () => {
      const labels = makeLabels({ currentIssueLabels: ['hotfix'] });
      mockRest.issues.update.mockRejectedValue(new Error('API error'));
      const result = await repo.updateTitlePullRequestFormat(
        'o',
        'r',
        'PR',
        'Fix',
        1,
        1,
        false,
        'x',
        labels,
        'token'
      );
      expect(result).toBeUndefined();
      expect(mockSetFailed).toHaveBeenCalled();
    });

    it('uses hotfix emoji only when labels are hotfix only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['hotfix'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitlePullRequestFormat('o', 'r', 'PR title', 'Fix', 1, 1, false, 'x', labels, 'token');
      expect(result).toBe('[#1] 🔥 - Fix');
    });

    it('uses release emoji when labels are release only', async () => {
      const labels = makeLabels({ currentIssueLabels: ['release'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.updateTitlePullRequestFormat('o', 'r', 'PR', 'Release', 1, 1, false, 'x', labels, 'token');
      expect(result).toBe('[#1] 🚀 - Release');
    });

    it('uses docs and chore emoji when labels are docs or chore only', async () => {
      const labelsDocs = makeLabels({ currentIssueLabels: ['docs'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const r1 = await repo.updateTitlePullRequestFormat('o', 'r', 'PR', 'Docs', 1, 1, false, 'x', labelsDocs, 'token');
      expect(r1).toBe('[#1] 📝 - Docs');
      const labelsChore = makeLabels({ currentIssueLabels: ['chore'] });
      const r2 = await repo.updateTitlePullRequestFormat('o', 'r', 'PR', 'Chore', 1, 1, false, 'x', labelsChore, 'token');
      expect(r2).toBe('[#1] 🔧 - Chore');
    });

    it('uses bugfix and feature emoji when labels only', async () => {
      const labelsBug = makeLabels({ currentIssueLabels: ['bugfix'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const r1 = await repo.updateTitlePullRequestFormat('o', 'r', 'PR', 'Fix', 1, 1, false, 'x', labelsBug, 'token');
      expect(r1).toBe('[#1] 🐛 - Fix');
      const labelsFeat = makeLabels({ currentIssueLabels: ['feature'] });
      const r2 = await repo.updateTitlePullRequestFormat('o', 'r', 'PR', 'Feature', 1, 1, false, 'x', labelsFeat, 'token');
      expect(r2).toBe('[#1] ✨ - Feature');
    });

    it('uses help and question emoji when labels only', async () => {
      const labelsHelp = makeLabels({ currentIssueLabels: ['help'] });
      mockRest.issues.update.mockResolvedValue(undefined);
      const r1 = await repo.updateTitlePullRequestFormat('o', 'r', 'PR', 'Help', 1, 1, false, 'x', labelsHelp, 'token');
      expect(r1).toBe('[#1] 🆘 - Help');
      const labelsQ = makeLabels({ currentIssueLabels: ['question'] });
      const r2 = await repo.updateTitlePullRequestFormat('o', 'r', 'PR', 'Question', 1, 1, false, 'x', labelsQ, 'token');
      expect(r2).toBe('[#1] ❓ - Question');
    });
  });

  describe('getDescription', () => {
    it('returns undefined when issueNumber is -1', async () => {
      const result = await repo.getDescription('o', 'r', -1, 'token');
      expect(result).toBeUndefined();
      expect(mockRest.issues.get).not.toHaveBeenCalled();
    });

    it('returns body when issue exists', async () => {
      mockRest.issues.get.mockResolvedValue({
        data: { body: 'Issue body text' },
      });
      const result = await repo.getDescription('owner', 'repo', 42, 'token');
      expect(result).toBe('Issue body text');
      expect(mockRest.issues.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 42,
      });
    });

    it('returns empty string when issue body is null', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { body: null } });
      const result = await repo.getDescription('o', 'r', 1, 'token');
      expect(result).toBe('');
    });

    it('returns undefined when get throws', async () => {
      mockRest.issues.get.mockRejectedValue(new Error('Not found'));
      const result = await repo.getDescription('o', 'r', 1, 'token');
      expect(result).toBeUndefined();
    });
  });

  describe('addComment', () => {
    it('calls issues.createComment with owner, repo, issue_number, body', async () => {
      mockRest.issues.createComment.mockResolvedValue(undefined);
      await repo.addComment('owner', 'repo', 10, 'Hello comment', 'token');
      expect(mockRest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 10,
        body: 'Hello comment',
      });
    });
  });

  describe('getIssueDescription', () => {
    it('returns issue body', async () => {
      mockRest.issues.get.mockResolvedValue({
        data: { body: 'Full issue description' },
      });
      const result = await repo.getIssueDescription('o', 'r', 5, 'token');
      expect(result).toBe('Full issue description');
      expect(mockRest.issues.get).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 5,
      });
    });

    it('returns empty string when body is null', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { body: null } });
      const result = await repo.getIssueDescription('o', 'r', 1, 'token');
      expect(result).toBe('');
    });
  });

  describe('isPullRequest', () => {
    it('returns true when issue is a pull request', async () => {
      mockRest.issues.get.mockResolvedValue({
        data: { pull_request: {} },
      });
      const result = await repo.isPullRequest('o', 'r', 3, 'token');
      expect(result).toBe(true);
    });

    it('returns false when issue is not a pull request', async () => {
      mockRest.issues.get.mockResolvedValue({
        data: {},
      });
      const result = await repo.isPullRequest('o', 'r', 3, 'token');
      expect(result).toBe(false);
    });
  });

  describe('isIssue', () => {
    it('returns true when isPullRequest returns false', async () => {
      mockRest.issues.get.mockResolvedValue({ data: {} });
      const result = await repo.isIssue('o', 'r', 3, 'token');
      expect(result).toBe(true);
    });

    it('returns false when isPullRequest returns true', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { pull_request: {} } });
      const result = await repo.isIssue('o', 'r', 3, 'token');
      expect(result).toBe(false);
    });
  });

  describe('getLabels', () => {
    it('returns empty array when issueNumber is -1', async () => {
      const result = await repo.getLabels('o', 'r', -1, 'token');
      expect(result).toEqual([]);
      expect(mockRest.issues.listLabelsOnIssue).not.toHaveBeenCalled();
    });

    it('returns label names from listLabelsOnIssue', async () => {
      mockRest.issues.listLabelsOnIssue.mockResolvedValue({
        data: [{ name: 'bug' }, { name: 'feature' }],
      });
      const result = await repo.getLabels('owner', 'repo', 1, 'token');
      expect(result).toEqual(['bug', 'feature']);
      expect(mockRest.issues.listLabelsOnIssue).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
      });
    });
  });

  describe('setLabels', () => {
    it('calls issues.setLabels with given labels', async () => {
      mockRest.issues.setLabels.mockResolvedValue(undefined);
      await repo.setLabels('o', 'r', 5, ['a', 'b'], 'token');
      expect(mockRest.issues.setLabels).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 5,
        labels: ['a', 'b'],
      });
    });
  });

  describe('getTitle', () => {
    it('returns issue title', async () => {
      mockRest.issues.get.mockResolvedValue({
        data: { title: 'My issue title' },
      });
      const result = await repo.getTitle('o', 'r', 1, 'token');
      expect(result).toBe('My issue title');
    });

    it('returns undefined when get throws', async () => {
      mockRest.issues.get.mockRejectedValue(new Error('Not found'));
      const result = await repo.getTitle('o', 'r', 1, 'token');
      expect(result).toBeUndefined();
    });
  });

  describe('getId', () => {
    it('returns issue node id from GraphQL', async () => {
      mockGraphql.mockResolvedValue({
        repository: { issue: { id: 'I_kwDOABC123' } },
      });
      const result = await repo.getId('o', 'r', 1, 'token');
      expect(result).toBe('I_kwDOABC123');
      expect(mockGraphql).toHaveBeenCalled();
    });
  });

  describe('getMilestone', () => {
    it('returns Milestone when issue has milestone', async () => {
      mockRest.issues.get.mockResolvedValue({
        data: {
          milestone: {
            id: 42,
            title: 'v1.0',
            description: 'Release 1.0',
          },
        },
      });
      const result = await repo.getMilestone('o', 'r', 1, 'token');
      expect(result).not.toBeUndefined();
      expect(result?.title).toBe('v1.0');
      expect(result?.id).toBe(42);
    });

    it('returns undefined when issue has no milestone', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { milestone: null } });
      const result = await repo.getMilestone('o', 'r', 1, 'token');
      expect(result).toBeUndefined();
    });
  });

  describe('updateDescription', () => {
    it('calls issues.update with body', async () => {
      mockRest.issues.update.mockResolvedValue(undefined);
      await repo.updateDescription('o', 'r', 1, 'New body', 'token');
      expect(mockRest.issues.update).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 1,
        body: 'New body',
      });
    });

    it('throws when update throws', async () => {
      mockRest.issues.update.mockRejectedValue(new Error('API error'));
      await expect(
        repo.updateDescription('o', 'r', 1, 'Body', 'token')
      ).rejects.toThrow('API error');
    });
  });

  describe('cleanTitle', () => {
    it('updates title when sanitized differs from original', async () => {
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.cleanTitle('o', 'r', '  messy   title  ', 1, 'token');
      expect(result).toBe('messy title');
      expect(mockRest.issues.update).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 1,
        title: 'messy title',
      });
    });

    it('returns undefined when title already clean', async () => {
      const result = await repo.cleanTitle('o', 'r', 'Clean title', 1, 'token');
      expect(result).toBeUndefined();
      expect(mockRest.issues.update).not.toHaveBeenCalled();
    });

    it('returns undefined and setFailed when update throws', async () => {
      mockRest.issues.update.mockRejectedValue(new Error('Fail'));
      const result = await repo.cleanTitle('o', 'r', '  x  ', 1, 'token');
      expect(result).toBeUndefined();
      expect(mockSetFailed).toHaveBeenCalled();
    });
  });

  describe('getHeadBranch', () => {
    it('returns undefined when not a PR', async () => {
      mockRest.issues.get.mockResolvedValue({ data: {} });
      const result = await repo.getHeadBranch('o', 'r', 3, 'token');
      expect(result).toBeUndefined();
      expect(mockRest.pulls.get).not.toHaveBeenCalled();
    });

    it('returns head ref when issue is a PR', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { pull_request: {} } });
      mockRest.pulls.get.mockResolvedValue({
        data: { head: { ref: 'feature/123-branch' } },
      });
      const result = await repo.getHeadBranch('o', 'r', 3, 'token');
      expect(result).toBe('feature/123-branch');
      expect(mockRest.pulls.get).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        pull_number: 3,
      });
    });
  });

  describe('updateComment', () => {
    it('calls issues.updateComment with comment_id and body', async () => {
      mockRest.issues.updateComment.mockResolvedValue(undefined);
      await repo.updateComment('o', 'r', 1, 100, 'Updated body', 'token');
      expect(mockRest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        comment_id: 100,
        body: 'Updated body',
      });
    });
  });

  describe('listIssueComments', () => {
    it('returns all comments from paginated iterator', async () => {
      const asyncIter = (async function* () {
        yield { data: [{ id: 1, body: 'c1', user: { login: 'u1' } }] };
        yield { data: [{ id: 2, body: 'c2', user: undefined }] };
      })();
      mockPaginateIterator.mockReturnValue(asyncIter);
      const result = await repo.listIssueComments('o', 'r', 5, 'token');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, body: 'c1', user: { login: 'u1' } });
      expect(result[1]).toEqual({ id: 2, body: 'c2', user: undefined });
    });
  });

  describe('closeIssue', () => {
    it('closes issue when open and returns true', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { state: 'open' } });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.closeIssue('o', 'r', 1, 'token');
      expect(result).toBe(true);
      expect(mockRest.issues.update).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 1,
        state: 'closed',
      });
    });

    it('returns false when issue already closed', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { state: 'closed' } });
      const result = await repo.closeIssue('o', 'r', 1, 'token');
      expect(result).toBe(false);
      expect(mockRest.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('openIssue', () => {
    it('reopens issue when closed and returns true', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { state: 'closed' } });
      mockRest.issues.update.mockResolvedValue(undefined);
      const result = await repo.openIssue('o', 'r', 1, 'token');
      expect(result).toBe(true);
      expect(mockRest.issues.update).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 1,
        state: 'open',
      });
    });

    it('returns false when issue already open', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { state: 'open' } });
      const result = await repo.openIssue('o', 'r', 1, 'token');
      expect(result).toBe(false);
      expect(mockRest.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentAssignees', () => {
    it('returns assignee logins', async () => {
      mockRest.issues.get.mockResolvedValue({
        data: { assignees: [{ login: 'alice' }, { login: 'bob' }] },
      });
      const result = await repo.getCurrentAssignees('o', 'r', 1, 'token');
      expect(result).toEqual(['alice', 'bob']);
    });

    it('returns empty array when assignees null', async () => {
      mockRest.issues.get.mockResolvedValue({ data: { assignees: null } });
      const result = await repo.getCurrentAssignees('o', 'r', 1, 'token');
      expect(result).toEqual([]);
    });

    it('returns empty array when get throws', async () => {
      mockRest.issues.get.mockRejectedValue(new Error('API error'));
      const result = await repo.getCurrentAssignees('o', 'r', 1, 'token');
      expect(result).toEqual([]);
    });
  });

  describe('assignMembersToIssue', () => {
    it('adds assignees and returns their logins', async () => {
      mockRest.issues.addAssignees.mockResolvedValue({
        data: { assignees: [{ login: 'alice' }, { login: 'bob' }] },
      });
      const result = await repo.assignMembersToIssue('o', 'r', 1, ['alice', 'bob'], 'token');
      expect(result).toEqual(['alice', 'bob']);
      expect(mockRest.issues.addAssignees).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 1,
        assignees: ['alice', 'bob'],
      });
    });

    it('returns empty array when members empty', async () => {
      const result = await repo.assignMembersToIssue('o', 'r', 1, [], 'token');
      expect(result).toEqual([]);
      expect(mockRest.issues.addAssignees).not.toHaveBeenCalled();
    });

    it('returns empty array when addAssignees throws', async () => {
      mockRest.issues.addAssignees.mockRejectedValue(new Error('API error'));
      const result = await repo.assignMembersToIssue('o', 'r', 1, ['x'], 'token');
      expect(result).toEqual([]);
    });
  });

  describe('listLabelsForRepo', () => {
    it('returns labels with name, color, description', async () => {
      mockRest.issues.listLabelsForRepo.mockResolvedValue({
        data: [
          { name: 'bug', color: 'd73a4a', description: 'Bug' },
          { name: 'feature', color: '0e8a16', description: null },
        ],
      });
      const result = await repo.listLabelsForRepo('o', 'r', 'token');
      expect(result).toEqual([
        { name: 'bug', color: 'd73a4a', description: 'Bug' },
        { name: 'feature', color: '0e8a16', description: null },
      ]);
    });
  });

  describe('createLabel', () => {
    it('calls issues.createLabel with owner, repo, name, color, description', async () => {
      mockRest.issues.createLabel.mockResolvedValue(undefined);
      await repo.createLabel('o', 'r', 'new-label', 'abc123', 'Description', 'token');
      expect(mockRest.issues.createLabel).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        name: 'new-label',
        color: 'abc123',
        description: 'Description',
      });
    });
  });

  describe('ensureLabel', () => {
    it('returns existed true when label already exists', async () => {
      mockRest.issues.listLabelsForRepo.mockResolvedValue({
        data: [{ name: 'existing', color: 'x', description: null }],
      });
      const result = await repo.ensureLabel('o', 'r', 'existing', 'abc', 'Desc', 'token');
      expect(result).toEqual({ created: false, existed: true });
      expect(mockRest.issues.createLabel).not.toHaveBeenCalled();
    });

    it('returns created true when label created', async () => {
      mockRest.issues.listLabelsForRepo.mockResolvedValue({ data: [] });
      mockRest.issues.createLabel.mockResolvedValue(undefined);
      const result = await repo.ensureLabel('o', 'r', 'new-label', 'abc', 'Desc', 'token');
      expect(result).toEqual({ created: true, existed: false });
      expect(mockRest.issues.createLabel).toHaveBeenCalled();
    });

    it('returns existed true on 422 already exists', async () => {
      mockRest.issues.listLabelsForRepo.mockResolvedValue({ data: [] });
      mockRest.issues.createLabel.mockRejectedValue(
        Object.assign(new Error('already exists'), { status: 422 })
      );
      const result = await repo.ensureLabel('o', 'r', 'new', 'abc', 'd', 'token');
      expect(result).toEqual({ created: false, existed: true });
    });

    it('returns created false and existed false when name is empty', async () => {
      const result = await repo.ensureLabel('o', 'r', '  ', 'abc', 'd', 'token');
      expect(result).toEqual({ created: false, existed: false });
      expect(mockRest.issues.createLabel).not.toHaveBeenCalled();
    });
  });

  describe('setProgressLabel', () => {
    it('sets progress label and removes other percentage labels', async () => {
      mockRest.issues.listLabelsOnIssue.mockResolvedValue({
        data: [{ name: '50%' }, { name: 'feature' }],
      });
      mockRest.issues.setLabels.mockResolvedValue(undefined);
      await repo.setProgressLabel('o', 'r', 1, 75, 'token');
      expect(mockRest.issues.setLabels).toHaveBeenCalledWith({
        owner: 'o',
        repo: 'r',
        issue_number: 1,
        labels: ['feature', '75%'],
      });
    });
  });

  describe('ensureProgressLabels', () => {
    it('creates and counts created/existing progress labels', async () => {
      mockRest.issues.listLabelsForRepo.mockResolvedValue({
        data: [{ name: '0%', color: 'x', description: null }],
      });
      mockRest.issues.createLabel.mockResolvedValue(undefined);
      const result = await repo.ensureProgressLabels('o', 'r', 'token');
      expect(result.errors).toEqual([]);
      expect(result.created + result.existing).toBeGreaterThan(0);
    });

    it('collects errors when ensureLabel throws', async () => {
      mockRest.issues.listLabelsForRepo.mockResolvedValue({ data: [] });
      mockRest.issues.createLabel.mockRejectedValue(new Error('API error'));
      const result = await repo.ensureProgressLabels('o', 'r', 'token');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('setIssueType', () => {
    const issueTypes = new IssueTypes(
      'Task', 'Task desc', 'BLUE',
      'Bug', 'Bug desc', 'RED',
      'Feature', 'Feature desc', 'GREEN',
      'Docs', 'Docs desc', 'GREY',
      'Maintenance', 'Maint desc', 'GREY',
      'Hotfix', 'Hotfix desc', 'RED',
      'Release', 'Release desc', 'BLUE',
      'Question', 'Q desc', 'PURPLE',
      'Help', 'Help desc', 'PURPLE'
    );

    it('sets issue type when type exists in organization', async () => {
      const labels = makeLabels({ currentIssueLabels: ['bug'] });
      mockGraphql
        .mockResolvedValueOnce({ repository: { issue: { id: 'I_1' } } })
        .mockResolvedValueOnce({
          organization: {
            id: 'O_1',
            issueTypes: { nodes: [{ id: 'T_BUG', name: 'Bug' }] },
          },
        })
        .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1', issueType: { id: 'T_BUG', name: 'Bug' } } } });
      await repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token');
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });

    it('creates issue type when not found then updates issue', async () => {
      const labels = makeLabels({ currentIssueLabels: ['hotfix'] });
      mockGraphql
        .mockResolvedValueOnce({ repository: { issue: { id: 'I_1' } } })
        .mockResolvedValueOnce({
          organization: { id: 'O_1', issueTypes: { nodes: [] } },
        })
        .mockResolvedValueOnce({ createIssueType: { issueType: { id: 'T_NEW' } } })
        .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
      await repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token');
      expect(mockGraphql).toHaveBeenCalledTimes(4);
    });

    it('returns early when createIssueType throws', async () => {
      const labels = makeLabels({ currentIssueLabels: ['release'] });
      mockGraphql
        .mockResolvedValueOnce({ repository: { issue: { id: 'I_1' } } })
        .mockResolvedValueOnce({
          organization: { id: 'O_1', issueTypes: { nodes: [] } },
        })
        .mockRejectedValueOnce(new Error('Create failed'));
      await repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token');
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });

    it('throws when getId or organization query fails', async () => {
      const labels = makeLabels({ currentIssueLabels: ['feature'] });
      mockGraphql.mockRejectedValue(new Error('GraphQL error'));
      await expect(
        repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token')
      ).rejects.toThrow('GraphQL error');
    });

    it('sets documentation issue type when labels are docs', async () => {
      const labels = makeLabels({ currentIssueLabels: ['docs'] });
      mockGraphql
        .mockResolvedValueOnce({ repository: { issue: { id: 'I_1' } } })
        .mockResolvedValueOnce({
          organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T_DOCS', name: 'Docs' }] } },
        })
        .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
      await repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token');
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });

    it('sets maintenance issue type when labels are chore', async () => {
      const labels = makeLabels({ currentIssueLabels: ['chore'] });
      mockGraphql
        .mockResolvedValueOnce({ repository: { issue: { id: 'I_1' } } })
        .mockResolvedValueOnce({
          organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T_MAINT', name: 'Maintenance' }] } },
        })
        .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
      await repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token');
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });

    it('sets help issue type when labels are help', async () => {
      const labels = makeLabels({ currentIssueLabels: ['help'] });
      mockGraphql
        .mockResolvedValueOnce({ repository: { issue: { id: 'I_1' } } })
        .mockResolvedValueOnce({
          organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T_HELP', name: 'Help' }] } },
        })
        .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
      await repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token');
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });

    it('sets question issue type when labels are question', async () => {
      const labels = makeLabels({ currentIssueLabels: ['question'] });
      mockGraphql
        .mockResolvedValueOnce({ repository: { issue: { id: 'I_1' } } })
        .mockResolvedValueOnce({
          organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T_Q', name: 'Question' }] } },
        })
        .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
      await repo.setIssueType('org', 'repo', 1, labels, issueTypes, 'token');
      expect(mockGraphql).toHaveBeenCalledTimes(3);
    });
  });

  describe('ensureLabels', () => {
    it('ensures all required labels and returns counts', async () => {
      const labels = new Labels(
        'launch',
        'bug',
        'bugfix',
        'hotfix',
        'enhancement',
        'feature',
        'release',
        'question',
        'help',
        'deploy',
        'deployed',
        'docs',
        'documentation',
        'chore',
        'maintenance',
        'priority-high',
        'priority-medium',
        'priority-low',
        'priority-none',
        'xxl',
        'xl',
        'l',
        'm',
        's',
        'xs'
      );
      mockRest.issues.listLabelsForRepo.mockResolvedValue({ data: [] });
      mockRest.issues.createLabel.mockResolvedValue(undefined);
      const result = await repo.ensureLabels('o', 'r', labels, 'token');
      expect(result.errors).toEqual([]);
      expect(result.created).toBeGreaterThan(0);
    });

    it('collects errors when one ensureLabel throws', async () => {
      const labels = makeLabels();
      mockRest.issues.listLabelsForRepo.mockResolvedValue({ data: [] });
      let callCount = 0;
      mockRest.issues.createLabel.mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('Label exists'));
        return Promise.resolve(undefined);
      });
      const result = await repo.ensureLabels('o', 'r', labels, 'token');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('Label exists'))).toBe(true);
    });
  });

  describe('listIssueTypes', () => {
    it('returns issue types from organization', async () => {
      mockGraphql.mockResolvedValue({
        organization: {
          id: 'O_1',
          issueTypes: { nodes: [{ id: 'T1', name: 'Task' }, { id: 'T2', name: 'Bug' }] },
        },
      });
      const result = await repo.listIssueTypes('org', 'token');
      expect(result).toEqual([{ id: 'T1', name: 'Task' }, { id: 'T2', name: 'Bug' }]);
    });

    it('throws when organization is missing', async () => {
      mockGraphql.mockResolvedValue({ organization: null });
      await expect(repo.listIssueTypes('org', 'token')).rejects.toThrow();
    });
  });

  describe('createIssueType', () => {
    it('returns new issue type id', async () => {
      mockGraphql
        .mockResolvedValueOnce({ organization: { id: 'O_1' } })
        .mockResolvedValueOnce({
          createIssueType: { issueType: { id: 'NEW_ID' } },
        });
      const result = await repo.createIssueType('org', 'Task', 'A task', 'BLUE', 'token');
      expect(result).toBe('NEW_ID');
    });

    it('throws when organization is missing', async () => {
      mockGraphql.mockResolvedValue({ organization: null });
      await expect(
        repo.createIssueType('org', 'T', 'D', 'BLUE', 'token')
      ).rejects.toThrow();
    });
  });

  describe('ensureIssueType', () => {
    it('returns existed true when type already exists', async () => {
      mockGraphql.mockResolvedValue({
        organization: { issueTypes: { nodes: [{ id: 'T1', name: 'task' }] } },
      });
      const result = await repo.ensureIssueType('org', 'Task', 'Desc', 'BLUE', 'token');
      expect(result).toEqual({ created: false, existed: true });
    });

    it('returns created true when type created', async () => {
      mockGraphql
        .mockResolvedValueOnce({
          organization: { issueTypes: { nodes: [] } },
        })
        .mockResolvedValueOnce({ organization: { id: 'O_1' } })
        .mockResolvedValueOnce({ createIssueType: { issueType: { id: 'NEW' } } });
      const result = await repo.ensureIssueType('org', 'NewType', 'D', 'BLUE', 'token');
      expect(result).toEqual({ created: true, existed: false });
    });
  });

  describe('ensureIssueTypes', () => {
    it('ensures issue types and returns counts when types already exist', async () => {
      const issueTypes = new IssueTypes(
        'Task', 'Task desc', 'BLUE',
        'Bug', 'Bug desc', 'RED',
        'Feature', 'Feature desc', 'GREEN',
        'Docs', 'Docs desc', 'GREY',
        'Maintenance', 'Maint desc', 'GREY',
        'Hotfix', 'Hotfix desc', 'RED',
        'Release', 'Release desc', 'BLUE',
        'Question', 'Q desc', 'PURPLE',
        'Help', 'Help desc', 'PURPLE'
      );
      mockGraphql.mockResolvedValue({
        organization: {
          id: 'O_1',
          issueTypes: {
            nodes: [
              { id: 'T1', name: 'Task' },
              { id: 'T2', name: 'Bug' },
              { id: 'T3', name: 'Feature' },
              { id: 'T4', name: 'Docs' },
              { id: 'T5', name: 'Maintenance' },
              { id: 'T6', name: 'Hotfix' },
              { id: 'T7', name: 'Release' },
              { id: 'T8', name: 'Question' },
              { id: 'T9', name: 'Help' },
            ],
          },
        },
      });
      const result = await repo.ensureIssueTypes('org', issueTypes, 'token');
      expect(result.existing).toBe(9);
      expect(result.created).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('collects errors when one ensureIssueType throws', async () => {
      const issueTypesForTest = new IssueTypes(
        'Task', 'Task desc', 'BLUE',
        'Bug', 'Bug desc', 'RED',
        'Feature', 'Feature desc', 'GREEN',
        'Docs', 'Docs desc', 'GREY',
        'Maintenance', 'Maint desc', 'GREY',
        'Hotfix', 'Hotfix desc', 'RED',
        'Release', 'Release desc', 'BLUE',
        'Question', 'Q desc', 'PURPLE',
        'Help', 'Help desc', 'PURPLE'
      );
      let callCount = 0;
      mockGraphql.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T1', name: 'Task' }] } },
          });
        }
        if (callCount <= 3) {
          return Promise.resolve({ organization: { id: 'O_1', issueTypes: { nodes: [] } } });
        }
        return Promise.reject(new Error('Create failed'));
      });
      const result = await repo.ensureIssueTypes('org', issueTypesForTest, 'token');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('pushes error message from thrown error in ensureIssueTypes', async () => {
      const issueTypesForTest = new IssueTypes(
        'Task', 'Task desc', 'BLUE',
        'Bug', 'Bug desc', 'RED',
        'Feature', 'Feature desc', 'GREEN',
        'Docs', 'Docs desc', 'GREY',
        'Maintenance', 'Maint desc', 'GREY',
        'Hotfix', 'Hotfix desc', 'RED',
        'Release', 'Release desc', 'BLUE',
        'Question', 'Q desc', 'PURPLE',
        'Help', 'Help desc', 'PURPLE'
      );
      let callCount = 0;
      mockGraphql.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T1', name: 'Task' }] } },
          });
        }
        if (callCount === 2) {
          return Promise.resolve({ organization: { id: 'O_1', issueTypes: { nodes: [] } } });
        }
        return Promise.reject(new Error('Create failed'));
      });
      const result = await repo.ensureIssueTypes('org', issueTypesForTest, 'token');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('Create failed'))).toBe(true);
    });
  });
});

describe('PROGRESS_LABEL_PATTERN', () => {
  it('matches percentage labels', () => {
    expect('0%').toMatch(PROGRESS_LABEL_PATTERN);
    expect('50%').toMatch(PROGRESS_LABEL_PATTERN);
    expect('100%').toMatch(PROGRESS_LABEL_PATTERN);
  });

  it('does not match non-percentage strings', () => {
    expect('feature').not.toMatch(PROGRESS_LABEL_PATTERN);
    expect('50').not.toMatch(PROGRESS_LABEL_PATTERN);
  });
});
