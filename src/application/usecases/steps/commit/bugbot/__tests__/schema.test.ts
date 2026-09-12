import { assertStrictOutputSchema } from '../../../../../policies/agent_execution/strict_output_schema_policy';
import { BUGBOT_FIX_INTENT_RESPONSE_SCHEMA, BUGBOT_RESPONSE_SCHEMA } from '../schema';

describe('BUGBOT_RESPONSE_SCHEMA', () => {
    it('satisfies the strict native structured-output contract', () => {
        expect(() => assertStrictOutputSchema(BUGBOT_RESPONSE_SCHEMA)).not.toThrow();
        expect(() => assertStrictOutputSchema(BUGBOT_FIX_INTENT_RESPONSE_SCHEMA)).not.toThrow();
    });
});
