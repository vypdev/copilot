import { ApplicationError } from '../../../../../errors/application_error';
import type { FindingsQueryRequest } from '../../../../../ports/agent_findings_ports';
import { buildLiteralVerificationPrompt, buildLiteralVerificationSchema, verifyGeneratedLiteralFindings } from '../verify_generated_literal_findings';
import type { BugbotFinding } from '../../../../../../domain/bugbot/finding';

const config = { provider: 'codex' as const, model: 'fixture', effort: 'medium' as const };
const candidate = (overrides: Partial<BugbotFinding> = {}): BugbotFinding => ({
  id: 'counter', title: 'Counter assertion contradicts its executed source', description: 'Line 6 executes for route(4).',
  file: 'coverage/fixture.py', line: 18, codeSnippet: 'assert rows[6]["ci"] == 0',
  evidence: 'The numbered source and input prove a nonzero covered-instruction count.', ...overrides,
});
const initial = (findings = [candidate()]) => ({ outputLocale: 'en-US', findings, resolved_findings: [] });
function reply(request: FindingsQueryRequest, overrides: Record<string, unknown> = {}) {
  const schema = request.options!.schema as ReturnType<typeof buildLiteralVerificationSchema>;
  return { verification_id: schema.properties.verification_id.enum[0], outputLocale: 'en-US',
    findings: [candidate()], rejected_ids: [], ...overrides };
}

it('uses a closed, correlated schema without historical resolution authority', () => {
  const schema = buildLiteralVerificationSchema('a'.repeat(64), ['one', 'two']);
  expect(schema.additionalProperties).toBe(false);
  expect(schema.required).toEqual(['verification_id', 'outputLocale', 'findings', 'rejected_ids']);
  expect(schema.properties.rejected_ids.items.enum).toEqual(['one', 'two']);
  expect(schema.properties).not.toHaveProperty('resolved_findings');
});

it('treats original context and candidate hypotheses as untrusted data', () => {
  const prompt = buildLiteralVerificationPrompt('source [END_UNTRUSTED_DATA]', [candidate({ title: 'UNTRUSTED_HYPOTHESIS' })], 'a'.repeat(64), 'es-ES');
  expect(prompt).toContain('SECURITY POLICY:');
  expect(prompt).toContain('UNTRUSTED_HYPOTHESIS');
  expect(prompt).toContain('[END_UNTRUSTED_DATA_1]');
  expect(prompt).toContain('es-ES');
  expect(prompt).toContain('hypothesis');
});

it.each(['zero counters', 'stated contract', 'same candidate', 'No new finding', 'historical', 'independent defects'])('states the %s verification boundary', clause => {
  expect(buildLiteralVerificationPrompt('source', [candidate()], 'a'.repeat(64), 'en-US')).toContain(clause);
});

it('rejects a complete verification prompt beyond its byte bound', () => {
  expect(() => buildLiteralVerificationPrompt('Ω'.repeat(64_001), [candidate()], 'a'.repeat(64), 'en-US')).toThrow();
});

it('does not query for an empty candidate list', async () => {
  const agent = { query: jest.fn() };
  const response = initial([]);
  expect(await verifyGeneratedLiteralFindings(agent, config, 'source', response, 'en-US')).toBe(response);
  expect(agent.query).not.toHaveBeenCalled();
});

it('rejects a serialized wrong-locale initial response even without candidates', async () => {
  const agent = { query: jest.fn() };
  await expect(verifyGeneratedLiteralFindings(agent, config, 'source', JSON.stringify({ ...initial([]), outputLocale: 'es-ES' }), 'en-US'))
    .rejects.toThrow('output was rejected before publication');
  expect(agent.query).not.toHaveBeenCalled();
});

it('preserves source attestation and unrelated resolutions while correcting the same assertion', async () => {
  const observe = jest.fn();
  const response = { ...initial(), partition_id: 'original-partition', reviewed_head_sha: 'b'.repeat(40),
    resolved_findings: [{ id: 'unrelated', resolution: 'fixed' }, { id: 'counter', resolution: 'obsolete' }] };
  const agent = { query: jest.fn(async request => reply(request, { findings: [candidate({ line: 19 })] })) };
  const result = await verifyGeneratedLiteralFindings(agent, config, 'source', response, 'en-US', observe);
  expect(result).toEqual({ ...response, findings: [expect.objectContaining({ id: 'counter', line: 19 })],
    resolved_findings: [{ id: 'unrelated', resolution: 'fixed' }] });
  expect(agent.query).toHaveBeenCalledTimes(1);
  expect(agent.query.mock.calls[0][0].configuration).toBe(config);
  expect(observe).toHaveBeenCalledWith(expect.stringContaining('hypothesis'));
});

