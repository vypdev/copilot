import {
    LANGUAGE_CHECK_RESPONSE_SCHEMA,
    THINK_RESPONSE_SCHEMA,
    TRANSLATION_RESPONSE_SCHEMA,
} from '../agent_response_schemas';
import { assertStrictOutputSchema } from '../agent_execution/strict_output_schema_policy';
import { PROGRESS_RESPONSE_SCHEMA } from '../../usecases/actions/progress_response';

describe('production agent response schemas', () => {
    it.each([
        ['translation', TRANSLATION_RESPONSE_SCHEMA],
        ['language check', LANGUAGE_CHECK_RESPONSE_SCHEMA],
        ['think', THINK_RESPONSE_SCHEMA],
        ['progress', PROGRESS_RESPONSE_SCHEMA],
    ])('%s uses the strict native structured-output contract', (_name, schema) => {
        expect(() => assertStrictOutputSchema(schema)).not.toThrow();
    });
});
