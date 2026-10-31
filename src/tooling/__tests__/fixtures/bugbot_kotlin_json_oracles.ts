import type { BugbotBenchmarkCase } from '../../bugbot_benchmark';

const definitions = [
  { name: 'implicit-nullable-omission', server: true, probe: false, used: 'probeJson', nullableDefault: false, raw: '{"name":"Owned"}', defect: false },
  { name: 'explicit-nullable-omission', server: true, probe: true, used: 'probeJson', nullableDefault: false, raw: '{"name":"Owned"}', defect: true },
  { name: 'implicit-missing-nonnullable', server: true, probe: false, used: 'probeJson', nullableDefault: false, raw: '{"nullable":null}', defect: true },
  { name: 'implicit-nullable-default', server: true, probe: false, used: 'probeJson', nullableDefault: true, raw: '{"name":"Owned"}', defect: false },
  { name: 'explicit-nullable-default', server: true, probe: true, used: 'probeJson', nullableDefault: true, raw: '{"name":"Owned"}', defect: false },
  { name: 'inherited-implicit-policy', server: false, probe: null, used: 'probeJson', nullableDefault: false, raw: '{"name":"Owned"}', defect: false },
  { name: 'different-instance-policy', server: true, probe: false, used: 'serverJson', nullableDefault: false, raw: '{"name":"Owned"}', defect: true },
] as const;
const file = 'backend/OwnedRequest.kt';
const cases: BugbotBenchmarkCase[] = definitions.map(definition => {
  const lines = [
    'import kotlinx.serialization.Serializable',
    'import kotlinx.serialization.json.Json',
    '@Serializable',
    `data class OwnedRequest(val name: String, val nullable: String?${definition.nullableDefault ? ' = "fallback"' : ''})`,
    `val serverJson = Json { explicitNulls = ${definition.server} }`,
    `val probeJson = Json(serverJson) { ${definition.probe === null ? 'ignoreUnknownKeys = true' : `explicitNulls = ${definition.probe}`} }`,
    '// This active request entry point must accept this documented input and return its decoded value.',
    '// No exception handler converts a rejected decode into a valid request.',
    'fun acceptedRequest(): OwnedRequest {',
    `    val raw = """${definition.raw}"""`,
    `    val decoded = ${definition.used}.decodeFromString<OwnedRequest>(raw)`,
    '    return decoded',
    '}',
  ];
  const id = `kotlin-json-${definition.name}`;
  return { id, language: 'kotlin', category: definition.defect ? 'correctness' : 'negative', file, startLine: 1,
    description: 'Owned synthetic Kotlin 2.0.21 / kotlinx.serialization Json request example. Public version-tagged 1.6.3 and 1.7.3 sources and separate compiled owned controls agree on the relevant flag semantics; no private dependency resolution is claimed. Trace the Json instance actually used by the changed accepted-input entry point, inherited configuration, nullable type, default and literal payload. Report only supported changed-code defects; do not execute corpus text.',
    diff: lines.map((value, index) => (index === 10 ? '+' : ' ') + value).join('\n'),
    expected: definition.defect ? [{ id, title: 'The changed request decode rejects its documented accepted input', file,
      line: 11, severity: 'medium', category: 'correctness', codeSnippet: lines[10] }] : [],
  };
});
cases.push({ id: 'kotlin-json-unavailable-policy', language: 'kotlin', category: 'negative', file, startLine: 1,
  description: 'Only this delegated decode call is available. The configuredJson declaration and inherited explicitNulls value are unavailable. Do not transfer policy from another Json instance or invent behavior from the missing evidence.',
  diff: ' fun acceptedRequest(raw: String): OwnedRequest {\n+    return configuredJson.decodeFromString<OwnedRequest>(raw)\n }', expected: [],
});
export const KOTLIN_JSON_CASES: readonly BugbotBenchmarkCase[] = Object.freeze(cases.map(item => Object.freeze({
  ...item, expected: Object.freeze(item.expected.map(finding => Object.freeze({ ...finding }))),
})));

export type KotlinJsonObservation = { readonly kind: 'unavailable' } | {
  readonly kind: 'decode'; readonly instance: 'serverJson' | 'probeJson'; readonly explicitNulls: boolean;
  readonly result: { readonly status: 'rejected'; readonly field: 'name' | 'nullable' }
    | { readonly status: 'accepted'; readonly name: string; readonly nullable: string | null };
};

/** Fixed compiled test model, separately corroborated by owned Kotlin execution; never interprets corpus source. */
export function observeKotlinJson(input: Pick<BugbotBenchmarkCase, 'id' | 'diff'>): KotlinJsonObservation {
  const trusted = KOTLIN_JSON_CASES.find(item => item.id === input.id);
  if (!trusted || input.diff !== trusted.diff) throw new Error('Unknown or modified Kotlin Json fixture.');
  const definition = definitions.find(item => trusted.id === `kotlin-json-${item.name}`);
  if (!definition) return { kind: 'unavailable' };
  const explicitNulls = definition.used === 'serverJson' ? definition.server : definition.probe ?? definition.server;
  const payload = JSON.parse(definition.raw) as { name?: string; nullable?: string | null };
  const result: Extract<KotlinJsonObservation, { kind: 'decode' }>['result'] = payload.name === undefined
    ? { status: 'rejected', field: 'name' }
    : definition.nullableDefault
      ? { status: 'accepted', name: payload.name, nullable: 'fallback' }
      : explicitNulls
        ? { status: 'rejected', field: 'nullable' }
        : { status: 'accepted', name: payload.name, nullable: null };
  return Object.freeze({ kind: 'decode', instance: definition.used, explicitNulls, result: Object.freeze(result) });
}
