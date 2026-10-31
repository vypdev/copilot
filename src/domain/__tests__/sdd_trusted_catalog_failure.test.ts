import { SddTrustedCatalogMissingFailure } from '../sdd_trusted_catalog_failure';

describe('closed missing trusted catalog fact', () => {
  it('retains only immutable provenance and fixed prerequisite copy', () => {
    const error = new SddTrustedCatalogMissingFailure('a'.repeat(40));
    expect(error.sourceCommit).toBe('a'.repeat(40));
    expect(error.message).toBe('The trusted source does not contain specs/catalog.json.');
    expect(Object.isFrozen(error)).toBe(true);
  });
  it('normalizes the same hexadecimal source identity', () => {
    expect(new SddTrustedCatalogMissingFailure('AB'.repeat(20)).sourceCommit).toBe('ab'.repeat(20));
  });
  it.each(['a'.repeat(40) + '\n', 'g' + 'a'.repeat(39)])('rejects malformed provenance %p', source => {
    expect(() => new SddTrustedCatalogMissingFailure(source)).toThrow(TypeError);
  });
  it('rejects absent provenance', () => {
    expect(() => new SddTrustedCatalogMissingFailure(undefined as never)).toThrow(TypeError);
  });
  it('does not coerce an object into trusted provenance', () => {
    const toString = jest.fn(() => 'a'.repeat(40));
    expect(() => new SddTrustedCatalogMissingFailure({ toString } as never)).toThrow(TypeError);
    expect(toString).not.toHaveBeenCalled();
  });
});
