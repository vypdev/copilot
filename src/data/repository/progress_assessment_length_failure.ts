import { AgentResponseLengthFailure } from '../../domain/agent_response_length_failure';
import { ProgressAssessmentLengthFailure, isProgressAssessmentLengthFacts } from '../../domain/progress_assessment_length_failure';
import type { ProgressResponseDiagnosticFacts } from '../../domain/progress_response_diagnostic';
import { canonicalizeLocaleTag } from '../../domain/locale';
import { assertAgentResponseSchema } from './agent_json_schema_validator';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: unknown, key: string): unknown => record(value) && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;

/** Extracts only measured scalars and an ID admitted by this exact completed native request. */
export function assessmentLengthFailure(error: AgentResponseLengthFailure, facts: ProgressResponseDiagnosticFacts,
    parsed: Record<string, unknown>, schema: Record<string, unknown>): ProgressAssessmentLengthFailure | undefined {
    const location = facts.field.match(/^\$\.requirements\[(0|[1-9]\d?)\]\.(summary|remaining)$/u);
    if (facts.phase !== 'assessment' || facts.reason !== 'schema-string-long' || error.path !== facts.field || !location) return;
    const definition = own(own(schema, 'properties'), 'requirements'), fields = own(own(definition, 'items'), 'properties');
    if (!record(own(fields, 'summary')) || !record(own(fields, 'remaining'))) return;
    const rows = parsed.requirements;
    if (!Array.isArray(rows) || rows.length !== own(definition, 'minItems') || rows.length !== own(definition, 'maxItems')) return;
    const row = rows[Number(location[1])], field = location[2], ids = own(own(fields, 'id'), 'enum');
    if (!record(row)
        || !Array.isArray(ids) || !ids.includes(row.id) || row.id !== facts.requirementId) return;
    const value = row[field], maximum = own(own(fields, field), 'maxLength');
    if (typeof value !== 'string' || maximum !== error.maximum || typeof parsed.outputLocale !== 'string') return;
    const details = { requirementId: facts.requirementId, field: facts.field, maximum: error.maximum, observed: [...value].length };
    if (!isProgressAssessmentLengthFacts(details)) return;
    let outputLocale: string;
    try { outputLocale = canonicalizeLocaleTag(parsed.outputLocale); } catch { return; }
    if (outputLocale !== parsed.outputLocale) return;
    // Validate the complete batch and its receipts before attributing the failure.
    // Only these two length checks are deferred; publication still uses the original schema.
    const shape = structuredClone(schema);
    const shapedRequirements = own(own(shape, 'properties'), 'requirements');
    const textFields = own(own(shapedRequirements, 'items'), 'properties') as Record<string, Record<string, unknown>>;
    delete textFields.summary.maxLength; delete textFields.remaining.maxLength;
    try { assertAgentResponseSchema(parsed, shape); } catch { return; }
    const present = rows.map(value => own(value, 'id'));
    if (new Set(present).size !== ids.length || !ids.every(id => present.includes(id))) return;
    if (rows.some(value => { const citations = own(value, 'citations'); return Array.isArray(citations) && new Set(citations).size !== citations.length; })) return;
    return new ProgressAssessmentLengthFailure(facts, { ...details, outputLocale }, schema);
}
