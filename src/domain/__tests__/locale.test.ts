import {
  DEFAULT_REPOSITORY_LOCALE,
  InvalidLocaleTagError,
  baseLanguage,
  canonicalizeLocaleTag,
  isLocaleProfile,
  localeForScope,
  localeLanguagesMatch,
  resolveLocaleProfile,
} from '../locale';

describe('locale policy', () => {
  it.each([
    ['en-us', 'en-US'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['es', 'es'],
    [' ar ', 'ar'],
  ])('canonicalizes %s as %s', (input, expected) => {
    expect(canonicalizeLocaleTag(input)).toBe(expected);
  });

  it.each(['', ' ', 'not a locale', 'und', 'und-Latn', 'x-private', 'a'.repeat(256)])(
    'rejects invalid or unsafe tag %p',
    (input) => expect(() => canonicalizeLocaleTag(input)).toThrow(InvalidLocaleTagError),
  );

  it('rejects underscore separators instead of converting an alternate locale shape', () => {
    expect(() => canonicalizeLocaleTag('pt_BR')).toThrow(InvalidLocaleTagError);
    expect(() => resolveLocaleProfile('en-US', 'es_MX')).toThrow(InvalidLocaleTagError);
  });

  it.each(['en-US\u0000', 'en-\nUS', 'en\u007f-US'])(
    'rejects control characters in %p before Intl processing',
    (input) => expect(() => canonicalizeLocaleTag(input)).toThrow(InvalidLocaleTagError),
  );

  it('fails closed if the platform canonicalizer yields no locale', () => {
    const canonicalizer = jest.spyOn(Intl, 'getCanonicalLocales').mockReturnValue([]);
    try {
      expect(() => canonicalizeLocaleTag('en-US')).toThrow(InvalidLocaleTagError);
    } finally {
      canonicalizer.mockRestore();
    }
  });

  it('rejects non-string repository and override values at the domain boundary', () => {
    expect(() => canonicalizeLocaleTag(42)).toThrow(InvalidLocaleTagError);
    expect(() => resolveLocaleProfile('en-US', {})).toThrow(InvalidLocaleTagError);
  });

  it('defaults the repository to English and lets empty surfaces inherit it', () => {
    expect(resolveLocaleProfile('', '', '')).toEqual({
      repository: DEFAULT_REPOSITORY_LOCALE,
      issue: DEFAULT_REPOSITORY_LOCALE,
      pullRequest: DEFAULT_REPOSITORY_LOCALE,
    });
  });

  it('uses inherited defaults when surface arguments are omitted', () => {
    expect(resolveLocaleProfile('en-US')).toEqual({
      repository: 'en-US',
      issue: 'en-US',
      pullRequest: 'en-US',
    });
  });

  it('resolves independent issue and pull-request overrides', () => {
    const profile = resolveLocaleProfile('fr-fr', 'es-mx', 'zh-Hant-TW');
    expect(profile).toEqual({
      repository: 'fr-FR',
      issue: 'es-MX',
      pullRequest: 'zh-Hant-TW',
      issueOverride: 'es-MX',
      pullRequestOverride: 'zh-Hant-TW',
    });
    expect(localeForScope(profile, 'repository')).toBe('fr-FR');
    expect(localeForScope(profile, 'issue')).toBe('es-MX');
    expect(localeForScope(profile, 'pull-request')).toBe('zh-Hant-TW');
  });

  it('treats null and whitespace-only overrides as inheritance', () => {
    expect(resolveLocaleProfile('de-DE', null, '   ')).toEqual({
      repository: 'de-DE',
      issue: 'de-DE',
      pullRequest: 'de-DE',
    });
  });

  it('compares canonical base languages without conflating different languages', () => {
    expect(localeLanguagesMatch('es-ES', 'es-MX')).toBe(true);
    expect(localeLanguagesMatch('en-US', 'en-GB')).toBe(true);
    expect(localeLanguagesMatch('es', 'en')).toBe(false);
    expect(baseLanguage('zh-Hant-TW')).toBe('zh');
  });

  it('accepts only canonical, internally consistent locale profiles', () => {
    expect(isLocaleProfile(resolveLocaleProfile('fr-fr', 'es-mx', 'zh-Hant-TW'))).toBe(true);
    expect(isLocaleProfile({ repository: 'en-US', issue: 'es-ES', pullRequest: 'en-US' })).toBe(false);
    expect(isLocaleProfile({ repository: 'en-us', issue: 'en-US', pullRequest: 'en-US' })).toBe(false);
    expect(isLocaleProfile({ repository: 'en-US', issue: 'en-US', pullRequest: 'en-US', issueOverride: '' })).toBe(false);
    expect(isLocaleProfile({ repository: 'not a locale', issue: 'en-US', pullRequest: 'en-US' })).toBe(false);
    expect(isLocaleProfile(null)).toBe(false);
  });
});
