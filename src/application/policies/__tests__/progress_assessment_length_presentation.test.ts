import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationError } from '../../errors/application_error';
import { progressAssessmentLengthRejected } from '../progress_assessment_length_policy';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import type { ApplicationErrorRecovery } from '../../../data/model/application_error';

const facts = { requirementId: 'R11', sourceLineId: 'L11', field: '$.requirements[0].remaining', maximum: 54, observed: 62 };
const correlationId = '11111111-1111-4111-8111-111111111111';
const create = () => new ApplicationError('agent.failed', 'Safe length exhaustion.', { correlationId,
    recovery: { id: 'progress-assessment-length-invalid', variables: facts } });

it('github-communication-experience-change-C182: terminal, JSON, Check and Summary retain closed length facts and correlation', () => {
    const error = create(), view = buildApplicationErrorPresentation(error), json = error.toJSON();
    expect(json.recovery).toEqual({ id: 'progress-assessment-length-invalid', variables: facts });
    expect(json).not.toHaveProperty('cause'); expect(json).not.toHaveProperty('stack');
    expect(view.action).toContain('R11'); expect(view.action).toContain('L11'); expect(view.action).toContain('54'); expect(view.action).toContain('62');
    expect(view.retainedState).toContain('independent gates');
    for (const surface of [JSON.stringify(error), renderApplicationErrorText(error), renderApplicationErrorMarkdown(error)]) {
        expect(surface).toContain('agent.failed'); expect(surface).toContain(correlationId); expect(surface).not.toMatch(/PRIVATE_|@all/u);
    }
    expect(progressAssessmentLengthRejected(facts).recovery).toEqual(json.recovery);
    expect(Object.isFrozen(error.recovery!.variables)).toBe(true);
});
it('github-communication-experience-change-C182: Spanish regions and unsupported locale fallback preserve the same diagnostic', () => {
    const error = create(), es = resolveStaticApplicationErrorCatalog('es-ES').message;
    const regional = resolveStaticApplicationErrorCatalog('es-MX').message;
    expect(renderApplicationErrorText(error, regional)).toBe(renderApplicationErrorText(error, es));
    const action = buildApplicationErrorPresentation(error, es).action;
    for (const fact of ['R11', 'L11', '$.requirements[0].remaining', '54', '62']) expect(action).toContain(fact);
    expect(renderApplicationErrorText(error, resolveStaticApplicationErrorCatalog('fr-FR').message)).toBe(renderApplicationErrorText(error));
});
it('github-communication-experience-change-C176: malformed recovery metadata never echoes rejected prose', () => {
    for (const variables of [{ ...facts, private: 'PRIVATE_RAW' }, { ...facts, observed: 'PRIVATE_RAW' },
        { ...facts, maximum: 0 }, { ...facts, observed: 54 }, { ...facts, field: '$.PRIVATE_RAW' }]) {
        let caught: unknown;
        try { new ApplicationError('agent.failed', 'Safe failure.', { recovery: { id: 'progress-assessment-length-invalid', variables } as ApplicationErrorRecovery }); }
        catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(TypeError); expect(String(caught)).not.toContain('PRIVATE_RAW');
    }
});
it('github-communication-experience-change-C184: documented length metadata round-trips and completion compatibility remains intact', () => {
    const doc = readFileSync(join(process.cwd(), 'docs/security-operations/operations/error-reference.mdx'), 'utf8');
    const block = doc.match(/\{\/\* progress-assessment-length-example \*\/\}\s*```json\s*([\s\S]*?)```/u);
    expect(block).not.toBeNull(); const example = JSON.parse(block![1]);
    const error = new ApplicationError(example.code, 'Documented safe exhaustion.', { correlationId: example.correlationId, recovery: example.recovery });
    expect(error.toJSON()).toMatchObject(example); expect(buildApplicationErrorPresentation(error).action).toContain('62');
    const completion = new ApplicationError('agent.failed', 'Existing completion exhaustion.', { recovery: {
        id: 'progress-completion-recovery-exhausted', variables: { reportedProgress: 70, requirementCount: 1, supportedCount: 1, missingCount: 0, unknownCount: 0 },
    } });
    expect(buildApplicationErrorPresentation(completion).action).toContain('reported 70%');
});
