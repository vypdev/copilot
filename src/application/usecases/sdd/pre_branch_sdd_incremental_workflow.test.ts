import { draftIncrementalSdd, assembleAndValidateSdd } from './pre_branch_sdd_incremental_workflow';
import { allocateSddRequirementIds, explicitSddObligations, mergeSddInventory, planSddUnits } from '../../../domain/sdd_incremental_plan';
import { SddDraftFormatFailure } from '../../../domain/pre_branch_sdd';
import { sddBytes, SDD_RESOURCES } from '../../../domain/sdd_resource_budget';
import { reservedSddRequirements, validateSddDraftConsistency } from '../../../domain/sdd_draft_consistency';
import { sddConsistencyFixture } from '../../../testing/sdd_consistency_fixture';

const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments',
  reason: 'Keep the baseline and document the resolved delta.', questions: [] } as const;
const inventory = { files: new Set([plan.path, 'docs/payments.mdx']), directories: new Set(['docs', 'specs']), blocked: new Set<string>() };

function fixture(count: number): string {
  const rows = Array.from({ length: count }, (_, index) => '| impact-C' + (index + 1)
    + ' | Functional | PAY-01 | Verify independent scenario ' + (index + 1) + ' and retain the agreed behavior. |').join('\n');
  return '# Authoritative decisions\n\n| Requirement | Behavior |\n|---|---|\n| PAY-01 | Keep all resolved scenarios observable. |'
    + '\n\n| Case ID | Area | Requirements | Scenario |\n|---|---|---|---|\n' + rows
    + '\n\n| Path | Change |\n|---|---|\n| docs/payments.mdx | update |\n';
}

function reply(prompt: string): Record<string, unknown> {
  const unitId = /Return only the JSON for unit ([a-z]+-\d+)\./u.exec(prompt)![1];
  if (unitId.startsWith('inventory-')) return { unitId, requirements: [], cases: [], paths: [] };
  const numbers = prompt.split('Draft the body only for these numbered sections: ')[1].split('. Return all')[0]
    .split('; ').map(heading => Number(heading.split('.')[0]));
  return { unitId, sections: numbers.map(section => ({ section,
    body: 'Explain the resolved feature behavior and its observable outcomes. '.repeat(5) })) };
}

function run(inputs: readonly string[], query: jest.Mock, validate = jest.fn(async (markdown: string) => {
  validateSddDraftConsistency(markdown, [], inventory, plan.path);
})) {
  return draftIncrementalSdd({
    agent: { query }, configuration: { provider: 'codex', model: 'test-model' }, plan, issueNumber: 42, baseSha: 'a'.repeat(40),
    title: 'Payments', context: 'Immutable source contract.', inputs, explicit: explicitSddObligations(inputs), repositoryInventory: inventory, validate,
  });
}

