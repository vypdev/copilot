import { formatGithubRuntimeDoctor, isGithubRuntimeDoctorProjection } from '../github_runtime_doctor_presentation_policy';
import { aggregateGithubRuntimeDoctorReport, GITHUB_RUNTIME_DOCTOR_GROUPS } from '../../../domain/github_runtime_doctor';
import { Result } from '../../../data/model/result';
import { renderSemanticReply, selectSemanticReplyIntents } from '../semantic_result_publication_policy';
const projection = () => ({ report: aggregateGithubRuntimeDoctorReport({ target: { kind: 'issue', repositoryId: 42, issueNumber: 7 },
    checks: GITHUB_RUNTIME_DOCTOR_GROUPS.map(group => ({ group, state: 'pass' as const })) }),
    owner: 'o', repository: 'r', revision: 'a'.repeat(40), serverOrigin: 'https://github.com' });
describe('runtime doctor public presentation', () => {
    it.each(['pass', 'warning', 'blocked', 'unavailable', 'not-applicable'] as const)('renders textual %s state with exactly one primary action', state => {
        const value = projection(); const report = aggregateGithubRuntimeDoctorReport({ target: value.report.target,
            checks: GITHUB_RUNTIME_DOCTOR_GROUPS.map(group => ({ group, state })) });
        const body = formatGithubRuntimeDoctor({ ...value, report });
        expect(body.match(/Next action:/gu)).toHaveLength(1); expect(body.match(/^- /gmu)).toHaveLength(7);
        expect(body.length).toBeLessThan(6000); expect(body).toContain('do not prove');
    });
    it('renders all labels and one primary action in Spanish', () => {
        const body = formatGithubRuntimeDoctor(projection(), 'es-ES'); expect(body).toContain('Diagnóstico del runtime');
        expect(body).toContain('Siguiente acción'); expect(body).not.toContain('Next action'); expect(body).toContain('solo lee evidencias');
    });
    it('falls back atomically for unsupported locales', () => {
        expect(formatGithubRuntimeDoctor(projection(), 'fr-FR')).toEqual(formatGithubRuntimeDoctor(projection(), 'en-US'));
    });
    it.each(['https://github.com/?token=SECRET', 'https://user:SECRET@github.com', 'javascript:SECRET', 'https://github.com/prefix'])('suppresses unsafe configured link %s', serverOrigin => {
        const body = formatGithubRuntimeDoctor({ ...projection(), serverOrigin }); expect(body).not.toContain('SECRET'); expect(body).not.toContain('](');
    });
    it('accepts independently configured enterprise origin', () => {
        expect(formatGithubRuntimeDoctor({ ...projection(), serverOrigin: 'https://github.enterprise.test' })).toContain('https://github.enterprise.test/o/r/tree/');
    });
    it('suppresses unsafe repository identity rather than emitting Markdown or mentions', () => {
        const body = formatGithubRuntimeDoctor({ ...projection(), owner: '@all](SECRET)<script>' }); expect(body).not.toContain('SECRET'); expect(body).not.toContain('@all');
    });
    it('does not echo provider evidence strings, links or raw steps', () => {
        const value = projection(); const report = { ...value.report, checks: value.report.checks.map(check => ({ ...check, evidence: { source: '@all SECRET', url: 'javascript:SECRET' } })) };
        const body = formatGithubRuntimeDoctor({ ...value, report }); expect(body).not.toContain('SECRET'); expect(body).not.toContain('@all');
    });
    it('keeps missing authoritative target evidence readable and unavailable', () => {
        const body = formatGithubRuntimeDoctor({}); expect(body).toContain('Unavailable'); expect(body.match(/^- /gmu)).toHaveLength(7);
    });
    it('rejects duplicated or malformed check groups at the semantic publication boundary', () => {
        const value = projection(); expect(isGithubRuntimeDoctorProjection({ ...value, report: { ...value.report, checks: [value.report.checks[0]] } })).toBe(false);
        expect(isGithubRuntimeDoctorProjection({ ...value, report: { ...value.report, target: { kind: 'issue', repositoryId: -1, issueNumber: 7 } } })).toBe(false);
    });
    it('rejects unrecognized action text instead of publishing provider prose', () => {
        expect(isGithubRuntimeDoctorProjection({ ...projection(), report: { ...projection().report, primaryAction: '@all SECRET' } })).toBe(false);
    });
    it('reuses exact semantic reply identity for the same delivery and creates a new identity for a new request', () => {
        const results = [new Result({ id: 'IssueCommentUseCase.Doctor', success: true, executed: true,
            payload: { doctor: projection() }, steps: ['SECRET'] })];
        const context = { results, locale: 'es-ES', target: { kind: 'issue' as const, number: 7 }, correlationId: 'comment:42' };
        const [first] = selectSemanticReplyIntents(context); expect(selectSemanticReplyIntents(context)).toEqual([first]);
        expect(first.messageKey).toBe('copilot-doctor'); expect(renderSemanticReply(first)).not.toContain('SECRET');
        expect(selectSemanticReplyIntents({ ...context, correlationId: 'comment:43' })).not.toEqual([first]);
    });
    it('keeps the exact conversation target in reply correlation', () => {
        const results = [new Result({ id: 'IssueCommentUseCase.Doctor', success: true, executed: true, payload: { doctor: projection() } })];
        const issue = selectSemanticReplyIntents({ results, locale: 'en-US', target: { kind: 'issue', number: 7 }, correlationId: 'comment:42' });
        const pr = selectSemanticReplyIntents({ results, locale: 'en-US', target: { kind: 'pull-request', number: 7 }, correlationId: 'comment:42' });
        expect(issue).not.toEqual(pr);
    });
});

