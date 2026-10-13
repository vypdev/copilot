import { renderSddDiff, type SddDiffSnapshot } from '../sdd_diff_presentation_policy';
import { resolveSddDiffCatalog, SDD_DIFF_MESSAGE_IDS, ENGLISH_SDD_DIFF_DEFINITION, SPANISH_SDD_DIFF_DEFINITION } from '../sdd_diff_message_catalog';
const first = 'a'.repeat(40), current = 'b'.repeat(40);
const publication = { path: 'specs/owning-sdd.md', firstSha: first, currentSha: current };
const scope = { serverOrigin: 'https://github.example.test', owner: 'org', repository: 'repo' };
const compared: SddDiffSnapshot = { state: 'compared', publication,
  changes: { state: 'compared', addedLines: 0, removedLines: 0, sections: [], omittedSections: 0 } };
const snapshots: readonly SddDiffSnapshot[] = [
  ...(['not-applicable', 'no-publication', 'invalid', 'unavailable', 'ambiguous'] as const).map(state => ({ state })),
  { state: 'initial-only', publication }, { state: 'stale', publication }, { state: 'pending-revision', publication },
  { state: 'bounded', publication, reason: 'lines' }, compared,
];
const render = (value: SddDiffSnapshot, locale = 'en-US') => renderSddDiff(value, scope, resolveSddDiffCatalog(locale));
describe('bounded bilingual structural SDD reply', () => {
  it.each(['en-US','es-ES'].flatMap(locale => (['stale','pending-revision'] as const).map(state => ({ locale, state }))))('retains the verified published revision as historical in $state / $locale', ({ locale, state }) => {
    const body = render({ state, publication }, locale); const catalog = resolveSddDiffCatalog(locale);
    expect(body).toContain(locale === 'es-ES' ? 'Revisión publicada histórica' : 'Historical published revision');
    expect(body).toContain(`/blob/${current}/specs/owning-sdd.md`); expect(body).toContain(`/commit/${current}`);
    expect(body).not.toContain('/compare/'); expect(body).not.toContain(catalog.message('sddDiff.current'));
  });
  it('retains only first history when no verified revision exists', () => {
    const body = render({ state: 'stale', publication: { path: publication.path, firstSha: first } });
    expect(body).toContain(`/blob/${first}/`); expect(body).not.toContain('Historical published revision');
  });
  it('does not duplicate the same historical publication', () => {
    const body = render({ state: 'stale', publication: { ...publication, currentSha: first } });
    expect(body.split(`/blob/${first}/`).length - 1).toBe(1); expect(body).not.toContain('Historical published revision');
  });
  it('rejects malformed historical revision proof without partial links', () => {
    const body = render({ state: 'pending-revision', publication: { ...publication, currentSha: 'abc' } });
    expect(body).toContain('could not be verified'); expect(body).not.toContain('/blob/');
  });

  it.each(snapshots.flatMap(snapshot => ['en-US', 'es-ES'].map(locale => ({ snapshot, locale }))))('renders $snapshot.state in $locale without inventing counts or comparison links', ({ snapshot, locale }) => {
    const catalog = resolveSddDiffCatalog(locale), body = render(snapshot, locale);
    expect(body).toContain(catalog.message(`sddDiff.${snapshot.state}`));
    expect(body).toContain(catalog.message('sddDiff.action'));
    expect(body.length).toBeLessThanOrEqual(5600);
    if (snapshot.state === 'compared') expect(body).toContain(catalog.message('sddDiff.lines', { added: 0, removed: 0 }));
    else expect(body).not.toContain(catalog.message('sddDiff.lines', { added: 0, removed: 0 }));
    if (snapshot.state === 'stale' || snapshot.state === 'pending-revision') {
      expect(body).toContain(catalog.message('sddDiff.historical'));
      expect(body).toContain(`/blob/${first}/specs/owning-sdd.md`);
      expect(body).toContain(current);
      expect(body).toContain(catalog.message('sddDiff.historicalCurrent'));
    }
    if (snapshot.state === 'compared' || snapshot.state === 'bounded') expect(body).toContain(`/blob/${current}/specs/owning-sdd.md`);
    if (snapshot.state === 'bounded') expect(body).toContain(catalog.message('sddDiff.linesLimit'));
    if (snapshot.state === 'initial-only') expect(body).not.toContain(current);
  });
  it('constructs links at the bound enterprise origin rather than github.com or supplied heading URLs', () => {
    expect(render(compared)).toContain(`https://github.example.test/org/repo/blob/${current}/specs/owning-sdd.md`);
    expect(render(compared)).not.toContain('github.com');
  });
  it('falls back atomically to English for an unsupported locale without a model', () => {
    expect(render(compared, 'fr-FR')).toBe(render(compared, 'en-US'));
  });
  it('provides complete matching English and Spanish message inventories', () => {
    for (const catalog of [ENGLISH_SDD_DIFF_DEFINITION, SPANISH_SDD_DIFF_DEFINITION]) {
      expect(Object.keys(catalog.messages).sort()).toEqual([...SDD_DIFF_MESSAGE_IDS].sort());
      expect(SDD_DIFF_MESSAGE_IDS.every(id => typeof catalog.messages[id] === 'string')).toBe(true);
    }
  });
  it('escapes section Markdown, mentions and controls without exposing document excerpts', () => {
    const body = render({ ...compared, changes: { state: 'compared', addedLines: 1, removedLines: 1,
      sections: ['[click](javascript:alert(1)) @all <script> `code` |\u202e'], omittedSections: 0 } });
    expect(body).not.toContain('[click]('); expect(body).not.toContain('<script>'); expect(body).not.toContain('@all');
    expect(body).not.toContain('\u202e'); expect(body).toContain('@\u200ball');
    expect(body).not.toContain('\n+');
  });
  it('discloses omitted titles while keeping exactly eight selected titles', () => {
    const sections = Array.from({ length: 8 }, (_, i) => `Section ${i}`);
    const body = render({ ...compared, changes: { state: 'compared', addedLines: 9, removedLines: 9, sections, omittedSections: 2 } });
    expect(body).toContain('Additional changed titles omitted: 2.');
    expect((body.match(/^- Section /gmu) ?? [])).toHaveLength(8);
  });
  it.each(['http://github.example.test', 'javascript:bad', 'https://user:secret@github.example.test', 'https://github.example.test/path',
    'https://github.example.test?credential=private', 'https://github.example.test#private', 'not a URL', `https://${'x'.repeat(201)}`])('rejects unsafe or unbounded origin %s without echoing it', serverOrigin => {
    const body = renderSddDiff(compared, { ...scope, serverOrigin }, resolveSddDiffCatalog('en-US'));
    expect(body).toContain('could not be verified'); expect(body).not.toContain(first); expect(body).not.toContain(serverOrigin);
  });
  it.each([{ owner: '..' }, { repository: '.' }, { owner: 'org/foreign' }, { repository: 'repo\nprivate' }])('rejects substituted repository scope %j', substituted => {
    const body = renderSddDiff(compared, { ...scope, ...substituted }, resolveSddDiffCatalog('en-US'));
    expect(body).toContain('could not be verified'); expect(body).not.toContain('/blob/');
  });
  it.each(['../private.md', '.github/workflows/ci.yml'])('rejects uncatalogued navigation path %s', path => {
    const body = render({ state: 'initial-only', publication: { ...publication, path } });
    expect(body).toContain('could not be verified'); expect(body).not.toContain(path);
  });
  it.each(['firstSha', 'currentSha'] as const)('rejects malformed %s without rendering another valid publication', key => {
    const body = render({ ...compared, publication: { ...publication, [key]: 'private-unverified' } });
    expect(body).toContain('could not be verified'); expect(body).not.toContain('/blob/'); expect(body).not.toContain('private-unverified');
  });
  it.each([{ addedLines: -1 }, { removedLines: 2001 }, { addedLines: 1.5 }, { omittedSections: 4001 },
    { sections: Array.from({ length: 9 }, () => 'title') }, { sections: ['x'.repeat(121)] }])('rejects malformed comparison projection %j', changed => {
    const body = render({ ...compared, changes: { ...compared.changes, ...changed } });
    expect(body).toContain('could not be verified'); expect(body).not.toContain('/blob/');
  });
  it('rejects an unknown limit reason without reflecting it', () => {
    const body = render({ state: 'bounded', publication, reason: 'private-cause' as 'lines' });
    expect(body).toContain('could not be verified'); expect(body).not.toContain('private-cause');
  });
  it('uses a complete unavailable reply when safe navigation would exceed the reply budget', () => {
    const body = render({ ...compared, publication: { ...publication, path: `specs/${'x'.repeat(5500)}.md` } });
    expect(body).toContain('could not be verified'); expect(body).not.toContain('/blob/'); expect(body.length).toBeLessThanOrEqual(5600);
  });
});


