import { Parser } from 'commonmark';
import { renderSddFileLinks, renderSddNavigation, validateSddDraftConsistency } from '../sdd_draft_consistency';
import { sddConsistencyFixture } from '../../testing/sdd_consistency_fixture';

const slot = (target: string) => '`{{SDD_FILE_LINK:' + target + '}}`';
const link = (target: string) => '[Review]({{SDD_FILE_LINK:' + target + '}})';
const publication = 'specs/change.md';
const invalid = { reason: 'repository-path' };
const inventory = { files: new Set(['docs/payments.mdx']), directories: new Set(['docs', 'specs']), blocked: new Set<string>() };
// Syntax-only examples declare their target explicitly; native tests below prove existence separately.
function render(input: string, owner = publication, targets: readonly string[] = ['docs/payments.mdx']): string {
  const prefix = '## 15. Documentation\n| Path | Change |\n|---|---|\n'
    + targets.map(target => '| ' + target + ' | reference |').join('\n') + '\n\n';
  return renderSddFileLinks(prefix + input, owner).slice(prefix.length);
}

describe('source-grounded draft file navigation', () => {
  it('sdd-source-grounding-C30: derives same-directory links and preserves prose and literal citations', () => {
    const input = 'Keep `ordinary`. ' + link('specs/owner.md') + ' and ' + slot('specs/owner.md');
    expect(render(input, publication, ['specs/owner.md'])).toBe('Keep `ordinary`. [Review](owner.md) and `specs/owner.md`');
    expect(render('{{SDD_FILE_LINK:docs/payments.mdx}}')).toBe('docs/payments.mdx');
    const declarations = '\n## 15. Documentation\n| Path | Change |\n|---|---|\n| docs/payments.mdx | reference |';
    expect(renderSddFileLinks('{{SDD_FILE_LINK:docs/payments.mdx}}' + declarations, publication))
      .toBe('docs/payments.mdx' + declarations);
  });

  it('sdd-source-grounding-C31: derives exact common-prefix traversal for nested, sibling, root and self targets', () => {
    for (const [owner, target, destination] of [
      ['specs/topic/change.md', 'docs/guide.md', '../../docs/guide.md'],
      ['specs/topic/change.md', 'specs/topic/owner.md', 'owner.md'],
      ['specs/topic/change.md', 'specs/other/owner.md', '../other/owner.md'],
      ['specs/topic/change.md', 'specs/topic/change.md', 'change.md'],
      ['change.md', 'docs/guide.md', 'docs/guide.md'],
      ['specs/topic/change.md', 'specs', '..'],
    ]) expect(render(link(target), owner, [target])).toBe(`[Review](${destination})`);
  });

  it('sdd-source-grounding-C32: preserves a literal special filename and descriptive label while encoding the destination', () => {
    const target = "docs/Café [draft]_~ & !'(a)#%.md";
    const output = render('[Source](<{{SDD_FILE_LINK:' + target + '}}>)', publication, [target]);
    expect(output).toBe('[Source](<../docs/Caf%C3%A9%20%5Bdraft%5D_~%20%26%20%21%27%28a%29%23%25.md>)');
    const doc = sddConsistencyFixture().replace('| docs/payments.mdx | update |', '| docs/payments.mdx | update |\n| ' + target + ' | reference |') + '\n' + output;
    expect(() => validateSddDraftConsistency(doc, [], { ...inventory, files: new Set([...inventory.files, target]) }, publication)).not.toThrow();
  });

  it('sdd-source-grounding-C33: leaves ordinary valid Markdown and fragment navigation unchanged', () => {
    const input = '[Project](../docs/payments.mdx#details) · [Here](#acceptance) · [Issue](https://github.com/owned/fixture/issues/47)';
    expect(render(input)).toBe(input);
  });

  it('sdd-source-grounding-C34: rejects unsafe targets, publication paths and an empty derived destination', () => {
    for (const target of ['', '../secret.md', '/secret.md', 'docs/../secret.md', '.git/config', '.GIT/config',
      'docs\\secret.md', 'https://example.invalid/file.md', 'docs/a?b.md', 'docs/\0secret.md', 'specs']) {
      expect(() => render(link(target))).toThrow(expect.objectContaining(invalid));
    }
    for (const owner of ['', '../specs/change.md', '/specs/change.md']) {
      expect(() => render(link('docs/payments.mdx'), owner)).toThrow(expect.objectContaining(invalid));
    }
  });

  it('sdd-source-grounding-C35: rejects malformed markers and incomplete URL wrappers without guessing', () => {
    for (const input of ['{{sdd_file_link:docs/payments.mdx}}', '{{SDD_FILE_LINK:docs/\npayments.mdx}}',
      '{{SDD_FILE_LINK:unfinished', link('docs/payments.mdx') + ' {{SDD_FILE_LINK:unfinished',
      '[Bad](<' + slot('docs/payments.mdx') + ')', '[Bad](`{{SDD_FILE_LINK:docs/payments.mdx}}``)',
      '[Bad](' + slot('docs/payments.mdx') + '#section)']) {
      expect(() => render(input)).toThrow(expect.objectContaining(invalid));
    }
  });

  it('sdd-source-grounding-C36: renders required UI examples while keeping their targets subject to operative declarations', () => {
    const input = '```md\n' + link('docs/payments.mdx') + '\n```\n<!-- ' + link('docs/payments.mdx') + ' -->\n    ' + link('docs/payments.mdx');
    const output = render(input);
    expect(output).toBe('```md\n[Review](../docs/payments.mdx)\n```\n<!-- [Review](../docs/payments.mdx) -->\n    [Review](../docs/payments.mdx)');
    expect(() => render('```md\n' + link('docs/unknown.md') + '\n```')).toThrow(expect.objectContaining(invalid));
  });

  it('sdd-source-grounding-C37: label and image interpolation never produces nested navigation', () => {
    expect(render('[' + slot('docs/payments.mdx') + '](../docs/payments.mdx)'))
      .toBe('[`docs/payments.mdx`](../docs/payments.mdx)');
    expect(render('![' + slot('docs/payments.mdx') + ']({{SDD_FILE_LINK:docs/payments.mdx}})'))
      .toBe('![`docs/payments.mdx`](../docs/payments.mdx)');
  });

  it('sdd-source-grounding-C38: rejects unencodable targets with closed feedback instead of exposing a URI error', () => {
    try {
      render(link('docs/PRIVATE_\ud800.md'));
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toMatchObject(invalid);
      expect(error).not.toBeInstanceOf(URIError);
      expect(String(error)).not.toContain('PRIVATE_');
    }
  });

  it('sdd-source-grounding-C39: native validation still proves existence, create semantics and literal Path cells', () => {
    const validate = (source: string) => validateSddDraftConsistency(renderSddFileLinks(source, publication), [], inventory, publication);
    expect(() => validate(sddConsistencyFixture() + '\n' + link('docs/payments.mdx'))).not.toThrow();
    expect(() => validate(sddConsistencyFixture() + '\n[Browse](../docs/)')).not.toThrow();
    const future = 'docs/evidence/new.md';
    expect(() => validate(sddConsistencyFixture().replace('| docs/payments.mdx | update |', '| docs/payments.mdx | update |\n| ' + future + ' | create |') + '\n' + link(future))).not.toThrow();
    expect(() => validate(sddConsistencyFixture().replace('| docs/payments.mdx | update |', '| docs/payments.mdx | update |\n| docs/missing.md | reference |') + '\n' + link('docs/missing.md'))).toThrow(expect.objectContaining(invalid));
    expect(() => validate(sddConsistencyFixture() + '\n[Missing](../docs/missing.md)')).toThrow(expect.objectContaining(invalid));
    expect(() => validate(sddConsistencyFixture().replace('| docs/payments.mdx |', '| ' + slot('docs/payments.mdx') + ' |'))).toThrow(expect.objectContaining(invalid));
  });

  it('sdd-source-grounding-C44: whole destinations preserve labels and exact percent/spaces identity with optional quote wrappers', () => {
    const target = 'docs/a b%20.md';
    expect(render('[Literal](<{{SDD_FILE_LINK:' + target + '}}>)', publication, [target])).toBe('[Literal](<../docs/a%20b%2520.md>)');
    expect(render('[Spaced](  ' + slot('docs/payments.mdx') + '  )')).toBe('[Spaced](  ../docs/payments.mdx  )');
    expect(render('[Multiple](``{{SDD_FILE_LINK:docs/payments.mdx}}``)')).toBe('[Multiple](../docs/payments.mdx)');
  });

  it('sdd-source-grounding-C45: every marker needs an operative Path declaration, including inert examples and root filenames', () => {
    for (const input of [slot('package.json'), '<!-- ' + link('docs/unknown.md') + ' -->',
      '```md\n| docs/unknown.md | reference |\n' + link('docs/unknown.md') + '\n```']) {
      expect(() => render(input)).toThrow(expect.objectContaining(invalid));
    }
    expect(render(slot('package.json'), publication, ['package.json'])).toBe('`package.json`');
  });
});


