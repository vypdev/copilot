import { ApplicationError } from '../../errors/application_error';
import { ProgressCapacityFailure } from '../../errors/progress_capacity_failure';
import { progressComparisonCapacityContext } from '../progress_capacity_context_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import type { ProgressCapacityInput } from '../../../domain/progress_capacity_diagnostic';

const comparison = () => progressComparisonCapacityContext({ baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), requiredPaths: ['specs/@all`<x>|.md'] });
const cases: ReadonlyArray<readonly [string, () => ProgressCapacityInput, RegExp, RegExp]> = [
    ['maximum', () => ({ phase: 'source', dimension: 'source-unit-bytes', observedCount: 256_001, supportedLimit: 256_000, context: comparison() }), /maximum available: 256,000 bytes/, /máximo disponible: 256\.000 bytes/],
    ['lower bound', () => ({ phase: 'source', dimension: 'source-part-count', observedCount: 17, supportedLimit: 16, countKind: 'at-least' }), /at least/, /como mínimo/],
    ['minimum', () => ({ phase: 'scope', dimension: 'source-line-count', observedCount: 0, supportedLimit: 1, bound: 'minimum' }), /minimum required: 1 lines/, /mínimo requerido: 1 líneas/],
    ['unavailable', () => ({ phase: 'aggregate', dimension: 'invalid-allocation', observedCount: 'unavailable', supportedLimit: 'unavailable', bound: 'unavailable', countKind: 'unavailable' }), /allocation are unavailable/, /asignación aplicable no están disponibles/],
    ['source line', () => ({ phase: 'scope', dimension: 'source-line-points', observedCount: 1_201, supportedLimit: 1_200, context: { ...comparison(), kind: 'comparison', sourceLineId: 'L42' } as never }), /physical source line: L42/, /Línea física de origen: L42/],
    ['standalone source line', () => ({ phase: 'scope', dimension: 'source-line-points', observedCount: 1_201, supportedLimit: 1_200, context: { kind: 'source-line', sourceLineId: 'L7' } }), /physical source line: L7/, /Línea física de origen: L7/],
    ['complete receipts', () => ({ phase: 'aggregate', dimension: 'aggregate-fact-bytes', observedCount: 3, supportedLimit: 2,
        context: progressComparisonCapacityContext({ baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), requiredPaths: ['a.ts'], reviewedPaths: ['a.ts'], manifestDigest: 'c'.repeat(64) }) }), /no uncovered paths/, /ninguna ruta sin cubrir/],
];
describe.each(['en-US', 'es-ES'])('closed capacity API and product presentation in %s', locale => {
    it.each(cases)('preserves %s facts through public JSON, terminal and GitHub Markdown', (_name, input, en, es) => {
        const original = new ProgressCapacityFailure(input(), '11111111-1111-4111-8111-111111111111');
        const record = JSON.parse(JSON.stringify(original.toJSON()));
        const rehydrated = new ApplicationError(record.code, record.message, { correlationId: record.correlationId, recovery: record.recovery });
        expect(rehydrated.toJSON()).toEqual(original.toJSON()); expect(Object.isFrozen(rehydrated.recovery!.variables)).toBe(true);
        const message = resolveStaticApplicationErrorCatalog(locale).message;
        const view = buildApplicationErrorPresentation(rehydrated, message);
        expect(view.impact).toMatch(locale === 'en-US' ? en : es); expect(view.reference).toBe('11111111-1111-4111-8111-111111111111');
        for (const rendered of [renderApplicationErrorText(rehydrated, message), renderApplicationErrorMarkdown(rehydrated, message)]) {
            expect(rendered).toContain(view.impact); expect(rendered).toContain(view.retainedState);
            expect(rendered).not.toMatch(/@all|<x>|\{observedCount\}|\[object Object\]/u);
            expect(rendered).not.toContain('PRIVATE_PROVIDER_BODY');
        }
    });
});
it('rejects malicious nested API metadata instead of echoing or retaining unknown fields', () => {
    const error = new ProgressCapacityFailure(cases[0][1]()).toJSON();
    const poisoned = JSON.parse(JSON.stringify(error.recovery)); poisoned.variables.context.private = 'PRIVATE_PROVIDER_BODY';
    expect(() => new ApplicationError(error.code, error.message, { recovery: poisoned })).toThrow();
});
