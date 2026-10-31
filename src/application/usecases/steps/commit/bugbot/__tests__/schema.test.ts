import { buildAgentPrompt } from '../../../../../../data/repository/agent_prompt_policy';
import { assertAgentResponseSchema } from '../../../../../../data/repository/agent_json_schema_validator';
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


it('delivers actionable-only array guidance while preserving empty and concrete info responses', () => {
  const partition = { partition_id: 'diff-links', reviewed_head_sha: 'a'.repeat(40) };
  const info = {
    id: 'limited-label-fault', title: 'Fallback status label is inaccurate',
    description: 'The fallback displays a stale label when no record is selected.',
    file: 'src/status.ts', line: 1, endLine: 1, severity: 'info', confidence: 1,
    category: 'correctness', evidence: 'The fallback still renders the prior label.',
    suggestion: null, symbol: null, codeSnippet: null, suggestedCode: null,
  };
  for (const [schema, attestation] of [
    [BUGBOT_RESPONSE_SCHEMA, {}],
    [BUGBOT_PARTITION_RESPONSE_SCHEMA, partition],
    [buildBugbotPartitionResponseSchema({ partitionId: partition.partition_id, headSha: partition.reviewed_head_sha }), partition],
  ] as const) {
    const prompt = buildAgentPrompt('Review the supplied source.', true, schema, 'bugbot');
    expect(prompt).toContain('Confirmed actionable defects only');
    expect(prompt).toContain('including info');
    expect(prompt).toContain('Return [] when no defect is demonstrated');
    expect(() => assertAgentResponseSchema({ outputLocale: 'en-US', findings: [], resolved_findings: [], ...attestation }, schema)).not.toThrow();
    expect(() => assertAgentResponseSchema({ outputLocale: 'en-US', findings: [info], resolved_findings: [], ...attestation }, schema)).not.toThrow();
  }
});
