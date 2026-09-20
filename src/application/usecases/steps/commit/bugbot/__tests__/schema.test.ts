import { assertStrictOutputSchema } from '../../../../../policies/agent_execution/strict_output_schema_policy';
import {
    BUGBOT_FIX_INTENT_RESPONSE_SCHEMA,
    BUGBOT_PARTITION_RESPONSE_SCHEMA,
    BUGBOT_RESPONSE_SCHEMA,
} from '../schema';

describe('BUGBOT_RESPONSE_SCHEMA', () => {
    it('satisfies the strict native structured-output contract', () => {
        expect(() => assertStrictOutputSchema(BUGBOT_RESPONSE_SCHEMA)).not.toThrow();
        expect(() => assertStrictOutputSchema(BUGBOT_PARTITION_RESPONSE_SCHEMA)).not.toThrow();
        expect(() => assertStrictOutputSchema(BUGBOT_FIX_INTENT_RESPONSE_SCHEMA)).not.toThrow();
    });

    it('requires immutable partition identity and canonical head attestation', () => {
        expect(BUGBOT_PARTITION_RESPONSE_SCHEMA.required).toEqual(expect.arrayContaining([
            'partition_id',
            'reviewed_head_sha',
        ]));
    });
});
