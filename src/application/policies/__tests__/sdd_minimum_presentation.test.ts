import { ApplicationError } from '../../errors/application_error';
import { SddDraftPreparationFailure } from '../../errors/sdd_draft_preparation_failure';
import { SDD_CATALOG_COMPATIBILITY_REASONS } from '../../../domain/sdd_catalog_compatibility';
import type { SddValidationDiagnostic } from '../../../domain/sdd_validation_diagnostic';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import { renderSddPreparationFailure } from '../sdd_preparation_status_policy';

const run = { serverOrigin: 'https://github.example.test', owner: 'acme', repository: 'repo', runId: '123' };
const diagnostic = (observed?: number): SddValidationDiagnostic => ({ reason: 'response-minimum', phase: 'response',
    facts: [{ detail: 'minimum-length', section: 0, expected: 1800, ...(observed === undefined ? {} : { observed }) }] });
const failure = () => new SddDraftPreparationFailure(diagnostic(), 1);

describe.each(['en-US', 'es-ES'])('minimum response presentation %s', locale => {
    it.each([{ observed: undefined, attempts: 1 }, { observed: 0, attempts: 2 }, { observed: 1799, attempts: 1 }] as const)(
        'projects observed $observed and attempt $attempts consistently to card, terminal and API', ({ observed, attempts }) => {
            const error = new SddDraftPreparationFailure(diagnostic(observed), attempts);
            const message = resolveStaticApplicationErrorCatalog(locale).message;
            const view = buildApplicationErrorPresentation(error, message);
            const body = renderSddPreparationFailure({ issueNumber: 42, locale, error, run, diagnostic: error.diagnostic, attempts });
            expect(renderSddPreparationFailure({ issueNumber: 42, locale, error, run })).toBe(body);
            for (const text of [view.impact, view.action, view.retainedState]) expect(body).toContain(text);
            expect(view.action).toContain(locale === 'en-US' ? 'issue description' : 'descripción');
            expect(body).toContain('1800'); expect(body).toContain('response-minimum'); expect(body).toContain('`response`');
            expect(body).toContain('https://github.example.test/acme/repo/actions/runs/123');
            expect(body).toContain('copilot:sdd-analysis-status:v1');
            expect(body).not.toMatch(/PRIVATE|\{\w+\}|Specific table facts|datos concretos de tablas|provider\.unavailable/);
            expect(view.retryable).toBe(message('error.label.no'));
            if (observed === undefined) expect(body).toContain(locale === 'en-US' ? 'length was not retained' : 'no se conservó la longitud');
            else expect(body).toContain(`${locale === 'en-US' ? 'Observed count' : 'Cantidad observada'}: ${observed}`);
            expect(renderApplicationErrorText(error, message)).toContain(view.impact);
            expect(renderApplicationErrorMarkdown(error, message)).toContain(view.action);
            expect(error.toJSON().recovery).toEqual({ id: 'sdd-draft-response-too-short', variables: { minimum: 1800, observed: observed ?? 'unavailable', attempts } });
            expect(error.toJSON().retainedState).toContain('selected ownership');
            expect(Object.isFrozen(error.recovery)).toBe(true); expect(Object.isFrozen(error.recovery!.variables)).toBe(true);
        },
    );
});

describe('minimum response presentation trust boundary', () => {
    it.each([
        null, {}, { minimum: 1800, observed: 'unavailable', attempts: 1, response: 'PRIVATE_RESPONSE' },
        { minimum: 0, observed: 'unavailable', attempts: 1 }, { minimum: 1800, observed: 1800, attempts: 1 },
        { minimum: 1800, observed: 'unavailable', attempts: 3 },
    ])('rejects malformed serialized recovery facts before public formatting %j', variables => {
        const recovery = { id: 'sdd-draft-response-too-short', variables } as never;
        expect(() => new ApplicationError('validation.invalid-input', 'Safe.', { recovery })).toThrow();
        const error = { ...failure().toJSON(), recovery };
        expect(() => renderSddPreparationFailure({ issueNumber: 42, error })).toThrow('minimum recovery facts');
    });

    it.each([
        { diagnostic: { reason: 'response-shape', phase: 'response', facts: [{ detail: 'response-shape', section: 0 }] } },
        { diagnostic: { ...diagnostic(), facts: [{ ...diagnostic().facts[0], expected: 1801 }] } },
        { diagnostic: diagnostic(1) }, { attempts: 2 },
        { catalogReason: SDD_CATALOG_COMPATIBILITY_REASONS[0] },
        { missingCatalogSource: 'a'.repeat(40) }, { publicationPending: true },
    ])('rejects contradictory phase/count/attempt projections %j', options => {
        expect(() => renderSddPreparationFailure({ issueNumber: 42, error: failure(), ...options } as never)).toThrow();
    });

    it('requires the validated minimum semantic recovery for a minimum diagnostic', () => {
        expect(() => renderSddPreparationFailure({ issueNumber: 42, error: new ApplicationError('validation.invalid-input', 'Safe.'), diagnostic: diagnostic() }))
            .toThrow('requires its semantic recovery');
    });
});