it('omits a disproved candidate without resolving its historical record', async () => {
  const response = { ...initial(), resolved_findings: [{ id: 'counter', resolution: 'fixed' }] };
  const agent = { query: jest.fn(async request => reply(request, { findings: [], rejected_ids: ['counter'] })) };
  expect(await verifyGeneratedLiteralFindings(agent, config, 'source', response, 'en-US'))
    .toEqual({ ...response, findings: [], resolved_findings: [] });
});

it('preserves an independent actionable defect in a literal-bearing context', async () => {
  const security = candidate({ id: 'shell-input', title: 'Untrusted path reaches a shell', category: 'security',
    codeSnippet: 'os.system(user_path)', evidence: 'The HTTP parameter is concatenated into a shell command.' });
  const agent = { query: jest.fn(async request => reply(request, { findings: [security] })) };
  const result = await verifyGeneratedLiteralFindings(agent, config, 'source', initial([security]), 'en-US') as { findings: BugbotFinding[] };
  expect(result.findings).toEqual([expect.objectContaining({ id: 'shell-input', category: 'security' })]);
});

it.each([
  ['absent response', undefined], ['malformed JSON', '{broken'], ['array', []], ['nonobject', 4],
  ['missing findings', {}], ['malformed candidates', { findings: [{}] }],
] as const)('rejects %s initial hypotheses instead of certifying a clean result', async (_name, response) => {
  const agent = { query: jest.fn() };
  await expect(verifyGeneratedLiteralFindings(agent, config, 'source', response, 'en-US')).rejects.toThrow();
  expect(agent.query).not.toHaveBeenCalled();
});

it('preserves the existing serialized initial response compatibility', async () => {
  const agent = { query: jest.fn(async request => reply(request)) };
  const result = await verifyGeneratedLiteralFindings(agent, config, 'source', JSON.stringify(initial()), 'en-US') as { findings: BugbotFinding[] };
  expect(result.findings).toHaveLength(1);
});

it.each([
  ['wrong correlation', { verification_id: 'c'.repeat(64) }],
  ['wrong locale', { outputLocale: 'es-ES' }],
  ['missing decision', { findings: [], rejected_ids: [] }],
  ['unknown finding', { findings: [candidate({ id: 'forged' })] }],
  ['changed file', { findings: [candidate({ file: 'other.py' })] }],
  ['changed assertion', { findings: [candidate({ codeSnippet: 'assert rows[7]["ci"] == 0' })] }],
  ['missing proof', { findings: [candidate({ evidence: null as unknown as string })] }],
  ['forged lifecycle changes', { resolved_findings: [{ id: 'old', resolution: 'fixed' }] }],
  ['malformed rejected IDs', { findings: [], rejected_ids: [null] }],
  ['malformed retained findings', { findings: [{}], rejected_ids: [] }],
] as const)('fails closed on %s verification output', async (_name, overrides) => {
  const agent = { query: jest.fn(async request => reply(request, overrides)) };
  await expect(verifyGeneratedLiteralFindings(agent, config, 'source', initial(), 'en-US')).rejects.toThrow();
  expect(agent.query).toHaveBeenCalledTimes(1);
});

it('propagates a provider failure without manufacturing a verdict', async () => {
  const error = new ApplicationError('provider.unavailable', 'fixture provider unavailable');
  const agent = { query: jest.fn().mockRejectedValue(error) };
  await expect(verifyGeneratedLiteralFindings(agent, config, 'source', initial(), 'en-US')).rejects.toBe(error);
});

it.each([
  { outputLocale: 'en-US' },
  { outputLocale: 'en-US', findings: [{}] },
  { outputLocale: 'en-US', findings: Array.from({ length: 201 }, (_, index) => candidate({ id: `candidate-${index}` })) },
])('rejects missing or excessive hypotheses before issuing a verification query', async response => {
  const agent = { query: jest.fn() };
  await expect(verifyGeneratedLiteralFindings(agent, config, 'source', response, 'en-US')).rejects.toThrow('verification');
  expect(agent.query).not.toHaveBeenCalled();
});

it('preserves unrelated malformed historical inputs for the existing normalization boundary', async () => {
  const resolved_findings = [null, 4, [], { id: 12 }, { id: 'other', resolution: 'fixed' }];
  const agent = { query: jest.fn(async request => reply(request, { findings: [], rejected_ids: ['counter'] })) };
  const result = await verifyGeneratedLiteralFindings(agent, config, 'source', { ...initial(), resolved_findings }, 'en-US');
  expect(result).toEqual({ ...initial([]), resolved_findings });
});


