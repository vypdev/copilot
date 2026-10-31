import { ApplicationError } from '../../errors/application_error';
import { progressResponseRejected, progressResponsePayload } from '../progress_response_rejection_policy';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import type { ProgressResponseDiagnosticFacts } from '../../../domain/progress_response_diagnostic';

const facts: ProgressResponseDiagnosticFacts = { phase: 'assessment', reason: 'requirement-evidence-invalid', field: '$.requirements[1].evidence', requirementId: 'R2', sourceLineId: 'L7' };
it.each(['en-US', 'es-ES'])('explains completed rejection, action, exact identities and retained progress in %s', locale => {
    const error = progressResponseRejected(facts), catalog = resolveStaticApplicationErrorCatalog(locale), view = buildApplicationErrorPresentation(error, catalog.message);
    expect(view.impact).toContain(locale === 'en-US' ? 'violated its contract' : 'incumplió su contrato');
    expect(view.action).toContain('$.requirements[1].evidence'); expect(view.action).toContain('R2'); expect(view.action).toContain('L7');
    expect(view.action).toContain(locale === 'en-US' ? 'unchanged contract' : 'sin cambiarlo');
    expect(view.retainedState).toContain(locale === 'en-US' ? 'progress labels' : 'etiquetas de progreso');
    expect(view.retainedState).toContain(locale === 'en-US' ? 'separate result' : 'otro resultado');
});
it('makes unavailable identities explicit instead of fabricating an anchor', () => {
    const error = progressResponseRejected({ ...facts, field: '$', requirementId: 'none', sourceLineId: 'none' });
    const view = buildApplicationErrorPresentation(error); expect(view.action).toContain('none means no verified identity is available');
});
it('uses the same bounded record across JSON, terminal and Markdown surfaces', () => {
    const error = progressResponseRejected(facts), json = error.toJSON();
    expect(json.recovery?.variables).toEqual(facts);
    for (const text of [renderApplicationErrorText(error), renderApplicationErrorMarkdown(error)]) {
        expect(text).toContain('agent.failed'); expect(text).toContain('R2'); expect(text).toContain('L7'); expect(text).toContain(error.correlationId);
    }
    expect(json).not.toHaveProperty('cause'); expect(json).not.toHaveProperty('stack');
});
it('keeps the original semantic correlation reference through descriptor rendering', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const error = new ApplicationError('agent.failed', 'Owned completed rejection', { correlationId: id, recovery: { id: 'progress-result-contract-invalid', variables: facts } });
    expect(buildApplicationErrorPresentation(error).reference).toBe(id); expect(error.toJSON().correlationId).toBe(id);
});
it('preserves locale-output classification while adding field-level detail', () => {
    const error = progressResponseRejected({ ...facts, reason: 'output-locale-mismatch', field: '$.outputLocale', requirementId: 'none', sourceLineId: 'none' }, 'locale.output-invalid');
    expect(buildApplicationErrorPresentation(error).code).toBe('locale.output-invalid'); expect(error.retryable).toBe(true);
});
it('uses the complete English fallback for a locale without a bundled descriptor', () => {
    const catalog = resolveStaticApplicationErrorCatalog('fr-FR');
    expect(buildApplicationErrorPresentation(progressResponseRejected(facts), catalog.message).impact).toContain('The returned progress result');
});
it.each([
    { ...facts, raw: 'PRIVATE_OUTPUT' }, { ...facts, field: '$.PRIVATE_FIELD@all' },
    { ...facts, reason: 'PRIVATE_REASON' }, { ...facts, requirementId: 'PRIVATE_ID' },
])('refuses unreviewed public recovery data without echoing its value %#', variables => {
    let caught: unknown;
    try { new ApplicationError('agent.failed', 'Owned safe message', { recovery: { id: 'progress-result-contract-invalid', variables: variables as never } }); }
    catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(TypeError); expect(String(caught)).not.toMatch(/PRIVATE_|@all/u);
});
it('rejects unsafe data before constructing a field-rich public error message', () => {
    expect(() => progressResponseRejected({ ...facts, field: '$.PRIVATE_FIELD' })).toThrow('Progress response diagnostic is invalid.');
});
it('snapshots recovery facts so later callers cannot change the reported field', () => {
    const input = { ...facts }, error = progressResponseRejected(input); input.field = '$.requirements[0].summary';
    expect(error.recovery?.variables).toEqual(facts); expect(Object.isFrozen(error.recovery?.variables)).toBe(true);
});
it('does not claim completed output for an unavailable result', () => {
    try { progressResponsePayload(undefined, 'en-US', 'assessment'); throw Error('Expected missing output'); }
    catch (error) { expect(error).toMatchObject({ code: 'locale.output-invalid', recovery: undefined }); }
});
