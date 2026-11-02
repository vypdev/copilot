import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationError } from '../../errors/application_error';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import type { ApplicationErrorRecovery } from '../../../data/model/application_error';

const facts = { reportedProgress: 100, requirementCount: 32, supportedCount: 29, missingCount: 2, unknownCount: 1 };
const correlationId = '11111111-1111-4111-8111-111111111111';
const create = () => new ApplicationError('agent.failed', 'The final response remained inconsistent.', {
    correlationId, recovery: { id: 'progress-completion-recovery-exhausted', variables: facts },
});
it('github-communication-experience-change-C159: English terminal output explains exact numeric facts, action and retained progress', () => {
    const error = create(), text = renderApplicationErrorText(error), view = buildApplicationErrorPresentation(error);
    expect(text).toContain('reported 100%, requirements 32, supported 29, missing 2, unknown 1');
    expect(view.action).toContain('Start a fresh complete assessment'); expect(view.action).toContain('phase assessment, field $.progress');
    expect(view.retainedState).toContain('Existing progress labels and published assessments were preserved.');
    expect(view.retainedState).toContain('independent gates'); expect(text).not.toMatch(/PRIVATE_|@all/u);
});
it('github-communication-experience-change-C160: API JSON closes and snapshots numeric facts, rejecting malformed or foreign metadata without echo', () => {
    const error = create(), json = JSON.parse(JSON.stringify(error));
    expect(json.recovery).toEqual({ id: 'progress-completion-recovery-exhausted', variables: facts });
    expect(json).not.toHaveProperty('cause'); expect(json).not.toHaveProperty('stack');
    for (const variables of [{ ...facts, private: 'PRIVATE_RAW' }, { ...facts, reportedProgress: 'PRIVATE_VALUE' },
        { ...facts, missingCount: -1 }, { ...facts, unknownCount: 0 }]) {
        let caught: unknown;
        try { new ApplicationError('agent.failed', 'Safe failure.', { recovery: { id: 'progress-completion-recovery-exhausted', variables } as ApplicationErrorRecovery }); }
        catch (failure) { caught = failure; }
        expect(caught).toBeInstanceOf(TypeError); expect(String(caught)).not.toContain('PRIVATE_');
    }
    expect(Object.isFrozen(error.recovery)).toBe(true); expect(Object.isFrozen(error.recovery!.variables)).toBe(true);
});
it('github-communication-experience-change-C161: terminal, API and shared Check/Summary Markdown retain the terminal correlation and code', () => {
    const error = create();
    for (const surface of [JSON.stringify(error), renderApplicationErrorText(error), renderApplicationErrorMarkdown(error)]) {
        expect(surface).toContain(correlationId); expect(surface).toContain('agent.failed');
    }
    expect(buildApplicationErrorPresentation(error.toJSON()).reference).toBe(correlationId);
});
it('github-communication-experience-change-C162: regional Spanish and unsupported locale fallback retain the same facts and semantic record', () => {
    const error = create(), regional = resolveStaticApplicationErrorCatalog('es-MX').message;
    expect(renderApplicationErrorText(error, regional)).toBe(renderApplicationErrorText(error, resolveStaticApplicationErrorCatalog('es-ES').message));
    const view = buildApplicationErrorPresentation(error, regional);
    expect(view.action).toContain('porcentaje 100%, requisitos 32, respaldados 29, pendientes 2, desconocidos 1');
    expect(view.action).toContain('Inicia una evaluación completa nueva');
    expect(renderApplicationErrorText(error, resolveStaticApplicationErrorCatalog('fr-FR').message)).toBe(renderApplicationErrorText(error));
});
it('github-communication-experience-change-C164: the documented JSON example round-trips through the real normalizer and localized renderer', () => {
    const doc = readFileSync(join(process.cwd(), 'docs/security-operations/operations/error-reference.mdx'), 'utf8');
    const block = doc.match(/\{\/\* progress-completion-example \*\/\}\s*```json\s*([\s\S]*?)```/u);
    expect(block).not.toBeNull(); const example = JSON.parse(block![1]);
    const error = new ApplicationError(example.code, 'Documented safe exhaustion.', { correlationId: example.correlationId, recovery: example.recovery });
    expect(error.toJSON().recovery).toEqual(example.recovery); expect(error.toJSON().correlationId).toBe(correlationId);
    expect(buildApplicationErrorPresentation(error).action).toContain('reported 100%, requirements 32, supported 29, missing 2, unknown 1');
});
