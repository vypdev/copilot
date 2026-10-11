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
        ['invalid', 'unverified'], ['stale', 'unverified'], ['awaiting-answers', 'awaiting-answers'],
        ['publication-pending', 'publication-pending'], ['published', 'ready'],
    ] as const)('projects %s with no historical SHA mistaken for readiness', (state, expected) => {
        const status = projectSddStatus({ state, path: verified.path, verified, pendingQuestionIds: ['Q1'], cardId: 7 }, { state: 'unavailable', required: true });
        expect(status.state).toBe(expected);
        expect(status.commitSha).toBe(state === 'published' ? sha : undefined);
        expect(status.path).toBe(['not-required', 'unavailable', 'unverified'].includes(expected) ? undefined : verified.path);
        expect(Object.isFrozen(status)).toBe(true);
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
