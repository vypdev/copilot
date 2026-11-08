import { progressPartitionLengthRejected } from '../progress_partition_length_policy';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import { ApplicationError } from '../../errors/application_error';

const facts = { partitionId: 'part-7', filePath: 'src/example.ts', unitId: 'unit-21', field: '$.files[0].implemented', maximum: 600, observed: 618 };
it('localizes current status, exact facts, action and retained progress in both bundled languages', () => {
    for (const locale of ['en-US', 'es-ES']) {
        const view = buildApplicationErrorPresentation(progressPartitionLengthRejected(facts), resolveStaticApplicationErrorCatalog(locale).message);
        expect(view.impact).toContain(locale === 'en-US' ? 'one bounded replacement' : 'una sustitución acotada');
        for (const value of ['part-7', 'src/example.ts', 'unit-21', '$.files[0].implemented', '600', '618']) expect(view.action).toContain(value);
        expect(view.retainedState).toContain(locale === 'en-US' ? 'preserved' : 'conservaron');
        expect(view.action).toContain(locale === 'en-US' ? 'Do not automatically repeat' : 'No repitas automáticamente');
        expect(view.action).toContain(locale === 'en-US' ? 'Qualify a corrected build' : 'Valida una compilación corregida');
    }
});
it('preserves JSON facts and one correlation identity across terminal, Markdown and catalog fallback', () => {
    const error = progressPartitionLengthRejected(facts), reference = error.correlationId;
    expect(error.toJSON().recovery).toEqual({ id: 'progress-partition-length-invalid', variables: facts });
    for (const text of [renderApplicationErrorText(error), renderApplicationErrorMarkdown(error)]) {
        expect(text).toContain('agent.failed'); expect(text).toContain(reference); expect(text).toContain('618');
    }
    expect(buildApplicationErrorPresentation(error, resolveStaticApplicationErrorCatalog('fr-FR').message).impact).toContain('one bounded replacement');
    expect(error.toJSON()).not.toHaveProperty('stack'); expect(error.toJSON()).not.toHaveProperty('cause');
});
it('refuses unknown fields and invalid scalar context without echoing rejected provider content', () => {
    for (const variables of [{ ...facts, raw: 'PRIVATE_RESPONSE' }, { ...facts, observed: 600 }, { ...facts, field: '$.files[0].PRIVATE' }]) {
        let caught: unknown;
        try { new ApplicationError('agent.failed', 'Owned message', { recovery: { id: 'progress-partition-length-invalid', variables: variables as never } }); }
        catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(TypeError); expect(String(caught)).not.toContain('PRIVATE');
    }
});
it('renders an assigned hostile filename as an inert reversible literal while retaining its exact JSON identity', () => {
    const filePath = 'src/@all<script>[name]`\u202e.ts', error = progressPartitionLengthRejected({ ...facts, filePath });
    const markdown = renderApplicationErrorMarkdown(error);
    expect(error.toJSON().recovery?.variables).toMatchObject({ filePath });
    expect(markdown).not.toContain('@all'); expect(markdown).not.toContain('<script>'); expect(markdown).not.toContain('\u202e');
    expect(markdown).toContain('\\u0040all'); expect(markdown).toContain('\\u202e');
    expect(error.recovery?.variables).not.toHaveProperty('raw'); expect(Object.isFrozen(error.recovery?.variables)).toBe(true);
});
