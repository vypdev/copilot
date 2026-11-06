import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSddDerivedTables } from '../domain/sdd_draft_consistency';

const headings = [...readFileSync(join(__dirname, '../../specs/_template.md'), 'utf8')
  .matchAll(/^## (\d+)\. .+$/gmu)].map(match => ({ number: Number(match[1]), heading: match[0] }));

/** Authored twenty-section control: no consumer source, provider call or runtime acceptance. */
export function sddReferenceFixture(notation: string, paths = [
  ['specs/reference-control.md', 'create'], ['README.md', 'reference'], ['frontend/src/domain/entry.ts', 'create'],
]): string {
  const sections: Record<number, string> = {
    1: notation + '\n' + 'Controlled validator evidence; no application acceptance or consumer execution is claimed. '.repeat(18),
    4: '| Requirement | Behavior |\n|---|---|\n| REF-01 | Distinguish notation and repository evidence without weakening publication checks. |',
    8: 'Pure policy decisions remain separate from Git, publication, providers and presentation.',
    14: '{{SDD_CASE_BUDGET}}\n\n| Case ID | Area | Requirements | Scenario |\n|---|---|---|---|\n| reference-control-C01 | Adapter contracts | REF-01 | Validate the reference against the selected immutable source. |',
    15: '| Path | Change |\n|---|---|\n' + paths.map(([path, operation]) => `| ${path} | ${operation} |`).join('\n'),
    16: 'Format and consistency evidence does not establish application implementation or live consumer recovery.',
    17: '{{SDD_REQUIREMENT_CASES}}',
  };
  return renderSddDerivedTables('# Reference control\n\n- Status: Draft\n- Owners: Maintainers\n\n'
    + headings.map(({ number, heading }) => heading + '\n'
      + (sections[number] ?? 'Not applicable to this isolated validator control; product acceptance remains independent.') + '\n').join('\n'));
}
