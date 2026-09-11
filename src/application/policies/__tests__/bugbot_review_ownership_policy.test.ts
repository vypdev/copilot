import { buildMarker } from '../bugbot_finding_marker_policy';
import {
  isTrustedBugbotAuthor,
  selectOwnedBugbotReviews,
} from '../bugbot_review_ownership_policy';

const marker = (id: string) =>
  buildMarker(id, false, 'fp-11111111', 'sf-11111111');

describe('Bugbot review ownership policy', () => {
  it('combines projected parents, trusted child markers, and review markers', () => {
    const result = selectOwnedBugbotReviews({
      reviews: [{
        identity: '77',
        authorLogin: 'bugbot',
        body: marker('review-finding'),
      }],
      comments: [
        {
          id: 1,
          identity: 'PRRC_1',
          parentReviewIdentity: '77',
          authorLogin: 'bugbot',
          body: marker('child-finding'),
        },
        {
          id: 2,
          identity: 'PRRC_2',
          authorLogin: 'bugbot',
          body: marker('parentless'),
        },
        {
          id: 3,
          identity: 'PRRC_3',
          parentReviewIdentity: '77',
          authorLogin: 'attacker',
          body: marker('spoofed'),
        },
      ],
      trustedAuthorLogin: 'bugbot',
      findings: [
        { id: 'projected-parent', state: 'unknown', parentReviewIdentity: '77' },
        { id: 'child-finding', state: 'open' },
        { id: 'review-finding', state: 'open' },
      ],
    });

    expect(result).toEqual([expect.objectContaining({
      findings: expect.arrayContaining([
        expect.objectContaining({ id: 'projected-parent' }),
        expect.objectContaining({ id: 'child-finding' }),
        expect.objectContaining({ id: 'review-finding' }),
      ]),
    })]);
    expect(result[0].findings).toHaveLength(3);
  });

  it('ignores unowned, empty, untrusted, and unknown finding references', () => {
    const result = selectOwnedBugbotReviews({
      reviews: [
        { identity: 'empty', authorLogin: 'bugbot', body: null },
        { identity: 'unknown', authorLogin: 'bugbot', body: marker('missing') },
        { identity: 'spoofed', authorLogin: 'attacker', body: marker('finding') },
      ],
      comments: [],
      trustedAuthorLogin: 'bugbot',
      findings: [{ id: 'finding', state: 'open' }],
    });

    expect(result).toEqual([expect.objectContaining({
      review: expect.objectContaining({ identity: 'unknown' }),
      findings: [],
    })]);
  });

  it('requires both identities and compares them case-insensitively', () => {
    expect(isTrustedBugbotAuthor(undefined, 'bugbot')).toBe(false);
    expect(isTrustedBugbotAuthor('bugbot', undefined)).toBe(false);
    expect(isTrustedBugbotAuthor('attacker', 'bugbot')).toBe(false);
    expect(isTrustedBugbotAuthor('BUGBOT', 'bugbot')).toBe(true);
  });
});
