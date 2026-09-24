import { assertStrictOutputSchema } from '../../../../../policies/agent_execution/strict_output_schema_policy';
import {
    BUGBOT_FIX_INTENT_RESPONSE_SCHEMA,
    BUGBOT_PARTITION_RESPONSE_SCHEMA,
    BUGBOT_RESPONSE_SCHEMA,
    buildBugbotPartitionResponseSchema,
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

    it('pins both attestation fields to the trusted partition without changing the base schema', () => {
        const expected = { partitionId: 'diff-12-of-18-exact', headSha: 'a'.repeat(40) };
        const schema = buildBugbotPartitionResponseSchema(expected);
        expect(() => assertStrictOutputSchema(schema)).not.toThrow();
        expect(schema).toEqual(expect.objectContaining({
            properties: expect.objectContaining({
                partition_id: expect.objectContaining({ enum: [expected.partitionId] }),
                reviewed_head_sha: expect.objectContaining({ enum: [expected.headSha] }),
            }),
        }));
        expect(BUGBOT_PARTITION_RESPONSE_SCHEMA.properties.partition_id).not.toHaveProperty('enum');
        expect(BUGBOT_PARTITION_RESPONSE_SCHEMA.properties.reviewed_head_sha).not.toHaveProperty('enum');
    });
});