describe('single-inventory SDD navigation', () => {
  const navigation = '{{SDD_FILE_NAVIGATION}}';
  const withNavigation = (source: string, slot = navigation) => source.replace('## 16.', slot + '\n\n## 16.');
  const native = (source: string, files = inventory.files) => validateSddDraftConsistency(
    renderSddNavigation(source, publication), [], { ...inventory, files }, publication);

  it('sdd-source-grounding-C47: projects every literal declaration into native-valid links without repeating or inferring targets', () => {
    const target = 'docs/Café & [draft]`cost$_.md';
    const source = withNavigation(sddConsistencyFixture().replace('| docs/payments.mdx | update |',
      '| docs/payments.mdx | update |\n| ' + target + ' | reference |'), 'Navigation: `' + navigation + '` for review.');
    const output = renderSddNavigation(source, publication);
    expect(output).toContain('| ' + target + ' | reference |');
    expect(output).not.toContain(navigation);
    const links: { destination: string; label: string }[] = [];
    const walker = new Parser().parse(output).walker();
    let event;
    while ((event = walker.next())) {
      if (event.entering && event.node.type === 'link') {
        let label = '', inner;
        const children = event.node.walker();
        while ((inner = children.next())) if (inner.entering && inner.node.type === 'text') label += inner.node.literal;
        links.push({ destination: event.node.destination!, label });
      }
    }
    expect(links.map(item => item.label)).toEqual(['docs/payments.mdx', target, 'specs/change.md']);
    expect(links.map(item => item.destination)).toContain('../docs/Caf%C3%A9%20%26%20%5Bdraft%5D%60cost%24_.md');
    expect(() => native(source, new Set([...inventory.files, target]))).not.toThrow();
    const future = 'docs/proposed/new.md';
    expect(() => native(withNavigation(sddConsistencyFixture().replace('| docs/payments.mdx | update |',
      '| docs/payments.mdx | update |\n| ' + future + ' | create |')))).not.toThrow();
    expect(() => native(withNavigation(sddConsistencyFixture().replace('docs/payments.mdx', 'docs/missing.md'))))
      .toThrow(expect.objectContaining(invalid));
    expect(renderSddNavigation(sddConsistencyFixture(), publication)).toBe(sddConsistencyFixture());
  });

  it('sdd-source-grounding-C48: rejects hidden, duplicate, malformed and nested slots without creating target authority', () => {
    for (const slot of ['<!-- ' + navigation + ' -->', '```md\n' + navigation + '\n```',
      navigation + '\n' + navigation, '[Nested](' + navigation + ')', '``' + navigation + '``',
      '`' + navigation, navigation.toLowerCase(), '{{SDD_FILE_NAVIGATION:unknown}}',
      navigation + '\n{{sdd_file_navigation}}']) {
      expect(() => renderSddNavigation(withNavigation(sddConsistencyFixture(), slot), publication))
        .toThrow(expect.objectContaining(invalid));
    }
    expect(() => renderSddNavigation(sddConsistencyFixture() + '\n' + navigation, publication))
      .toThrow(expect.objectContaining(invalid));
    for (const owner of ['', '../specs/change.md']) {
      expect(() => renderSddNavigation(withNavigation(sddConsistencyFixture()), owner)).toThrow(expect.objectContaining(invalid));
    }
    for (const target of ['../PRIVATE_TARGET.md', 'docs/PRIVATE_\ud800.md']) {
      try {
        renderSddNavigation(withNavigation(sddConsistencyFixture().replace('docs/payments.mdx', target)), publication);
        throw new Error('Expected rejection');
      } catch (error) {
        expect(error).toMatchObject(invalid);
        expect(String(error)).not.toContain('PRIVATE');
      }
    }
  });
});