describe('entity and immutable-revision source captions', () => {
    it.each(['en-US', 'es-ES'].flatMap(locale => ['issue', 'pull-request'].map(kind => [locale, kind])))('names %s / %s links for their actual destination', (locale, kind) => {
        const value = projection();
        const target = kind === 'issue' ? value.report.target : { kind: 'pull-request' as const, repositoryId: 42, pullNumber: 11 };
        const report = aggregateGithubRuntimeDoctorReport({ target, checks: value.report.checks });
        const body = formatGithubRuntimeDoctor({ ...value, report }, locale);
        const caption = locale === 'es-ES' ? kind === 'issue' ? 'Issue inspeccionada' : 'PR inspeccionado' : kind === 'issue' ? 'Inspected issue' : 'Inspected pull request';
        const url = kind === 'issue' ? 'https://github.com/o/r/issues/7' : 'https://github.com/o/r/pull/11';
        expect(body).toContain(`[${caption}](${url})`);
        const revisionCaption = locale === 'es-ES' ? 'Revisión inspeccionada del repositorio' : 'Inspected repository revision';
        expect(body).toContain(`[${revisionCaption}](https://github.com/o/r/tree/${'a'.repeat(40)})`);
        expect(body).not.toContain(`[${revisionCaption}](${url})`);
    });
    it('uses complete English entity captions under unsupported-locale fallback', () => {
        const body = formatGithubRuntimeDoctor(projection(), 'fr-FR');
        expect(body).toContain('[Inspected issue](https://github.com/o/r/issues/7)');
        expect(body).toEqual(formatGithubRuntimeDoctor(projection(), 'en-US'));
    });
    it('withholds entity links when immutable source provenance is absent', () => {
        expect(formatGithubRuntimeDoctor({ ...projection(), revision: undefined })).not.toContain('](');
    });
    it('withholds entity links when source provenance is unsafe', () => {
        expect(formatGithubRuntimeDoctor({ ...projection(), serverOrigin: 'https://user:secret@github.com' })).not.toContain('](');
    });
    it('keeps the exact correlated request identity and deterministic rendering', () => {
        const results = [new Result({ id: 'IssueCommentUseCase.Doctor', success: true, executed: true, payload: { doctor: projection() } })];
        const context = { results, locale: 'es-ES', target: { kind: 'issue' as const, number: 7 }, correlationId: 'comment:42' };
        const [first] = selectSemanticReplyIntents(context); const [replay] = selectSemanticReplyIntents(context);
        expect(first).toEqual(replay); expect(renderSemanticReply(first)).toEqual(renderSemanticReply(replay));
        expect(renderSemanticReply(first)).toContain('[Issue inspeccionada](https://github.com/o/r/issues/7)');
    });
});
