interface PatDocumentationPolicy {
  hasAdjacentInspectedPatPrerequisite(source: string, codeBlockStart: number): boolean;
}

const { hasAdjacentInspectedPatPrerequisite } = require('../../../scripts/documentation_pat_exception_policy.cjs') as PatDocumentationPolicy;

const prerequisite = "Run these commands without a permission exception first. Inspect the displayed requirements against both PATs' settings. Only after confirming every required row may you acknowledge that limitation.";
const exactPrerequisite = prerequisite.replace('Inspect', 'inspect');
const command = '```bash\ncopilot setup --confirm-unverifiable-write-permissions\n```';

describe('inspected-PAT documentation exception', () => {
  it('accepts the complete prerequisite in the immediately preceding paragraph', () => {
    const source = `${exactPrerequisite}\n\n${command}`;
    expect(hasAdjacentInspectedPatPrerequisite(source, source.indexOf('```bash'))).toBe(true);
  });

  it('rejects a prerequisite separated from the shell example by unrelated prose', () => {
    const source = `${exactPrerequisite}\n\nA different topic with no permission prerequisite.\n\n${command}`;
    expect(hasAdjacentInspectedPatPrerequisite(source, source.indexOf('```bash'))).toBe(false);
  });

  it('rejects broad keywords without an explicit inspection and confirmation prerequisite', () => {
    const source = `Inspect settings; use this only after thinking about it.\n\n${command}`;
    expect(hasAdjacentInspectedPatPrerequisite(source, source.indexOf('```bash'))).toBe(false);
  });
});
