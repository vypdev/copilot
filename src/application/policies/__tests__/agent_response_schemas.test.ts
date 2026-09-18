import {
    LANGUAGE_ADAPTATION_RESPONSE_SCHEMA,
    PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA,
    RECOMMEND_STEPS_RESPONSE_SCHEMA,
    THINK_RESPONSE_SCHEMA,
} from '../agent_response_schemas';
import { assertStrictOutputSchema } from '../agent_execution/strict_output_schema_policy';
import { PROGRESS_RESPONSE_SCHEMA } from '../../usecases/actions/progress_response';
import { BUGBOT_RESPONSE_SCHEMA } from '../../usecases/steps/commit/bugbot/schema';

describe('production agent response schemas', () => {
    it.each([
        ['language adaptation', LANGUAGE_ADAPTATION_RESPONSE_SCHEMA],
        ['think', THINK_RESPONSE_SCHEMA],
        ['progress', PROGRESS_RESPONSE_SCHEMA],
        ['recommend steps', RECOMMEND_STEPS_RESPONSE_SCHEMA],
        ['pull-request description', PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA],
        ['bugbot review', BUGBOT_RESPONSE_SCHEMA],
    ])('%s uses the strict native structured-output contract', (_name, schema) => {
        expect(() => assertStrictOutputSchema(schema)).not.toThrow();
    });

    it.each([
        THINK_RESPONSE_SCHEMA,
        PROGRESS_RESPONSE_SCHEMA,
        RECOMMEND_STEPS_RESPONSE_SCHEMA,
        PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA,
        BUGBOT_RESPONSE_SCHEMA,
    ])('requires exact output-locale metadata for product-facing prose', (schema) => {
        expect(schema.required).toContain('outputLocale');
        expect(schema.properties.outputLocale).toMatchObject({ type: 'string', maxLength: 255 });
    });

    it('bounds pull-request descriptions as structured reviewer content', () => {
        expect(PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA.properties.overview).toMatchObject({
            minLength: 1,
            maxLength: 1_500,
        });
        expect(PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA.properties.changes).toMatchObject({
            minItems: 2,
            maxItems: 6,
        });
        expect(PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA.properties.validation).toMatchObject({
            type: ['array', 'null'],
            minItems: 1,
            maxItems: 8,
        });
        expect(PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA.properties.validationHeading)
            .toMatchObject({ type: ['string', 'null'] });
        expect(PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA.properties.reviewNotes.description)
            .toContain('null for routine greenfield removals');
        expect(PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA.required).toContain('closesLinkedIssue');
    });

    it('bounds implementation plans as renderer-owned structured content', () => {
        expect(RECOMMEND_STEPS_RESPONSE_SCHEMA.properties.steps).toMatchObject({
            type: ['array', 'null'],
            minItems: 3,
            maxItems: 8,
            items: {
                type: 'object',
                required: ['title', 'details'],
                additionalProperties: false,
            },
        });
        expect(RECOMMEND_STEPS_RESPONSE_SCHEMA.properties.steps.items.properties.title)
            .toMatchObject({ minLength: 1, maxLength: 200 });
        expect(RECOMMEND_STEPS_RESPONSE_SCHEMA.properties.steps.items.properties.details)
            .toMatchObject({ maxItems: 2 });
        expect(RECOMMEND_STEPS_RESPONSE_SCHEMA.properties.acceptance)
            .toMatchObject({ type: ['string', 'null'], minLength: 1, maxLength: 800 });
        expect(RECOMMEND_STEPS_RESPONSE_SCHEMA.required)
            .toEqual(expect.arrayContaining(['steps', 'acceptance']));
    });
});
