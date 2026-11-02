import { ApplicationError } from '../../errors/application_error';
import { buildApplicationErrorPresentation } from '../application_error_presentation_policy';
import { resolveApplicationErrorCatalog, resolveStaticApplicationErrorCatalog, ENGLISH_APPLICATION_ERROR_DEFINITION } from '../application_error_message_catalog';
import { renderSddPreparationFailure } from '../sdd_preparation_status_policy';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';

const variables = { sourceCommit: 'a'.repeat(40), phase: 'analysis', reason: 'object-unavailable' } as const;
const error = () => new ApplicationError('validation.evidence-unavailable', 'Source preparation stopped.', { recovery: { id: 'sdd-source-context-unavailable', variables } });
it('source-context-C47: English impact/action/retention identifies the source without exposing raw internals', () => {
    const view = buildApplicationErrorPresentation(error());
    expect(view.impact).toContain(variables.sourceCommit); expect(view.impact).toContain('object-unavailable'); expect(view.impact).not.toContain('Progress');
    expect(view.action).toContain('--no-lazy-fetch'); expect(view.retainedState).toContain('canonical checkout');
    expect(renderSddPreparationFailure({ issueNumber: 42, error: error() })).toContain(variables.sourceCommit);
});
it('source-context-C48: Spanish and coherent translation fallback preserve the closed source facts', async () => {
    const es = buildApplicationErrorPresentation(error(), resolveStaticApplicationErrorCatalog('es-ES').message);
    expect(es.impact).toContain('origen inmutable'); expect(es.impact).toContain(variables.sourceCommit); expect(es.action).toContain('misma incidencia');
    const messages = { ...ENGLISH_APPLICATION_ERROR_DEFINITION.messages } as Record<string, unknown>;
    delete messages['error.recovery.sdd-source-context-unavailable.action'];
    const catalog = await resolveApplicationErrorCatalog('fr-FR', { provider: 'codex', model: 'model' }, new ResolveMessageCatalogUseCase({
        query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }),
    }));
    expect(catalog).toMatchObject({ locale: 'en-US', resolutionSource: 'fallback' });
    expect(buildApplicationErrorPresentation(error(), catalog.message).impact).toBe(buildApplicationErrorPresentation(error()).impact);
});
it.each([{ ...variables, phase: 'unknown' }, { ...variables, sourceCommit: 'secret-token' }, { ...variables, reason: 'private-path' },
    { ...variables, rawStderr: 'credential' }])('source-context-C49: application boundary rejects forged recovery facts %#', input => {
    expect(() => new ApplicationError('validation.evidence-unavailable', 'Source stopped.', { recovery: {
        id: 'sdd-source-context-unavailable', variables: input,
    } as never })).toThrow();
});
it('source-context-C49: an untyped presentation caller cannot leak arbitrary recovery values', () => {
    const failure = error(), recovery = { id: 'sdd-source-context-unavailable', variables: { ...variables, sourceCommit: 'PRIVATE-TOKEN' } } as never;
    const view = buildApplicationErrorPresentation({ ...failure, recovery }); expect(JSON.stringify(view)).not.toContain('PRIVATE-TOKEN');
    const card = renderSddPreparationFailure({ issueNumber: 42, error: { ...failure, recovery } }); expect(card).not.toContain('PRIVATE-TOKEN');
});
