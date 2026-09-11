import type { BugbotReconciliationSnapshot } from '../../contracts/bugbot_reconciliation';
import { buildMarker } from '../bugbot_finding_marker_policy';
import { projectBugbotProviderEvidence } from '../bugbot_provider_projection_policy';

const marker = (
  id: string,
  resolved = false,
  resolution?: 'fixed' | 'obsolete' | 'dismissed',
) => buildMarker(id, resolved, 'fp-11111111', 'sf-11111111', resolution);

function snapshot(
  overrides: Partial<BugbotReconciliationSnapshot> = {},
): BugbotReconciliationSnapshot {
  return {
    verifiedHeadSha: 'a'.repeat(40),
    linkedIssueComments: [],
    pullRequestComments: [],
    reviewThreads: {},
    reviews: [],
    conversationComments: [],
    navigation: {
      pullRequestUrl: 'https://github.example/org/repo/pull/10',
      commitUrl: `https://github.example/org/repo/commit/${'a'.repeat(40)}`,
    },
    completeness: {
      linkedIssueComments: 'verified',
      pullRequestComments: 'verified',
      reviewThreads: 'verified',
      reviews: 'verified',
      conversation: 'verified',
      navigation: 'verified',
    },
    ...overrides,
  };
}

describe('projectBugbotProviderEvidence', () => {
  it('does not let a fixed PR destination hide an open issue destination', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        linkedIssueComments: [{
          id: 1,
          user: { login: 'bugbot' },
          body: `## Still open\n\n${marker('finding')}`,
        }],
        pullRequestComments: [{
          id: 2,
          identity: 'PRRC_2',
          authorLogin: 'bugbot',
          body: `## Fixed here\n\n${marker('finding', true, 'fixed')}`,
        }],
        reviewThreads: { PRRC_2: { resolved: true, resolvedByLogin: 'bugbot' } },
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings).toEqual([
      expect.objectContaining({ id: 'finding', state: 'open', title: 'Fixed here' }),
    ]);
    expect(result.observed.issueFindingIds.has('finding')).toBe(true);
    expect(result.observed.pullRequestFindingIds.has('finding')).toBe(true);
  });

  it('does not let a clean issue destination hide an open PR destination', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        linkedIssueComments: [{
          id: 1,
          user: { login: 'bugbot' },
          body: marker('finding', true, 'fixed'),
        }],
        pullRequestComments: [{
          id: 2,
          identity: 'PRRC_2',
          authorLogin: 'bugbot',
          body: marker('finding'),
        }],
        reviewThreads: { PRRC_2: { resolved: false } },
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings[0]?.state).toBe('open');
  });

  it('prefers inline thread evidence over a stale parent-review marker', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        pullRequestComments: [{
          id: 2,
          identity: 'PRRC_2',
          parentReviewIdentity: '77',
          authorLogin: 'bugbot',
          body: marker('finding', true, 'fixed'),
        }],
        reviewThreads: { PRRC_2: { resolved: true, resolvedByLogin: 'bugbot' } },
        reviews: [{
          identity: '77',
          authorLogin: 'bugbot',
          body: marker('finding'),
        }],
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings[0]?.state).toBe('fixed');
  });

  it('projects trusted malformed evidence as unknown and ignores spoofed evidence', () => {
    const malformed = '<!-- copilot-bugbot finding_id:"finding" resolved:maybe -->';
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        linkedIssueComments: [
          { id: 1, user: { login: 'bugbot' }, body: malformed },
          { id: 2, user: { login: 'attacker' }, body: marker('spoofed') },
        ],
      }),
      trustedAuthorLogin: 'BUGBOT',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.malformedEvidence).toBe(true);
    expect(result.findings).toEqual([
      expect.objectContaining({ id: 'malformed-issue-comment-1', state: 'unknown' }),
    ]);
  });

  it('projects PR findings as unknown when native thread facts are unavailable', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        pullRequestComments: [{
          id: 2,
          identity: 'PRRC_2',
          authorLogin: 'bugbot',
          body: marker('finding'),
        }],
        completeness: {
          ...snapshot().completeness,
          reviewThreads: 'failed',
        },
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings[0]?.state).toBe('unknown');
  });

  it('keeps only authenticated same-repository HTTPS finding URLs', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        pullRequestComments: [
          {
            id: 1,
            identity: 'PRRC_1',
            authorLogin: 'bugbot',
            body: marker('unsafe'),
            url: 'https://attacker.test/steal',
          },
          {
            id: 2,
            identity: 'PRRC_2',
            authorLogin: 'bugbot',
            body: marker('safe'),
            url: 'https://github.example/org/repo/pull/10/files(a)#discussion_r2',
          },
        ],
        reviewThreads: {
          PRRC_1: { resolved: false },
          PRRC_2: { resolved: false },
        },
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings.find(({ id }) => id === 'unsafe')?.url).toBeUndefined();
    expect(result.findings.find(({ id }) => id === 'safe')?.url)
      .toContain('files%28a%29');
  });

  it('ignores untrusted PR comments and retains trusted malformed comment metadata', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        pullRequestComments: [
          {
            id: 1,
            identity: 'PRRC_spoofed',
            authorLogin: 'attacker',
            body: marker('spoofed'),
          },
          {
            id: 2,
            identity: 'PRRC_malformed',
            parentReviewIdentity: '77',
            authorLogin: 'bugbot',
            body: '<!-- copilot-bugbot finding_id:"broken" resolved:maybe -->',
            url: 'https://github.example/org/repo/pull/10#discussion_r2',
          },
        ],
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings).toEqual([expect.objectContaining({
      id: 'malformed-comment-PRRC_malformed',
      state: 'unknown',
      parentReviewIdentity: '77',
      url: 'https://github.example/org/repo/pull/10#discussion_r2',
    })]);
  });

  it('projects review-only resolved and unresolved markers with safe metadata', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        reviews: [
          {
            identity: '77',
            authorLogin: 'bugbot',
            body: marker('obsolete', true, 'obsolete'),
            url: 'https://github.example/org/repo/pull/10#pullrequestreview-77',
          },
          {
            identity: '88',
            authorLogin: 'bugbot',
            body: marker('open'),
          },
          {
            identity: '89',
            authorLogin: 'bugbot',
            body: marker('fixed-default', true),
          },
          {
            identity: '99',
            authorLogin: 'attacker',
            body: marker('spoofed'),
          },
        ],
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'obsolete',
        state: 'obsolete',
        url: 'https://github.example/org/repo/pull/10#pullrequestreview-77',
      }),
      expect.objectContaining({ id: 'open', state: 'open' }),
      expect.objectContaining({ id: 'fixed-default', state: 'fixed' }),
    ]));
    expect(result.findings).toHaveLength(3);
  });

  it('projects a malformed trusted review even when no safe URL is available', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        reviews: [{
          identity: '77',
          authorLogin: 'bugbot',
          body: '<!-- copilot-bugbot finding_id:"broken" resolved:maybe -->',
        }],
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings).toEqual([expect.objectContaining({
      id: 'malformed-review-77',
      state: 'unknown',
    })]);
    expect(result.findings[0]?.url).toBeUndefined();
  });

  it('uses stable finding IDs as titles when provider bodies have no heading', () => {
    const result = projectBugbotProviderEvidence({
      snapshot: snapshot({
        linkedIssueComments: [{
          id: 1,
          user: { login: 'bugbot' },
          body: marker('issue-title'),
        }],
        pullRequestComments: [{
          id: 2,
          identity: 'PRRC_2',
          authorLogin: 'bugbot',
          body: marker('pr-title'),
        }],
        reviewThreads: { PRRC_2: { resolved: false } },
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(result.findings.find(({ id }) => id === 'issue-title')?.title)
      .toBe('issue-title');
    expect(result.findings.find(({ id }) => id === 'pr-title')?.title)
      .toBe('pr-title');
  });

  it('handles trusted empty bodies and missing trusted identity without evidence', () => {
    const trustedEmpty = projectBugbotProviderEvidence({
      snapshot: snapshot({
        linkedIssueComments: [{ id: 1, user: { login: 'bugbot' }, body: null }],
      }),
      trustedAuthorLogin: 'bugbot',
      activeFindings: [],
      existingByFindingId: {},
    });
    const missingIdentity = projectBugbotProviderEvidence({
      snapshot: snapshot({
        pullRequestComments: [{
          id: 2,
          identity: 'PRRC_2',
          authorLogin: 'bugbot',
          body: marker('finding'),
        }],
      }),
      trustedAuthorLogin: undefined,
      activeFindings: [],
      existingByFindingId: {},
    });

    expect(trustedEmpty.findings).toEqual([]);
    expect(missingIdentity.findings).toEqual([]);
  });
});