describe('bounded incremental SDD drafting (#763)', () => {
  it('preserves exact Unicode source boundaries and admits each byte only once', () => {
    const input = '界'.repeat(8_001) + '😀' + ' Last resolved decision.';
    const schedule = planSddUnits([input]);
    expect(schedule.inventory.map(unit => unit.text).join('')).toBe(input);
    expect(schedule.inventory.every(unit => sddBytes(unit.text) <= SDD_RESOURCES.sourceSliceBytes)).toBe(true);
    expect(schedule.prose.flatMap(unit => unit.sections)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('assembles all 1,024 exact cases, path operations and reciprocal links into a valid artifact above 70,000 characters', async () => {
    const inputs = [fixture(1_024)];
    const query = jest.fn(async ({ prompt }) => reply(prompt));
    const result = await run(inputs, query);
    expect(result.length).toBeGreaterThan(70_000);
    expect(result).toContain('| Total | 1024 |');
    expect(result).toContain('| docs/payments.mdx | update |');
    const cases = Array.from({ length: 1024 }, (_, i) => 'impact-C' + (i + 1));
    expect(result).toContain('| PAY-01 | ' + cases.join(', ') + ' |');
    expect(result).toContain('| impact-C1024 | Functional | PAY-01 | Verify independent scenario 1024 and retain the agreed behavior. |');
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls[0][0].prompt).toContain('Canonical cases table: 1024 rows retained by the host.');
    expect(query.mock.calls[0][0].prompt).not.toContain('Verify independent scenario 1024');
    expect(query.mock.calls.every(([request]) => request.sourceSnapshot.baseSha === 'a'.repeat(40))).toBe(true);
  });

  it('does not allow a seed to replace the scenario of an admitted case with the same ID', async () => {
    const seed = sddConsistencyFixture('impact', plan.path, 'update').replace(/impact-C01/gu, 'impact-C1');
    const explicit = explicitSddObligations([fixture(1)]);
    const writer = jest.fn();
    await expect(assembleAndValidateSdd(seed, plan, explicit, writer)).rejects.toMatchObject({ reason: 'requirement-mapping' });
    expect(writer).not.toHaveBeenCalled();
  });

  it('spends one repair across distinct units and never includes rejected text in the replacement prompt', async () => {
    const query = jest.fn(async ({ prompt }) => reply(prompt))
      .mockResolvedValueOnce({ unitId: 'forged', private: 'PRIVATE REJECTED WITNESS' })
      .mockImplementationOnce(async ({ prompt }) => reply(prompt))
      .mockResolvedValueOnce({ unitId: 'prose-1', sections: [{ section: 1, body: '## Forged boundary' }] });
    const writer = jest.fn();
    await expect(run([fixture(3)], query, writer)).rejects.toMatchObject({ attempts: 2 });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0].prompt).not.toContain('PRIVATE REJECTED WITNESS');
    expect(writer).not.toHaveBeenCalled();
  });

  it('replaces the inventory unit owning a writer-rejected row without redrafting accepted prose', async () => {
    const query = jest.fn(async ({ prompt }) => reply(prompt))
      .mockResolvedValueOnce({ unitId: 'inventory-1', requirements: [], cases: [], paths: [['docs/missing.md', 'update']] });
    const writer = jest.fn(async (markdown: string) => validateSddDraftConsistency(markdown, [], inventory, plan.path));
    const result = await run([fixture(2)], query, writer);
    expect(result).not.toContain('docs/missing.md');
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[6][0].prompt).toContain('Return only the JSON for unit inventory-1.');
    expect(query.mock.calls[6][0].prompt).not.toContain('docs/missing.md');
    expect(writer).toHaveBeenCalledTimes(2);
  });

  it('repairs only the prose unit that invents a case range', async () => {
    const query = jest.fn(async ({ prompt }) => reply(prompt))
      .mockImplementationOnce(async ({ prompt }) => reply(prompt))
      .mockImplementationOnce(async ({ prompt }) => {
        const valid = reply(prompt);
        const sections = valid.sections as { section: number; body: string }[];
        sections[0].body += '\n\nRun cases C01–C03.';
        return valid;
      });
    const result = await run([fixture(3)], query);
    expect(result).not.toContain('C01–C03');
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[2][0].prompt).toContain('Return only the JSON for unit prose-1.');
    expect(query.mock.calls[2][0].prompt).toContain('case-shorthand');
    expect(query.mock.calls[2][0].prompt).not.toContain('C01–C03');
  });

  it('repairs a root-relative repository link in prose and keeps the exact path in host navigation', async () => {
    const query = jest.fn(async ({ prompt }) => reply(prompt))
      .mockImplementationOnce(async ({ prompt }) => reply(prompt))
      .mockImplementationOnce(async ({ prompt }) => {
        const valid = reply(prompt);
        const sections = valid.sections as { section: number; body: string }[];
        sections[0].body += '\n\nSee [the payment guide](docs/payments.mdx).';
        return valid;
      });
    const result = await run([fixture(3)], query);
    expect(result).toContain('[docs/payments.mdx](../docs/payments.mdx)');
    expect(result).not.toContain('](docs/payments.mdx)');
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[2][0].prompt).toContain('path-link-reference');
  });

  it.each([
    ['`docs/missing.mdx`', 'path-inline-reference'],
    ['docs/missing.mdx', 'path-prose-reference'],
  ])('checks the immutable tree before accepting a prose unit that cites %s', async (citation, diagnostic) => {
    const query = jest.fn(async ({ prompt }) => reply(prompt)).mockImplementationOnce(async ({ prompt }) => reply(prompt))
      .mockImplementationOnce(async ({ prompt }) => {
        const valid = reply(prompt);
        const sections = valid.sections as { section: number; body: string }[];
        sections[0].body += '\n\nSee ' + citation + '.';
        return valid;
      });
    const result = await run([fixture(3)], query);
    expect(result).not.toContain('docs/missing.mdx');
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[2][0].prompt).toContain('Return only the JSON for unit prose-1.');
    expect(query.mock.calls[2][0].prompt).toContain(diagnostic);
    expect(query.mock.calls[2][0].prompt).not.toContain('docs/missing.mdx');
  });

  it('905: reproduces eight invalid IDs, repairs one unit, and derives reciprocal links for host-assigned IDs', async () => {
    const unit = (id: (n: number) => string) => ({
      unitId: 'inventory-1',
      requirements: Array.from({ length: 8 }, (_, i) => [id(i + 1), 'Verify distinct behavior ' + (i + 1)]),
      cases: Array.from({ length: 8 }, (_, i) => ['inventory-C' + (i + 1), 'Functional', id(i + 1), 'Observe result ' + (i + 1)]),
      paths: [],
    });
    const query = jest.fn(async ({ prompt }) => reply(prompt))
      .mockResolvedValueOnce(unit(n => 'G' + n))
      .mockResolvedValueOnce(unit(n => '@' + n));
    const result = await run([fixture(1)], query);
    expect(query).toHaveBeenCalledTimes(7);
    for (const [request] of query.mock.calls.slice(0, 2)) expect(request.prompt).toContain('Use G-01 or PAY-02, never G01 or G1');
    expect(query.mock.calls[1][0].prompt).toContain('"row":1,"expected":0,"observed":8');
    expect(result).toContain('| SDD-I42-U1-R8 | inventory-C8 |');
    expect(result).toContain('| PAY-01 | impact-C1 |');
    expect(result).not.toContain('@8');
  });

  it('905: reserves canonical identities and assigns the same collision-free ID on replay', () => {
    const unit = { requirements: [['@1', 'New behavior']], cases: [['local-C1', 'Policy', '@1, PAY-01', 'Observe both behaviors']], paths: [] };
    const occupied = new Set(['SDD-I42-U1-R1', 'PAY-01']);
    const first = allocateSddRequirementIds(unit, 42, 1, occupied);
    expect(first).toEqual(allocateSddRequirementIds(unit, 42, 1, occupied));
    expect(first.requirements[0][0]).toBe('SDD-I42-U1-R1-1');
    expect(first.cases[0][2]).toBe('SDD-I42-U1-R1-1, PAY-01');
    expect(allocateSddRequirementIds(unit, 42, 2, occupied).requirements[0][0]).toBe('SDD-I42-U2-R1');
  });

  it.each(['update', 'companion'] as const)('905: %s can reuse a retained definition and rejects a conflicting authorized definition', async action => {
    const ownerPath = plan.path;
    const target = action === 'update' ? ownerPath : 'specs/payment-companion.md';
    const next = { ...plan, action, path: target };
    const previous = sddConsistencyFixture('prior', ownerPath, 'update').replace('## 4.', '### 4.');
    const owners = [{ path: ownerPath, markdown: previous }];
    const seed = sddConsistencyFixture('impact', target, action === 'update' ? 'update' : 'create');
    const repository = { ...inventory, files: new Set([ownerPath, 'docs/payments.mdx']) };
    const writer = jest.fn(async (markdown: string) => validateSddDraftConsistency(markdown, owners, repository, target));
    const actual = explicitSddObligations([seed]);
    const reserved = reservedSddRequirements(owners);
    expect(mergeSddInventory(actual, [], next, reserved).requirements).toEqual(actual.requirements);
    await expect(assembleAndValidateSdd(seed, next, actual, writer)).resolves.toContain('| G-01 | impact-C01, impact-C02 |');
    const changed = seed.replace(actual.requirements[0][1], 'A different meaning at the same identity.');
    await expect(assembleAndValidateSdd(changed, next, explicitSddObligations([changed]), writer)).rejects.toMatchObject({
      diagnostic: { facts: [{ detail: 'requirement-reserved', section: 4, row: 1, expected: 0, observed: 1 }] },
    });
    const malformed = seed.replace(/G-01/gu, 'G01');
    await expect(assembleAndValidateSdd(malformed, next, explicitSddObligations([malformed]), writer)).rejects.toMatchObject({
      diagnostic: { facts: [{ detail: 'identifier-list', section: 4, row: 1, expected: 0, observed: 1 }] },
    });
  });

  it('fails before any provider call when authoritative input exceeds the operation budget', async () => {
    const query = jest.fn();
    await expect(run(['界'.repeat(90_000)], query)).rejects.toMatchObject({ stage: 'input', unit: 'bytes', observed: 270_000 });
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps a malformed artifact distinct from operational byte exhaustion', async () => {
    const writer = jest.fn();
    await expect(assembleAndValidateSdd('界'.repeat(175_000), plan, explicitSddObligations([]), writer))
      .rejects.toMatchObject({ stage: 'assembly', unit: 'bytes', observed: 525_000 });
    const missingHeading = sddConsistencyFixture('impact', plan.path, 'update').replace('## 1. Executive summary', '## 1. Incorrect');
    await expect(assembleAndValidateSdd(missingHeading, plan, explicitSddObligations([]), writer))
      .rejects.toBeInstanceOf(SddDraftFormatFailure);
    expect(writer).not.toHaveBeenCalled();
  });
});
