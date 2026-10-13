import { initialSddStatus, projectSddStatus, formatSddStatus } from '../sdd_status_policy';
import type { SddEvidenceQueryContext } from '../../ports/sdd_evidence_read_ports';
import { resolveStaticPublicationCatalog } from '../publication_message_catalog';

const sha = 'a'.repeat(40);
const context: SddEvidenceQueryContext = { issueNumber: 42, admittedKind: 'feature', issueManagedBranches: true, preBranchSdd: true, issueAuthor: 'author', trustedBotLogin: 'vypbot' };
const verified = { path: 'specs/feature.md', capabilityId: 'feature', branchName: 'feature/42', branchHeadSha: sha, firstSha: sha, currentSha: sha };
const identity = { owner: 'acme', repository: 'demo' };
const issueUrl = 'https://github.com/acme/demo/issues/42';
const render = (readiness: ReturnType<typeof projectSddStatus>, url = issueUrl) => formatSddStatus(readiness, resolveStaticPublicationCatalog('en-US').catalog, url, 42, identity).join('\n');

describe('SDD status projection and safe navigation', () => {
    it.each([
        ['admitted feature', {}, ['in-progress'], true],
        ['contract change', { admittedKind: 'bugfix' }, ['in-progress', 'contract-change'], true],
        ['output label alone', { admittedKind: 'bugfix' }, ['in-progress', 'SDD'], false],
        ['unstarted feature', {}, ['feature'], false],
        ['help', { admittedKind: 'help' }, ['in-progress', 'contract-change'], false],
        ['disabled gate', { preBranchSdd: false }, ['in-progress'], false],
        ['unknown configuration', { preBranchSdd: undefined }, ['in-progress'], null],
        ['invalid configuration', { issueManagedBranches: false }, ['in-progress'], null],
    ] as const)('uses canonical requirement for %s', (_name, override, labels, required) => {
        expect(initialSddStatus({ ...context, ...override }, labels)).toEqual({ required, state: required === false ? 'not-required' : 'unavailable' });
    });

    it.each([
        ['not-required', 'not-required'], ['absent', 'unavailable'], ['unavailable', 'unavailable'],
        ['invalid', 'unverified'], ['stale', 'revision-pending'], ['awaiting-answers', 'revision-pending'],
        ['publication-pending', 'revision-pending'], ['published', 'ready'],
    ] as const)('projects %s with no historical SHA mistaken for readiness', (state, expected) => {
        const status = projectSddStatus({ state, path: verified.path, verified, pendingQuestionIds: ['Q1'], cardId: 7 }, { state: 'unavailable', required: true });
        expect(status.state).toBe(expected);
        expect(status.commitSha).toBe(state === 'published' ? sha : undefined);
        expect(status.path).toBe(['not-required', 'unavailable', 'unverified'].includes(expected) ? undefined : verified.path);
        expect(Object.isFrozen(status)).toBe(true);
    });

    it.each(['awaiting-answers', 'publication-pending'] as const)('retains only immutable first-publication history while %s', state => {
        const status = projectSddStatus({ state, path: verified.path, verified: { ...verified, currentSha: undefined }, pendingQuestionIds: ['Q1'] });
        expect(status).toMatchObject({ state: 'revision-pending', firstCommitSha: sha, pendingQuestionIds: ['Q1'] });
        expect(status.commitSha).toBeUndefined();
    });
    it.each(['no proof', 'wrong path', 'abbreviated SHA'])('does not invent revision history with %s', scenario => {
        const proof = scenario === 'no proof' ? undefined : { ...verified,
            path: scenario === 'wrong path' ? 'specs/foreign.md' : verified.path,
            firstSha: scenario === 'abbreviated SHA' ? 'abc123' : sha };
        const status = projectSddStatus({ state: 'publication-pending', path: verified.path, verified: proof });
        expect(status.state).toBe('publication-pending'); expect(status.firstCommitSha).toBeUndefined();
        expect(render(status)).not.toContain('/blob/');
    });
    it.each(['en-US', 'es-ES'])('labels pending revision evidence as history in %s without certifying readiness', locale => {
        const status = projectSddStatus({ state: 'awaiting-answers', path: verified.path,
            verified: { ...verified, currentSha: undefined }, pendingQuestionIds: ['Q1'], cardId: 7 });
        const body = formatSddStatus(status, resolveStaticPublicationCatalog(locale).catalog, issueUrl, 42, identity).join('\n');
        expect(body).toContain(locale === 'es-ES' ? 'Revisión pendiente' : 'Revision pending');
        expect(body).toContain(locale === 'es-ES' ? '(histórica)' : '(history)');
        expect(body).toContain(`/blob/${sha}/${verified.path}`); expect(body).toContain('Q1');
        expect(body).not.toContain(locale === 'es-ES' ? '**Publicación verificada:**' : '**Verified publication:**');
        expect(body).not.toContain(locale === 'es-ES' ? 'Continúa la implementación' : 'Continue implementation');
    });
    it.each(['missing path', 'missing SHA', 'short SHA'])('withholds malformed revision projection: %s', scenario => {
        const body = render({ state: 'revision-pending', required: true,
            path: scenario === 'missing path' ? undefined : verified.path,
            firstCommitSha: scenario === 'missing SHA' ? undefined : scenario === 'short SHA' ? 'abc123' : sha });
        expect(body).not.toContain('/blob/'); expect(body).not.toContain('(history)');
        expect(body).toContain('readiness is unverified');
    });
    it('offers publication recovery after revision answers are complete', () => {
        const body = render(projectSddStatus({ state: 'publication-pending', path: verified.path, verified }));
        expect(body).toContain('Resume SDD preparation'); expect(body).not.toContain('Answer these questions');
    });
    it('retains the historical SHA without a link when the issue URL is foreign', () => {
        const body = render(projectSddStatus({ state: 'awaiting-answers', path: verified.path, verified }), 'https://attacker.example/acme/demo/issues/42');
        expect(body).toContain(sha); expect(body).toContain('(history)'); expect(body).not.toContain('](');
    });
    it('rejects matching-path revision metadata with a missing first SHA', () => {
        const incomplete = { ...verified, firstSha: undefined } as unknown as typeof verified;
        const status = projectSddStatus({ state: 'publication-pending', path: verified.path, verified: incomplete });
        expect(status.state).toBe('publication-pending'); expect(status.firstCommitSha).toBeUndefined();
        expect(render(status)).not.toContain('/blob/');
    });
    it('does not certify a published record that only retains the first SHA', () => {
        const status = projectSddStatus({ state: 'published', path: verified.path, verified: { ...verified, currentSha: undefined } });
        expect(status.state).toBe('unverified'); expect(status.commitSha).toBeUndefined();
        expect(render(status)).not.toContain('/blob/');
    });
    it('keeps the requirement unknown when unavailable evidence has no admitted initial state', () => {
        const status = projectSddStatus({ state: 'unavailable' });
        expect(status).toEqual({ state: 'unavailable', required: null });
        expect(render(status)).toContain('Requirement unavailable');
    });
    it.each(['en-US', 'es-ES'])('retains the immutable first publication alongside a verified revision in %s', locale => {
        const current = 'b'.repeat(40);
        const status = projectSddStatus({ state: 'published', path: verified.path, verified: { ...verified, currentSha: current } });
        expect(status).toMatchObject({ state: 'ready', commitSha: current, firstCommitSha: sha });
        const body = formatSddStatus(status, resolveStaticPublicationCatalog(locale).catalog, issueUrl, 42, identity).join('\n');
        expect(body).toContain(`/blob/${current}/${verified.path}`); expect(body).toContain(`/blob/${sha}/${verified.path}`);
        expect(body).toContain(locale === 'es-ES' ? '(histórica)' : '(history)');
    });
    it('does not duplicate the first publication when it is also the current verified commit', () => {
        const status = projectSddStatus({ state: 'published', path: verified.path, verified });
        expect(status.firstCommitSha).toBe(sha);
        const body = render(status); expect(body.match(/\/blob\//gu)).toHaveLength(1); expect(body).not.toContain('(history)');
    });
    it('keeps a verified current revision visible without echoing a malformed historical SHA', () => {
        const body = render({ state: 'ready', required: true, path: verified.path, commitSha: sha, firstCommitSha: 'PRIVATE-CREDENTIAL' });
        expect(body).toContain(`/blob/${sha}/${verified.path}`); expect(body).not.toContain('PRIVATE-'); expect(body).not.toContain('(history)');
    });
    it.each(['en-US', 'es-ES'])('retains only verified publication history after a stable issue edit in %s', locale => {
        const status = projectSddStatus({ state: 'stale', verified: { ...verified, currentSha: 'b'.repeat(40) } });
        expect(status).toMatchObject({ state: 'revision-pending', firstCommitSha: sha, path: verified.path }); expect(status.commitSha).toBeUndefined();
        const body = formatSddStatus(status, resolveStaticPublicationCatalog(locale).catalog, issueUrl, 42, identity).join('\n');
        expect(body).toContain(`/blob/${sha}/${verified.path}`); expect(body).not.toContain(`/blob/${'b'.repeat(40)}/`);
        expect(body).toContain(locale === 'es-ES' ? 'Revisión pendiente' : 'Revision pending');
    });
    it('does not revive history after a stale result loses publication proof at its final fence', () => {
        const status = projectSddStatus({ state: 'stale' });
        expect(status).toEqual({ state: 'unverified', required: true }); expect(render(status)).not.toContain('/blob/');
    });
    it('does not substitute a mismatched path to restore stale publication history', () => {
        const status = projectSddStatus({ state: 'stale', path: 'specs/foreign.md', verified });
        expect(status.state).toBe('unverified'); expect(status.firstCommitSha).toBeUndefined(); expect(render(status)).not.toContain('/blob/');
    });

    it.each(['no proof', 'wrong path', 'abbreviated SHA'])('rejects a published projection with %s', scenario => {
        const proof = scenario === 'no proof' ? undefined : { ...verified, path: scenario === 'wrong path' ? 'specs/foreign.md' : verified.path, currentSha: scenario === 'abbreviated SHA' ? 'abc123' : sha };
        const status = projectSddStatus({ state: 'published', path: verified.path, verified: proof });
        expect(status.state).toBe('unverified'); expect(status.commitSha).toBeUndefined();
        expect(render(status)).not.toContain('/blob/');
    });

    it.each([
        'http://github.com/acme/demo/issues/42', 'https://github.com/foreign/demo/issues/42',
        'https://github.com/acme/foreign/issues/42', 'https://github.com/acme/demo/issues/43',
        'https://attacker.example/acme/demo/issues/42', 'https://github.com.attacker.example/acme/demo/issues/42',
        'https://github.com:444/acme/demo/issues/42', 'https://user:secret@github.com/acme/demo/issues/42', 'https://github.com/acme/demo/issues/42?token=secret', 'broken',
    ])('omits all evidence links for an invalid issue identity %s', url => {
        const status = projectSddStatus({ state: 'published', path: verified.path, verified, cardId: 7 });
        const body = render(status, url);
        expect(body).not.toContain(']('); expect(body).not.toContain('secret'); expect(body).toContain(sha);
    });

    it('bounds pending identifiers without disclosing question text and links verified evidence to its own issue', () => {
        const pending = projectSddStatus({ state: 'awaiting-answers', path: verified.path, pendingQuestionIds: ['Q1', 'Q1', 'Q9', 'TOKEN=secret'], cardId: 7 });
        expect(Object.isFrozen(pending.pendingQuestionIds)).toBe(true);
        const body = render(pending);
        expect(body).toContain('**Pending questions:** Q1'); expect(body).not.toMatch(/Q9|TOKEN|secret/u);
        expect(body).toContain(issueUrl + '#issuecomment-7');
        const ready = render(projectSddStatus({ state: 'published', path: verified.path, verified }));
        expect(ready).toContain('https://github.com/acme/demo/blob/' + sha + '/' + verified.path);
    });

    it.each(['en-US', 'es-ES'])('renders all six closed states using the bundled %s catalog', locale => {
        const catalog = resolveStaticPublicationCatalog(locale).catalog;
        for (const state of ['not-required', 'unavailable', 'unverified', 'awaiting-answers', 'publication-pending', 'ready'] as const) {
            const body = formatSddStatus({ state, required: state !== 'not-required', path: verified.path, commitSha: sha, pendingQuestionIds: ['Q1'] }, catalog).join('\n');
            expect(body).not.toMatch(/interaction\.status|undefined|TOKEN/u);
            expect(body).toContain(locale === 'es-ES' ? 'Preparación del SDD' : 'SDD readiness');
        }
    });
});

 describe('trusted GitHub server navigation', () => {
    it('retains GitHub Enterprise links only for the independently configured origin', () => {
        const status = projectSddStatus({ state: 'published', path: verified.path, verified, cardId: 7 });
        const body = formatSddStatus(status, resolveStaticPublicationCatalog('en-US').catalog, 'https://github.example/acme/demo/issues/42', 42, { ...identity, serverOrigin: 'https://github.example' }).join('\n');
        expect(body).toContain(`https://github.example/acme/demo/blob/${sha}/specs/feature.md`);
        expect(body).toContain('https://github.example/acme/demo/issues/42#issuecomment-7');
    });
    it('omits links when the trusted server configuration has credentials', () => {
        const status = projectSddStatus({ state: 'published', path: verified.path, verified, cardId: 7 });
        const body = formatSddStatus(status, resolveStaticPublicationCatalog('en-US').catalog, issueUrl, 42, { ...identity, serverOrigin: 'https://user:secret@github.com' }).join('\n');
        expect(body).not.toContain('](');
        expect(body).not.toContain('secret');
        expect(body).toContain(sha);
    });
});

describe('closed SDD guidance', () => {
    it.each(['en-US', 'es-ES'])('retains evidence but suppresses implementation and old-question actions in %s', locale => {
        const catalog = resolveStaticPublicationCatalog(locale).catalog;
        for (const state of ['published', 'awaiting-answers'] as const) {
            const status = projectSddStatus({ state, historical: true, path: verified.path, verified, pendingQuestionIds: ['Q1'], cardId: 7 });
            const body = formatSddStatus(status, catalog, issueUrl, 42, identity).join('\n');
            expect(body).toContain(locale === 'es-ES' ? 'evidencia histórica de una issue cerrada' : 'historical evidence for a closed issue');
            expect(body).toContain(sha); expect(body).not.toContain('Q1');
            expect(body).not.toContain(locale === 'es-ES' ? 'Continúa la implementación' : 'Continue implementation');
            expect(body).not.toContain(locale === 'es-ES' ? 'Responde' : 'Answer these questions');
        }
    });
});
