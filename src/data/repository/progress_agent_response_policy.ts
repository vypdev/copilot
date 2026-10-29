import { AgentResponseSchemaFailure } from '../../domain/agent_response_schema_failure';
import { AgentResponseLengthFailure } from '../../domain/agent_response_length_failure';
import { ProgressResponseContractFailure, safeProgressResponseField, isProgressRequirementId, isProgressSourceLineId,
    type ProgressResponsePhase, type ProgressResponseReason } from '../../domain/progress_response_diagnostic';
import { parseStrictJsonFromAgentText } from './agent_json_parser';
import { assertAgentResponseSchema } from './agent_json_schema_validator';

/** Existing application-owned schema names, never names read from model output. */
export function progressResponsePhaseForSchema(name: string): ProgressResponsePhase | undefined {
    if (name === 'progress_scope') return 'scope';
    if (name === 'progress_partition_facts') return 'partition';
    if (name === 'progress_response') return 'assessment';
    return undefined;
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const property = (value: unknown, key: string): unknown => record(value) && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;

/** Select only an ID admitted by this exact host schema; array position is not an ID. */
function verifiedEntryId(phase: ProgressResponsePhase, field: string, parsed: Record<string, unknown>, schema: Record<string, unknown>): string {
    if (phase === 'partition') return 'none';
    const key = phase === 'scope' ? 'lines' : 'requirements';
    if (!field.startsWith(`$.${key}`)) return 'none';
    const definition = property(property(schema, 'properties'), key);
    const values = property(property(property(property(definition, 'items'), 'properties'), 'id'), 'enum');
    if (!Array.isArray(values) || values.length > (phase === 'scope' ? 1_024 : 32)) return 'none';
    const validId = phase === 'scope' ? isProgressSourceLineId : isProgressRequirementId;
    const allowed = values.filter(validId);
    const entries = parsed[key];
    if (!Array.isArray(entries)) return 'none';
    const match = field.match(/\[(\d+)\]/u);
    if (match) {
        const id = property(entries[Number(match[1])], 'id');
        return validId(id) && allowed.includes(id) ? id : 'none';
    }
    const present = new Set(entries.map(entry => property(entry, 'id')));
    return allowed.find(id => !present.has(id)) ?? 'none';
}

/** Called only after the CLI port returned; execution failures never enter this mapper. */
export function interpretProgressAgentOutput(text: string, phase: ProgressResponsePhase, schema: Record<string, unknown>): Record<string, unknown> {
    let parsed: Record<string, unknown>;
    try { parsed = parseStrictJsonFromAgentText(text); }
    catch { throw new ProgressResponseContractFailure({ phase, reason: 'json-invalid', field: '$', requirementId: 'none', sourceLineId: 'none' }); }
    try { assertAgentResponseSchema(parsed, schema); }
    catch (error) {
        if (!(error instanceof AgentResponseSchemaFailure) && !(error instanceof AgentResponseLengthFailure)) throw error;
        const field = safeProgressResponseField(phase, error.path);
        const id = verifiedEntryId(phase, field, parsed, schema);
        throw new ProgressResponseContractFailure({ phase,
            reason: error instanceof AgentResponseLengthFailure ? 'schema-string-long' : `schema-${error.reason}` as ProgressResponseReason,
            field, requirementId: phase === 'assessment' ? id : 'none', sourceLineId: phase === 'scope' ? id : 'none' });
    }
    return parsed;
}