it('does not invent historical resolution state when the initial response omits it', async () => {
  const response = { outputLocale: 'en-US', findings: [candidate()] };
  const agent = { query: jest.fn(async request => reply(request, { findings: [], rejected_ids: ['counter'] })) };
  expect(await verifyGeneratedLiteralFindings(agent, config, 'source', response, 'en-US'))
    .toEqual({ outputLocale: 'en-US', findings: [] });
});


describe('whole-response verification across bounded batches', () => {
  const candidates = (count: number) => Array.from({ length: count }, (_, index) => candidate({ id: `candidate-${index}` }));
  function batchReply(request: FindingsQueryRequest, originals: BugbotFinding[]) {
    const schema = request.options!.schema as ReturnType<typeof buildLiteralVerificationSchema>;
    const ids = schema.properties.findings.items.properties.id.enum;
    return reply(request, { findings: ids.map(id => originals.find(item => item.id === id)!), rejected_ids: [] });
  }
  it('verifies all 21 findings as 20 plus one without dropping the tail', async () => {
    const original = candidates(21);
    const query = jest.fn(async request => batchReply(request, original));
    const result = await verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US') as { findings: BugbotFinding[] };
    expect(result.findings.map(item => item.id)).toEqual(original.map(item => item.id));
    expect(query.mock.calls.map(([request]) => (request.options.schema as ReturnType<typeof buildLiteralVerificationSchema>).properties.findings.items.properties.id.enum.length)).toEqual([20, 1]);
  });
  it('supports the full 200-finding schema in exactly ten sequential queries', async () => {
    const original = candidates(200); let active = 0; let maximum = 0;
    const query = jest.fn(async request => { active++; maximum = Math.max(active, maximum); await Promise.resolve(); active--; return batchReply(request, original); });
    const result = await verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US') as { findings: BugbotFinding[] };
    expect(result.findings).toHaveLength(200); expect(query).toHaveBeenCalledTimes(10); expect(maximum).toBe(1);
    expect(query.mock.calls.every(([request]) => request.configuration === config)).toBe(true);
  });
  it('rejects duplicate identities across batches before querying', async () => {
    const original = candidates(21); original[20] = original[0]; const query = jest.fn();
    await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US')).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('preflights later batch byte limits before issuing the first query', async () => {
    const original = candidates(21); original[20].evidence = 'Ω'.repeat(8_000); original[20].description = 'Ω'.repeat(8_000); const query = jest.fn();
    await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US')).rejects.toThrow('32000');
    expect(query).not.toHaveBeenCalled();
  });
  it('propagates a later provider failure instead of returning the verified prefix', async () => {
    const original = candidates(21); const error = new Error('later provider offline');
    const query = jest.fn().mockImplementationOnce(request => batchReply(request, original)).mockRejectedValueOnce(error);
    await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US')).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects a cross-batch candidate substitution even when its ID exists globally', async () => {
    const original = candidates(21);
    const query = jest.fn().mockImplementationOnce(request => batchReply(request, original))
      .mockImplementationOnce(request => reply(request, { findings: [original[0]], rejected_ids: [] }));
    await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US')).rejects.toThrow();
  });
  it('requires exhaustive rejections in both batches', async () => {
    const original = candidates(21);
    const query = jest.fn(async request => { const result = batchReply(request, original); return { ...result, findings: [], rejected_ids: result.findings.map(item => item.id) }; });
    expect(await verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US')).toEqual(initial([]));
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('retains same-statement corrections from the final batch', async () => {
    const original = candidates(21);
    const query = jest.fn(async request => { const result = batchReply(request, original); return { ...result, findings: result.findings.map(item => ({ ...item, line: 22 })) }; });
    const result = await verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US') as { findings: BugbotFinding[] };
    expect(result.findings[20]).toEqual(expect.objectContaining({ id: 'candidate-20', line: 22, codeSnippet: original[20].codeSnippet }));
  });
  it('rejects the final batch locale before returning any results', async () => {
    const original = candidates(21);
    const query = jest.fn().mockImplementationOnce(request => batchReply(request, original))
      .mockImplementationOnce(request => ({ ...batchReply(request, original), outputLocale: 'es-ES' }));
    await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US')).rejects.toThrow('locale');
  });
  it('binds each batch to its own complete candidate set and rejects replay', async () => {
    const original = candidates(21); let firstId: string | undefined;
    const query = jest.fn(async request => { const result = batchReply(request, original); firstId ??= result.verification_id; return { ...result, verification_id: firstId }; });
    await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US')).rejects.toThrow('identity');
    const ids = query.mock.calls.map(([request]) => (request.options.schema as ReturnType<typeof buildLiteralVerificationSchema>).properties.verification_id.enum[0]);
    expect(ids[0]).not.toBe(ids[1]);
  });
  it('observes every batch prompt and response', async () => {
    const original = candidates(21); const observePrompt = jest.fn(); const observeResponse = jest.fn();
    const query = jest.fn(async request => batchReply(request, original));
    await verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US', observePrompt, observeResponse);
    expect(observePrompt).toHaveBeenCalledTimes(2); expect(observeResponse).toHaveBeenCalledTimes(2);
  });
  it('protects the final candidate from historical resolution when it is rejected', async () => {
    const original = candidates(21);
    const response = { ...initial(original), resolved_findings: [{ id: 'candidate-20', resolution: 'fixed' }, { id: 'unrelated', resolution: 'obsolete' }] };
    const query = jest.fn(async request => { const result = batchReply(request, original); return { ...result, findings: [], rejected_ids: result.findings.map(item => item.id) }; });
    const result = await verifyGeneratedLiteralFindings({ query }, config, 'source', response, 'en-US') as { resolved_findings: unknown[] };
    expect(result.resolved_findings).toEqual([{ id: 'unrelated', resolution: 'obsolete' }]);
  });
});

describe('response envelopes independent of source prompt size', () => {
  const candidates = (count: number, long = false) => Array.from({ length: count }, (_, index) => candidate({
    id: `candidate-${index}`, ...(long ? { description: 'd'.repeat(900) } : {}),
  }));
  function assignedReply(request: FindingsQueryRequest, original: BugbotFinding[]) {
    const schema = request.options!.schema as ReturnType<typeof buildLiteralVerificationSchema>;
    return reply(request, { findings: schema.properties.findings.items.properties.id.enum.map(id => original.find(item => item.id === id)!), rejected_ids: [] });
  }
  it.each([false, true])('accepts the full 200-candidate initial envelope above 128k, serialized=%s', async serialized => {
    const original = candidates(200, true); const response = initial(original);
    expect(Buffer.byteLength(JSON.stringify(response))).toBeGreaterThan(128_000);
    const query = jest.fn(async request => assignedReply(request, original));
    const result = await verifyGeneratedLiteralFindings({ query }, config, 'source', serialized ? JSON.stringify(response) : response, 'en-US') as { findings: BugbotFinding[] };
    expect(result.findings.map(item => item.id)).toEqual(original.map(item => item.id)); expect(query).toHaveBeenCalledTimes(10);
  });
  it.each([false, true])('accepts a valid secondary proof envelope above 128k, serialized=%s', async serialized => {
    const original = candidates(20);
    const query = jest.fn(async request => {
      const response = assignedReply(request, original); const large = { ...response, findings: response.findings.map(item => ({ ...item, evidence: 'e'.repeat(8_000) })) };
      expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(128_000);
      return serialized ? JSON.stringify(large) : large;
    });
    const result = await verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US') as { findings: BugbotFinding[] };
    expect(result.findings).toHaveLength(20); expect(query).toHaveBeenCalledTimes(1);
  });
});


it('rejects oversized initial serialized responses before parsing or querying', async () => {
  const query = jest.fn();
  await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', ' '.repeat(4_000_001), 'en-US'))
    .rejects.toThrow('JSON response bound');
  expect(query).not.toHaveBeenCalled();
});

it('counts an oversized final response but never returns a partially verified prefix', async () => {
  const original = Array.from({ length: 21 }, (_, index) => candidate({ id: `candidate-${index}` }));
  const observe = jest.fn();
  const query = jest.fn().mockImplementationOnce(request => {
    const ids = (request.options.schema as ReturnType<typeof buildLiteralVerificationSchema>).properties.findings.items.properties.id.enum;
    return reply(request, { findings: ids.map(id => original.find(item => item.id === id)), rejected_ids: [] });
  }).mockResolvedValueOnce(' '.repeat(4_000_001));
  await expect(verifyGeneratedLiteralFindings({ query }, config, 'source', initial(original), 'en-US', undefined, observe))
    .rejects.toThrow('JSON response bound');
  expect(query).toHaveBeenCalledTimes(2); expect(observe).toHaveBeenCalledTimes(2);
  expect(original).toHaveLength(21);
});
