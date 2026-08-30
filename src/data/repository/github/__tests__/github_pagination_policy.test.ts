import { requireArrayPage } from '../github_pagination_policy';

describe('requireArrayPage', () => {
  it('returns an array page unchanged', () => {
    const page = [{ id: 1 }];
    expect(requireArrayPage(page, 'items')).toBe(page);
  });

  it('rejects an absent page with a boundary error', () => {
    expect(() => requireArrayPage(undefined, 'items'))
      .toThrow('GitHub items response did not contain an array page.');
  });

  it('rejects object-shaped response data', () => {
    expect(() => requireArrayPage({ items: [] }, 'items'))
      .toThrow('GitHub items response did not contain an array page.');
  });
});
