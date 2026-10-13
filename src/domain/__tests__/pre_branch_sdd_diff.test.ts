import { compareSddStructure } from '../pre_branch_sdd_diff';

describe('bounded structural SDD comparisons', () => {
  it('reports zero content changes for identical documents and ignores CRLF/terminal newline markers', () => {
    expect(compareSddStructure('## Scope\r\nsame\r\n', '## Scope\nsame')).toEqual({
      state: 'compared', addedLines: 0, removedLines: 0, sections: [], omittedSections: 0,
    });
  });
  it('counts inserted content and names its actual current section', () => {
    expect(compareSddStructure('## Scope\nold\n', '## Scope\nold\nnew\n')).toEqual({
      state: 'compared', addedLines: 1, removedLines: 0, sections: ['Scope'], omittedSections: 0,
    });
  });
  it('retains removed sections as structural evidence without inventing a current title', () => {
    expect(compareSddStructure('## Scope\nold\n## Removed\nremoved\n', '## Scope\nold\n')).toEqual({
      state: 'compared', addedLines: 0, removedLines: 2, sections: ['Removed'], omittedSections: 0,
    });
  });
  it('uses an exact subsequence for reordered and repeated lines instead of positional estimates', () => {
    expect(compareSddStructure('a\nx\nb\nx\nc', 'b\nx\na\nx\nc')).toMatchObject({ state: 'compared', addedLines: 2, removedLines: 2 });
  });
  it('handles empty documents without counting an imaginary empty line', () => {
    expect(compareSddStructure('', 'new\n')).toMatchObject({ state: 'compared', addedLines: 1, removedLines: 0 });
    expect(compareSddStructure('old\n', '')).toMatchObject({ state: 'compared', addedLines: 0, removedLines: 1 });
  });
  it('rejects overlong documents before computing or returning partial counts', () => {
    expect(compareSddStructure('x'.repeat(70_001), 'ok')).toEqual({ state: 'bounded', reason: 'characters' });
    expect(compareSddStructure('ok', 'x'.repeat(70_001))).toEqual({ state: 'bounded', reason: 'characters' });
  });
  it('accepts bounded Unicode text and exactly 2000 content lines', () => {
    const text = Array.from({ length: 2000 }, (_, index) => `á-${index}`).join('\n');
    expect(compareSddStructure(text, text)).toMatchObject({ state: 'compared', addedLines: 0, removedLines: 0 });
  });
  it('rejects 2001 lines without reporting approximate changes', () => {
    expect(compareSddStructure('a\n'.repeat(2001), 'same')).toEqual({ state: 'bounded', reason: 'lines' });
  });
  it('stops at the fixed comparison-work ceiling without a quadratic trace or partial counts', () => {
    const before = Array.from({ length: 1500 }, (_, index) => `before-${index}`).join('\n');
    const after = Array.from({ length: 1500 }, (_, index) => `after-${index}`).join('\n');
    expect(compareSddStructure(before, after)).toEqual({ state: 'bounded', reason: 'work' });
  });
  it('limits touched titles to eight, bounds text and discloses omitted titles', () => {
    const before = Array.from({ length: 10 }, (_, index) => `## Section ${index}\nold`).join('\n');
    const after = Array.from({ length: 10 }, (_, index) => `## Section ${index}\nnew`).join('\n');
    expect(compareSddStructure(before, after)).toEqual({ state: 'compared', addedLines: 10, removedLines: 10,
      sections: Array.from({ length: 8 }, (_, index) => `Section ${index}`), omittedSections: 2 });
    const long = compareSddStructure('', `## ${'x'.repeat(119)}😀\nbody`);
    expect(long.state === 'compared' && long.sections[0]).toHaveLength(119);
  });
  it('treats fenced headings as code and neutralizes controls in genuine changed titles', () => {
    expect(compareSddStructure('', '```markdown\n## Fake\n```')).toMatchObject({ state: 'compared', sections: [] });
    expect(compareSddStructure('', '## Safe\u202e heading\nbody')).toMatchObject({ state: 'compared', sections: ['Safe  heading'] });
  });
});


describe('Markdown fence boundaries in SDD section names', () => {
  it('keeps headings inside a code block when an apparent closer has trailing text', () => {
    expect(compareSddStructure('', '```markdown\ncode\n```not-a-closer\n## Fake'))
      .toMatchObject({ state: 'compared', sections: [] });
  });
  it('does not close a longer fence with a short fence or a different fence character', () => {
    expect(compareSddStructure('', '````markdown\ncode\n```\n~~~\n## Fake'))
      .toMatchObject({ state: 'compared', sections: [] });
  });
  it('accepts a longer whitespace-only closer and discovers the following real section', () => {
    expect(compareSddStructure('', '~~~markdown\n## Fake\n~~~~ \t\n## Real\nbody'))
      .toMatchObject({ state: 'compared', sections: ['Real'] });
  });
  it('does not open a backtick code fence with backticks in its info string', () => {
    expect(compareSddStructure('', '```invalid`info\n## Real\nbody'))
      .toMatchObject({ state: 'compared', sections: ['Real'] });
  });
});


describe('honest bounded comparison failures', () => {
  it('reports the byte ceiling for excessive UTF-8 documents before a competing character ceiling', () => {
    expect(compareSddStructure('界'.repeat(93_334), 'ok')).toEqual({ state: 'bounded', reason: 'bytes' });
    expect(compareSddStructure('ok', '界'.repeat(93_334))).toEqual({ state: 'bounded', reason: 'bytes' });
  });
  it('enforces the line ceiling on the current publication independently from the first document', () => {
    expect(compareSddStructure('same', 'a\n'.repeat(2001))).toEqual({ state: 'bounded', reason: 'lines' });
  });
  it('propagates unexpected computation failure rather than claiming a work-limit outcome or guessed counts', () => {
    const original = jest.spyOn(Math, 'max').mockImplementationOnce(() => { throw new Error('Computation unavailable'); });
    try { expect(() => compareSddStructure('a\nb', 'x\ny')).toThrow('Computation unavailable'); }
    finally { original.mockRestore(); }
  });
});
