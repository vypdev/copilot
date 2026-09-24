interface PatDocumentationPolicy {
  hasAdjacentInspectedPatPrerequisite(source: string, codeBlockStart: number): boolean;
  findShellExamples(source: string): Array<{ start: number; body: string }>;
  publicPatDocumentationSources(readme: string, docsByFile: ReadonlyMap<string, string>): Map<string, string>;
  findUnsafePatShellExamples(sources: ReadonlyMap<string, string>, acknowledgement: string): Array<{ file: string; line: number }>;
}

const { findShellExamples, hasAdjacentInspectedPatPrerequisite, publicPatDocumentationSources, findUnsafePatShellExamples } = require('../../../scripts/documentation_pat_exception_policy.cjs') as PatDocumentationPolicy;

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

  it.each(['```', '~~~'])('does not accept prerequisite text inside a %s code fence', marker => {
    const source = `${marker}text\n${exactPrerequisite}\n${marker}\n\n${command}`;
    expect(hasAdjacentInspectedPatPrerequisite(source, source.lastIndexOf('```bash'))).toBe(false);
  });

  it('accepts a real adjacent prose paragraph after an earlier fenced example', () => {
    const source = `~~~text\nUnrelated example\n~~~\n\n${exactPrerequisite}\n\n${command}`;
    expect(hasAdjacentInspectedPatPrerequisite(source, source.indexOf('```bash'))).toBe(true);
  });

  it('rejects an apparent shell block nested inside an unclosed fence', () => {
    const source = `~~~~text\n${exactPrerequisite}\n\n${command}`;
    expect(hasAdjacentInspectedPatPrerequisite(source, source.indexOf('```bash'))).toBe(false);
  });

  it('enumerates an indented exceptional shell example and rejects it without adjacent prose', () => {
    const source = `<Steps>\n    \`\`\`bash\n    copilot setup --confirm-unverifiable-write-permissions\n    \`\`\`\n</Steps>`;
    const examples = findShellExamples(source);
    expect(examples).toHaveLength(1);
    expect(examples[0].body).toContain('--confirm-unverifiable-write-permissions');
    expect(hasAdjacentInspectedPatPrerequisite(source, examples[0].start)).toBe(false);
  });

  it('rejects prerequisite words inside an earlier indented fence', () => {
    const source = `    ~~~text\n    ${exactPrerequisite}\n    ~~~\n\n    \`\`\`bash\n    copilot setup --confirm-unverifiable-write-permissions\n    \`\`\``;
    const examples = findShellExamples(source);
    expect(examples).toHaveLength(1);
    expect(hasAdjacentInspectedPatPrerequisite(source, examples[0].start)).toBe(false);
  });

  it('accepts an indented shell example after a real adjacent prerequisite', () => {
    const source = `    ${exactPrerequisite}\n\n    \`\`\`sh\n    copilot setup --confirm-unverifiable-write-permissions\n    \`\`\``;
    const examples = findShellExamples(source);
    expect(examples).toHaveLength(1);
    expect(hasAdjacentInspectedPatPrerequisite(source, examples[0].start)).toBe(true);
  });

  it('does not skip a shell example when closing indentation differs', () => {
    const source = `    \`\`\`bash\ncopilot setup --confirm-unverifiable-write-permissions\n  \`\`\``;
    expect(findShellExamples(source)).toEqual([{
      start: 0,
      body: expect.stringContaining('--confirm-unverifiable-write-permissions'),
    }]);
  });

  it('inspects an exceptional shell fence even when its closing marker is missing', () => {
    const source = '    ```bash\n    copilot setup --confirm-unverifiable-write-permissions';
    const examples = findShellExamples(source);
    expect(examples).toHaveLength(1);
    expect(examples[0].body).toContain('--confirm-unverifiable-write-permissions');
    expect(hasAdjacentInspectedPatPrerequisite(source, examples[0].start)).toBe(false);
  });

  it('reports an unsafe README example with its repository-relative filename and line', () => {
    const sources = publicPatDocumentationSources(`# Setup\n\n${command}`, new Map([
      ['how-to-use.mdx', '# No exception here'],
    ]));
    expect(findUnsafePatShellExamples(sources, '--confirm-unverifiable-write-permissions'))
      .toEqual([{ file: 'README.md', line: 3 }]);
  });

  it('accepts an inspected README example but still scans MDX for unsafe examples', () => {
    const sources = publicPatDocumentationSources(`${exactPrerequisite}\n\n${command}`, new Map([
      ['how-to-use.mdx', `# Setup\n\n${command}`],
    ]));
    expect(findUnsafePatShellExamples(sources, '--confirm-unverifiable-write-permissions'))
      .toEqual([{ file: 'how-to-use.mdx', line: 3 }]);
  });
});
