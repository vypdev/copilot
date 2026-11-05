import { draftIncrementalSdd, assembleAndValidateSdd } from './pre_branch_sdd_incremental_workflow';
import { explicitSddObligations, planSddUnits } from '../../../domain/sdd_incremental_plan';
import { SddDraftFormatFailure } from '../../../domain/pre_branch_sdd';
import { sddBytes, SDD_RESOURCES } from '../../../domain/sdd_resource_budget';
import { validateSddDraftConsistency } from '../../../domain/sdd_draft_consistency';
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
    agent: { query }, configuration: { provider: 'codex', model: 'test-model' }, plan, baseSha: 'a'.repeat(40),
    title: 'Payments', context: 'Immutable source contract.', inputs, explicit: explicitSddObligations(inputs), validate,
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
