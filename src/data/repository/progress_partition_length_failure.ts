import { AgentResponseLengthFailure } from '../../domain/agent_response_length_failure';
import { ProgressPartitionLengthFailure, isProgressPartitionLengthDiagnostic } from '../../domain/progress_partition_length_failure';
import type { ProgressResponseDiagnosticFacts } from '../../domain/progress_response_diagnostic';
import { canonicalizeLocaleTag } from '../../domain/locale';

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (v: unknown, key: string): unknown => record(v) && Object.prototype.hasOwnProperty.call(v, key) ? v[key] : undefined;
const enumValues = (v: unknown): readonly unknown[] => { const values = own(v, 'enum'); return Array.isArray(values) ? values : []; };

/** Extracts identities only from this completed JSON and exact host schema; no raw values escape. */
export function partitionLengthFailure(error: AgentResponseLengthFailure, facts: ProgressResponseDiagnosticFacts,
    parsed: Record<string, unknown>, schema: Record<string, unknown>): ProgressPartitionLengthFailure | undefined {
    const location = facts.field.match(/^\$\.files\[(0|[1-9]\d{0,2})\]\.(implemented|remaining)$/u);
    if (facts.phase !== 'partition' || facts.reason !== 'schema-string-long' || error.path !== facts.field || !location) return;
    const properties = own(schema, 'properties'), files = parsed.files;
    const definition = own(properties, 'files'), fields = own(own(definition, 'items'), 'properties');
    if (!Array.isArray(files) || files.length !== own(definition, 'minItems') || files.length !== own(definition, 'maxItems')) return;
    const file = files[Number(location[1])], field = location[2];
    if (!record(file) || Object.keys(file).sort().join(',') !== (own(fields, 'unitId') ? 'implemented,path,remaining,unitId' : 'implemented,path,remaining')) return;
    const path = file.path, part = parsed.partitionId, unit = file.unitId;
    const value = file[field], maximum = own(own(fields, field), 'maxLength');
    if (!enumValues(own(properties, 'partitionId')).includes(part) || !enumValues(own(fields, 'path')).includes(path)
        || (own(fields, 'unitId') !== undefined && !enumValues(own(fields, 'unitId')).includes(unit))
        || typeof value !== 'string' || maximum !== error.maximum || typeof parsed.outputLocale !== 'string') return;
    const details = { partitionId: part, filePath: path, unitId: unit ?? 'none', field: facts.field, maximum: error.maximum, observed: [...value].length };
    if (!isProgressPartitionLengthDiagnostic(details)) return;
    let outputLocale: string;
    try { outputLocale = canonicalizeLocaleTag(parsed.outputLocale); } catch { return; }
    return new ProgressPartitionLengthFailure(facts, { ...details, outputLocale });
}