describe('required publication evidence is never invented', () => {
  it.each(['initial-only', 'compared', 'bounded'])('withholds %s claims when a malformed projection omits publication proof', state => {
    const body = render({ state } as SddDiffSnapshot);
    expect(body).toContain('could not be verified');
    expect(body).not.toContain('/blob/');
    expect(body).not.toContain('Added lines:');
  });
});


describe('verified publication and clarification navigation', () => {
  it('links both immutable publication commits and an explicitly labelled commit comparison', () => {
    const body = render(compared);
    expect(body).toContain(`/commit/${first})`);
    expect(body).toContain(`/commit/${current})`);
    expect(body).toContain(`[Compare publication commits](https://github.example.test/org/repo/compare/${first}...${current})`);
  });
  it.each(['stale', 'pending-revision'] as const)('links the owning clarification card for %s without current comparison', state => {
    const body = render({ state, publication, card: { issueNumber: 454, commentId: 6101 } }, 'es-ES');
    expect(body).toContain('[Tarjeta de aclaraciones del SDD](https://github.example.test/org/repo/issues/454#issuecomment-6101)');
    expect(body).toContain(`/commit/${current}`);
    expect(body).not.toContain('/compare/');
  });
  it.each([{ issueNumber: 0, commentId: 10 }, { issueNumber: 454, commentId: -1 },
    { issueNumber: 1.5, commentId: 10 }, { issueNumber: 454, commentId: Number.MAX_SAFE_INTEGER + 1 }])('withholds unsafe card navigation %j', card => {
    const body = render({ state: 'stale', publication, card });
    expect(body).toContain('could not be verified');
    expect(body).not.toContain('#issuecomment-');
    expect(body).not.toContain('/blob/');
  });
  it('keeps current verified output independent of an irrelevant historical card projection', () => {
    expect(render({ ...compared, card: { issueNumber: 0, commentId: 0 } })).toBe(render(compared));
  });
});
