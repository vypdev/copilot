import {
    LANGUAGE_CHECK_RESPONSE_SCHEMA,
    PULL_REQUEST_DESCRIPTION_RESPONSE_SCHEMA,
    RECOMMEND_STEPS_RESPONSE_SCHEMA,
    THINK_RESPONSE_SCHEMA,
    TRANSLATION_RESPONSE_SCHEMA,
} from '../agent_response_schemas';
import { assertStrictOutputSchema } from '../agent_execution/strict_output_schema_policy';
import { PROGRESS_RESPONSE_SCHEMA } from '../../usecases/actions/progress_response';
import { BUGBOT_RESPONSE_SCHEMA } from '../../usecases/steps/commit/bugbot/schema';

describe('production agent response schemas', () => {
    it.each([
        ['translation', TRANSLATION_RESPONSE_SCHEMA],
        ['language check', LANGUAGE_CHECK_RESPONSE_SCHEMA],
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
});
